from flask import Flask, jsonify
from flask_cors import CORS
import csv
from datetime import datetime
from collections import defaultdict
import os
import re
import glob
import json
from PyPDF2 import PdfReader

app = Flask(__name__)
CORS(app)

def _load_categories(filename):
    """Load category definitions from JSON file"""
    filepath = os.path.join(os.path.dirname(__file__), filename)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Warning: {filename} not found. Using default categories.")
        return {}
    except json.JSONDecodeError as e:
        print(f"Error parsing {filename}: {e}. Using default categories.")
        return {}

class BankStatementParser:
    def __init__(self):
        self.transactions = []
        self.account_balances = {}  # Store actual account balances

    def _detect_dkb_account_type(self, lines):
        """Detect DKB account type from file content"""
        # Check first few lines for account type
        for line in lines[:5]:
            if 'Girokonto' in line:
                return 'DKB Girokonto'
            elif 'Tagesgeld' in line:
                return 'DKB Tagesgeld'
        return 'DKB'

    def _extract_dkb_balance(self, lines):
        """Extract current balance from DKB CSV header"""
        for line in lines[:10]:
            if 'Kontostand vom' in line:
                # Line format: "Kontostand vom 19.10.2025:";"2.685,35 €"
                parts = line.split(';')
                if len(parts) >= 2:
                    # Remove quotes, euro symbol, non-breaking spaces, and regular spaces
                    balance_str = parts[1].strip().strip('"').replace('€', '').replace('\xa0', '').strip()
                    # Convert German number format (1.000,00) to float
                    balance_str = balance_str.replace('.', '').replace(',', '.')
                    try:
                        return float(balance_str)
                    except ValueError as e:
                        print(f"Error parsing DKB balance: {e}, string was: {repr(balance_str)}")
                        return None
        return None

    def parse_dkb(self, filepath, account_name=None):
        """Parse DKB German bank statements (EUR)"""
        transactions = []
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            lines = f.readlines()

            # Auto-detect account type if not provided
            if account_name is None:
                account_name = self._detect_dkb_account_type(lines)

            # Extract current balance from header
            balance = self._extract_dkb_balance(lines)
            if balance is not None:
                self.account_balances[account_name] = {
                    'balance': balance,
                    'currency': 'EUR'
                }

            # Find where the actual transaction data starts
            header_idx = None
            for i, line in enumerate(lines):
                if 'Buchungsdatum' in line:
                    header_idx = i
                    break

            if header_idx is None:
                return transactions

            # Parse transactions
            reader = csv.DictReader(lines[header_idx:], delimiter=';')
            for row in reader:
                try:
                    # Parse German date format (DD.MM.YY)
                    date_str = row.get('Buchungsdatum', '').strip()
                    if not date_str:
                        continue

                    date = datetime.strptime(date_str, '%d.%m.%y')

                    # Parse German number format (1.000,00 -> 1000.00)
                    amount_str = row.get('Betrag (€)', '').strip().replace('.', '').replace(',', '.')
                    if not amount_str:
                        continue
                    amount = float(amount_str)

                    # Determine category from recipient/description
                    recipient = row.get('Zahlungsempfänger*in', '')
                    description = row.get('Verwendungszweck', '')
                    category = self._categorize_transaction(recipient, description)

                    transactions.append({
                        'date': date.isoformat(),
                        'amount': amount,
                        'currency': 'EUR',
                        'recipient': recipient,
                        'description': description,
                        'category': category,
                        'type': 'income' if amount > 0 else 'expense',
                        'account': account_name
                    })
                except (ValueError, KeyError) as e:
                    continue

        return transactions

    def parse_yuh(self, filepath):
        """Parse YUH Swiss bank statements (CHF)"""
        transactions = []
        yuh_main_balance = 0
        yuh_goal_balances = defaultdict(float)

        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                try:
                    # Parse date format (DD/MM/YYYY)
                    date_str = row.get('DATE', '').strip()
                    if not date_str:
                        continue

                    date = datetime.strptime(date_str, '%d/%m/%Y')

                    # Determine amount (DEBIT or CREDIT) - only count CHF transactions
                    debit = row.get('DEBIT', '').strip()
                    credit = row.get('CREDIT', '').strip()
                    debit_currency = row.get('DEBIT CURRENCY', '').strip()
                    credit_currency = row.get('CREDIT CURRENCY', '').strip()

                    # Only process CHF transactions for balance calculation
                    if debit and debit_currency == 'CHF':
                        amount = float(debit)
                    elif credit and credit_currency == 'CHF':
                        amount = float(credit)
                    else:
                        # Skip non-CHF transactions (USD, EUR investments, etc.)
                        continue

                    # Get activity details
                    activity_name = row.get('ACTIVITY NAME', '').strip('"')
                    recipient = row.get('RECIPIENT', '').strip('"')
                    locality = row.get('LOCALITY', '').strip('"')

                    # Handle goal deposits and withdrawals for virtual savings accounts
                    activity_type = row.get('ACTIVITY TYPE', '')

                    # Track goal account balances (internal transfers within YUH)
                    if activity_type == 'GOAL_DEPOSIT':
                        # Money moved from main account to goal account
                        # CREDIT column has positive amount
                        goal_name = recipient or locality
                        if goal_name:
                            # Strip quotes from goal name
                            goal_name = goal_name.strip('"')
                            yuh_goal_balances[goal_name] += amount  # add to goal
                            # Don't change main balance - goal deposits are internal transfers
                        continue
                    elif activity_type == 'GOAL_WITHDRAWAL':
                        # Money moved from goal account back to main account
                        # DEBIT column has negative amount
                        goal_name = recipient or locality
                        if goal_name:
                            # Strip quotes from goal name
                            goal_name = goal_name.strip('"')
                            yuh_goal_balances[goal_name] += amount  # subtract from goal (amount is negative)
                            # Don't change main balance - goal withdrawals are internal transfers
                        continue
                    elif activity_type == 'REWARD_RECEIVED':
                        # Skip rewards (these are in different currency - SWQ tokens)
                        continue

                    # All other transactions affect main YUH balance
                    yuh_main_balance += amount

                    category = self._categorize_transaction(recipient or activity_name, locality)

                    transactions.append({
                        'date': date.isoformat(),
                        'amount': amount,
                        'currency': 'CHF',
                        'recipient': recipient or activity_name,
                        'description': f"{activity_name} {locality}".strip(),
                        'category': category,
                        'type': 'income' if amount > 0 else 'expense',
                        'account': 'YUH'
                    })
                except (ValueError, KeyError) as e:
                    continue

        # Calculate total across all goal accounts
        total_goal_balance = sum(yuh_goal_balances.values())

        # YUH main balance = total balance - money locked in goals
        yuh_main_account_balance = yuh_main_balance - total_goal_balance

        # Store YUH main account balance
        self.account_balances['YUH'] = {
            'balance': yuh_main_account_balance,
            'currency': 'CHF'
        }

        # Store YUH goal account balances as virtual accounts
        for goal_name, goal_balance in yuh_goal_balances.items():
            account_name = f'YUH - {goal_name}'
            self.account_balances[account_name] = {
                'balance': goal_balance,
                'currency': 'CHF'
            }

        return transactions

    def parse_viac(self, filepath):
        """Parse VIAC broker statements from PDF files"""
        transactions = []

        try:
            reader = PdfReader(filepath)
            text = ""
            for page in reader.pages:
                text += page.extract_text()

            # Extract key information using regex patterns
            # Date pattern: Basel, DD.MM.YYYY
            date_match = re.search(r'Basel,\s*(\d{2}\.\d{2}\.\d{4})', text)
            if not date_match:
                return transactions

            date_str = date_match.group(1)
            date = datetime.strptime(date_str, '%d.%m.%Y')

            # Extract security name from title "Börsenabrechnung - Kauf [Name]"
            security_match = re.search(r'Börsenabrechnung\s*-\s*Kauf\s+(.+?)(?:\n|Wir haben)', text, re.DOTALL)
            security_name = security_match.group(1).strip() if security_match else 'Unknown'

            # Extract shares: "X.XXX Anteile [Name]"
            # In Swiss format, the decimal point is used for decimals (e.g., 8.008)
            shares_match = re.search(r'(\d+\.\d+)\s+Anteile', text)
            shares = float(shares_match.group(1)) if shares_match else 0

            # Extract ISIN
            isin_match = re.search(r'ISIN:\s*([A-Z0-9]+)', text)
            isin = isin_match.group(1) if isin_match else ''

            # Extract price in USD
            # Swiss format uses apostrophes for thousands and periods for decimals
            price_match = re.search(r'Kurs:\s*USD\s*([\d\'\.]+)', text)
            price_usd = 0
            if price_match:
                price_str = price_match.group(1).replace('\'', '')  # Remove apostrophes (thousands separator)
                price_usd = float(price_str)

            # Extract total amount in CHF (Verrechneter Betrag)
            # Swiss format uses apostrophes for thousands (3'052.94) and periods for decimals
            amount_match = re.search(r'Verrechneter Betrag:.*?CHF\s*([\d\'\.]+)', text, re.DOTALL)
            amount_chf = 0
            if amount_match:
                amount_str = amount_match.group(1).replace('\'', '')  # Remove apostrophes (thousands separator)
                amount_chf = float(amount_str)

            # Extract valuta date
            valuta_match = re.search(r'Valuta\s*(\d{2}\.\d{2}\.\d{4})', text)
            valuta_date = date
            if valuta_match:
                valuta_date = datetime.strptime(valuta_match.group(1), '%d.%m.%Y')

            # Create transaction record
            transactions.append({
                'date': valuta_date.isoformat(),
                'security': security_name,
                'isin': isin,
                'shares': shares,
                'price_usd': price_usd,
                'amount': -amount_chf,  # Negative because it's a purchase/outflow
                'currency': 'CHF',
                'type': 'buy',
                'account': 'VIAC'
            })

        except Exception as e:
            print(f"Error parsing VIAC PDF {filepath}: {e}")

        return transactions

    def parse_ing_diba(self, filepath):
        """Parse ING DiBa broker depot overview from CSV files"""
        holdings = []

        try:
            # Try different encodings for German characters
            encodings = ['utf-8-sig', 'windows-1252', 'iso-8859-1', 'cp1252']
            lines = None

            for encoding in encodings:
                try:
                    with open(filepath, 'r', encoding=encoding) as f:
                        lines = f.readlines()
                    break
                except UnicodeDecodeError:
                    continue

            if lines is None:
                print(f"Could not decode file {filepath} with any known encoding")
                return holdings

            # Extract date from first line: "Depotübersicht vom DD.MM.YYYY HH:MM"
            date_match = re.search(r'vom\s+(\d{2}\.\d{2}\.\d{4})', lines[0])
            snapshot_date = datetime.now()
            if date_match:
                snapshot_date = datetime.strptime(date_match.group(1), '%d.%m.%Y')

            # Find the header line (contains "ISIN")
            header_idx = None
            for i, line in enumerate(lines):
                if 'ISIN' in line and 'Wertpapiername' in line:
                    header_idx = i
                    break

            if header_idx is None:
                return holdings

            # Parse CSV starting from header
            reader = csv.DictReader(lines[header_idx:], delimiter=';')
            for row in reader:
                try:
                    # Skip summary row (empty ISIN)
                    isin = row.get('ISIN', '').strip().strip('"')
                    if not isin:
                        continue

                    # Extract security name
                    security = row.get('Wertpapiername', '').strip().strip('"')

                    # Extract shares - German format uses comma for decimal (167 or 1)
                    shares_str = row.get('Stück/Nominale', '').strip().strip('"')
                    if not shares_str:
                        continue
                    shares = float(shares_str.replace('.', '').replace(',', '.'))

                    # Extract purchase value (Einstandswert) - German format: 34.939,89
                    purchase_value_str = row.get('Einstandswert', '').strip().strip('"')
                    if not purchase_value_str:
                        continue
                    purchase_value = float(purchase_value_str.replace('.', '').replace(',', '.'))

                    # Extract currency
                    currency = row.get('Währung', 'EUR').strip().strip('"')
                    # There are multiple currency columns, get the one after Einstandswert
                    # We'll use the 7th column which is the currency for Einstandswert

                    # Extract current value (Kurswert)
                    current_value_str = row.get('Kurswert', '').strip().strip('"')
                    current_value = 0
                    if current_value_str:
                        current_value = float(current_value_str.replace('.', '').replace(',', '.'))

                    # Extract average purchase price (Einstandskurs)
                    avg_price_str = row.get('Einstandskurs', '').strip().strip('"')
                    avg_price = 0
                    if avg_price_str:
                        avg_price = float(avg_price_str.replace('.', '').replace(',', '.'))

                    holdings.append({
                        'isin': isin,
                        'security': security,
                        'shares': shares,
                        'total_cost': purchase_value,
                        'current_value': current_value,
                        'average_cost': avg_price,
                        'currency': 'EUR',  # ING DiBa is in EUR
                        'account': 'ING DiBa',
                        'date': snapshot_date.isoformat(),
                        'purchase_date': '2024-01-16'  # ING DiBa purchase date
                    })

                except (ValueError, KeyError) as e:
                    print(f"Error parsing ING DiBa row: {e}, row: {row}")
                    continue

        except Exception as e:
            print(f"Error parsing ING DiBa CSV {filepath}: {e}")

        return holdings

    def _categorize_transaction(self, recipient, description):
        """Categorize transaction based on recipient and description"""
        text = f"{recipient} {description}".lower()

        # Load categories fresh each time to pick up changes
        spending_categories = _load_categories('categories_spending.json')
        income_categories = _load_categories('categories_income.json')
        internal_transfer_config = _load_categories('categories_internal_transfer.json')

        # Check for internal transfers first (these should be excluded from income/expenses)
        if internal_transfer_config:
            # Check for money transfer services (Wise, Exchange Market)
            transfer_keywords = internal_transfer_config.get('keywords', [])
            if any(keyword.lower() in text for keyword in transfer_keywords):
                return 'Internal Transfer'

            # Check for self-transfers (same person sender and recipient)
            self_patterns = internal_transfer_config.get('self_transfer_patterns', [])
            if self_patterns:
                for pattern in self_patterns:
                    pattern_lower = pattern.lower()
                    recipient_lower = recipient.lower()
                    description_lower = description.lower() if description else ''

                    recipient_match = pattern_lower in recipient_lower

                    # Check if all words from pattern appear in description (more flexible matching)
                    pattern_words = set(pattern_lower.split())
                    description_words = set(description_lower.split())
                    description_match = pattern_words.issubset(description_words) if description else False

                    # If both recipient and description contain the same name pattern, it's a self-transfer
                    # OR if recipient matches and description is empty/very short
                    if (recipient_match and description_match) or (recipient_match and (not description or len(description.strip()) < 10)):
                        return 'Internal Transfer'

        # Check spending categories from config file
        for category, keywords in spending_categories.items():
            if any(keyword.lower() in text for keyword in keywords):
                return category

        # Check income categories from config file
        for category, keywords in income_categories.items():
            if any(keyword.lower() in text for keyword in keywords):
                return category

        # Check for transfers (special handling to exclude certain keywords)
        transfer_keywords = ['überweisung', 'twint', 'paypal']
        exclude_keywords = ['apple'] + [kw.lower() for keywords in income_categories.values() for kw in keywords]

        if any(word in text for word in transfer_keywords) and not any(word in text for word in exclude_keywords):
            return 'Transfer'

        return 'Other'

@app.route('/api/transactions')
def get_transactions():
    parser = BankStatementParser()

    # Parse all bank statements
    base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'bank_statements')
    dkb_folder = os.path.join(base_path, 'dkb')
    yuh_folder = os.path.join(base_path, 'yuh')

    transactions = []

    # Parse all DKB CSV files
    if os.path.exists(dkb_folder):
        dkb_files = glob.glob(os.path.join(dkb_folder, '*.csv')) + glob.glob(os.path.join(dkb_folder, '*.CSV'))
        for dkb_file in dkb_files:
            transactions.extend(parser.parse_dkb(dkb_file))

    # Parse all YUH CSV files
    if os.path.exists(yuh_folder):
        yuh_files = glob.glob(os.path.join(yuh_folder, '*.csv')) + glob.glob(os.path.join(yuh_folder, '*.CSV'))
        for yuh_file in yuh_files:
            transactions.extend(parser.parse_yuh(yuh_file))

    # Sort by date
    transactions.sort(key=lambda x: x['date'], reverse=True)

    return jsonify(transactions)

@app.route('/api/summary')
def get_summary():
    parser = BankStatementParser()

    # Parse all bank statements
    base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'bank_statements')
    dkb_folder = os.path.join(base_path, 'dkb')
    yuh_folder = os.path.join(base_path, 'yuh')

    transactions = []

    # Parse all DKB CSV files
    if os.path.exists(dkb_folder):
        dkb_files = glob.glob(os.path.join(dkb_folder, '*.csv')) + glob.glob(os.path.join(dkb_folder, '*.CSV'))
        for dkb_file in dkb_files:
            transactions.extend(parser.parse_dkb(dkb_file))

    # Parse all YUH CSV files
    if os.path.exists(yuh_folder):
        yuh_files = glob.glob(os.path.join(yuh_folder, '*.csv')) + glob.glob(os.path.join(yuh_folder, '*.CSV'))
        for yuh_file in yuh_files:
            transactions.extend(parser.parse_yuh(yuh_file))

    # Group by month
    monthly_data = defaultdict(lambda: {
        'income': 0,
        'expenses': 0,
        'income_categories': defaultdict(float),
        'income_transactions': defaultdict(list),
        'expense_categories': defaultdict(float),
        'expense_transactions': defaultdict(list),
        'internal_transfer_total': 0,
        'internal_transfer_transactions': [],
        'currency_totals': {'EUR': 0, 'CHF': 0}
    })

    for t in transactions:
        date = datetime.fromisoformat(t['date'])
        month_key = date.strftime('%Y-%m')

        # Track internal transfers separately (don't include in income/expense calculations)
        if t['category'] == 'Internal Transfer':
            monthly_data[month_key]['internal_transfer_total'] += abs(t['amount'])
            monthly_data[month_key]['internal_transfer_transactions'].append({
                'date': t['date'],
                'amount': t['amount'],
                'currency': t['currency'],
                'recipient': t['recipient'],
                'description': t['description'],
                'account': t['account']
            })
            monthly_data[month_key]['currency_totals'][t['currency']] += t['amount']
            continue

        if t['type'] == 'income':
            monthly_data[month_key]['income'] += abs(t['amount'])
            monthly_data[month_key]['income_categories'][t['category']] += abs(t['amount'])
            # Store individual income transactions for each category
            monthly_data[month_key]['income_transactions'][t['category']].append({
                'date': t['date'],
                'amount': t['amount'],
                'currency': t['currency'],
                'recipient': t['recipient'],
                'description': t['description'],
                'account': t['account']
            })
        else:
            monthly_data[month_key]['expenses'] += abs(t['amount'])
            monthly_data[month_key]['expense_categories'][t['category']] += abs(t['amount'])
            # Store individual expense transactions for each category
            monthly_data[month_key]['expense_transactions'][t['category']].append({
                'date': t['date'],
                'amount': t['amount'],
                'currency': t['currency'],
                'recipient': t['recipient'],
                'description': t['description'],
                'account': t['account']
            })

        monthly_data[month_key]['currency_totals'][t['currency']] += t['amount']

    # Calculate saving rate for each month
    summary = []
    for month, data in sorted(monthly_data.items(), reverse=True):
        total_income = data['income']
        total_expenses = data['expenses']
        savings = total_income - total_expenses
        saving_rate = (savings / total_income * 100) if total_income > 0 else 0

        # Prepare income category data with transactions
        income_categories_with_transactions = {}
        for category, total in data['income_categories'].items():
            income_categories_with_transactions[category] = {
                'total': round(total, 2),
                'transactions': sorted(
                    data['income_transactions'][category],
                    key=lambda x: x['date'],
                    reverse=True
                )
            }

        # Prepare expense category data with transactions
        expense_categories_with_transactions = {}
        for category, total in data['expense_categories'].items():
            expense_categories_with_transactions[category] = {
                'total': round(total, 2),
                'transactions': sorted(
                    data['expense_transactions'][category],
                    key=lambda x: x['date'],
                    reverse=True
                )
            }

        # Prepare internal transfers data
        internal_transfers_data = None
        if data['internal_transfer_total'] > 0:
            internal_transfers_data = {
                'total': round(data['internal_transfer_total'], 2),
                'transactions': sorted(
                    data['internal_transfer_transactions'],
                    key=lambda x: x['date'],
                    reverse=True
                )
            }

        summary.append({
            'month': month,
            'income': round(total_income, 2),
            'expenses': round(total_expenses, 2),
            'savings': round(savings, 2),
            'saving_rate': round(saving_rate, 2),
            'income_categories': income_categories_with_transactions,
            'expense_categories': expense_categories_with_transactions,
            'internal_transfers': internal_transfers_data,
            'currency_totals': {k: round(v, 2) for k, v in data['currency_totals'].items()}
        })

    return jsonify(summary)

@app.route('/api/accounts')
def get_accounts():
    parser = BankStatementParser()

    # Parse all bank statements
    base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'bank_statements')
    dkb_folder = os.path.join(base_path, 'dkb')
    yuh_folder = os.path.join(base_path, 'yuh')

    transactions = []

    # Parse all DKB CSV files
    if os.path.exists(dkb_folder):
        dkb_files = glob.glob(os.path.join(dkb_folder, '*.csv')) + glob.glob(os.path.join(dkb_folder, '*.CSV'))
        for dkb_file in dkb_files:
            transactions.extend(parser.parse_dkb(dkb_file))

    # Parse all YUH CSV files
    if os.path.exists(yuh_folder):
        yuh_files = glob.glob(os.path.join(yuh_folder, '*.csv')) + glob.glob(os.path.join(yuh_folder, '*.CSV'))
        for yuh_file in yuh_files:
            transactions.extend(parser.parse_yuh(yuh_file))

    # Parse broker statements to calculate total invested/current values
    depot_base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'depot_transactions')
    viac_folder = os.path.join(depot_base_path, 'viac')
    ing_diba_folder = os.path.join(depot_base_path, 'ing_diba')

    viac_total = 0
    ing_diba_total = 0

    # VIAC - sum up transactions
    if os.path.exists(viac_folder):
        viac_files = glob.glob(os.path.join(viac_folder, '*.pdf')) + glob.glob(os.path.join(viac_folder, '*.PDF'))
        for viac_file in viac_files:
            viac_transactions = parser.parse_viac(viac_file)
            for t in viac_transactions:
                viac_total += abs(t['amount'])

    # ING DiBa - use current market value from holdings
    if os.path.exists(ing_diba_folder):
        ing_files = glob.glob(os.path.join(ing_diba_folder, '*.csv')) + glob.glob(os.path.join(ing_diba_folder, '*.CSV'))
        for ing_file in ing_files:
            ing_holdings = parser.parse_ing_diba(ing_file)
            for holding in ing_holdings:
                ing_diba_total += holding['current_value']

    # Add broker accounts to account balances
    if viac_total > 0:
        parser.account_balances['VIAC'] = {
            'balance': viac_total,
            'currency': 'CHF'
        }

    if ing_diba_total > 0:
        parser.account_balances['ING DiBa'] = {
            'balance': ing_diba_total,
            'currency': 'EUR'
        }

    # Track transaction metadata for each account
    account_metadata = defaultdict(lambda: {
        'transaction_count': 0,
        'last_transaction_date': None
    })

    for t in transactions:
        account = t['account']
        account_metadata[account]['transaction_count'] += 1

        # Track the most recent transaction date
        if account_metadata[account]['last_transaction_date'] is None:
            account_metadata[account]['last_transaction_date'] = t['date']
        else:
            if t['date'] > account_metadata[account]['last_transaction_date']:
                account_metadata[account]['last_transaction_date'] = t['date']

    # Build accounts list using actual balances from parser
    accounts_list = []
    for account_name, balance_data in sorted(parser.account_balances.items()):
        metadata = account_metadata.get(account_name, {})
        accounts_list.append({
            'account': account_name,
            'balance': round(balance_data['balance'], 2),
            'currency': balance_data['currency'],
            'transaction_count': metadata.get('transaction_count', 0),
            'last_transaction_date': metadata.get('last_transaction_date')
        })

    # Calculate total by currency
    totals = {'EUR': 0, 'CHF': 0}
    for account in accounts_list:
        if account['currency'] in totals:
            totals[account['currency']] += account['balance']

    return jsonify({
        'accounts': accounts_list,
        'totals': {k: round(v, 2) for k, v in totals.items()}
    })

@app.route('/api/broker')
def get_broker():
    parser = BankStatementParser()

    # Parse all broker statements
    base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'depot transactions')
    viac_folder = os.path.join(base_path, 'Viac')
    ing_diba_folder = os.path.join(base_path, 'ing diba')

    transactions = []
    holdings_dict = {}
    total_invested_chf = 0
    total_invested_eur = 0
    total_current_value_eur = 0

    # Parse all VIAC PDF files (transactions)
    if os.path.exists(viac_folder):
        viac_files = glob.glob(os.path.join(viac_folder, '*.pdf')) + glob.glob(os.path.join(viac_folder, '*.PDF'))
        for viac_file in viac_files:
            file_transactions = parser.parse_viac(viac_file)
            transactions.extend(file_transactions)

            # Aggregate VIAC holdings by ISIN
            for t in file_transactions:
                key = f"VIAC_{t['isin']}"
                if key not in holdings_dict:
                    holdings_dict[key] = {
                        'isin': t['isin'],
                        'security': t['security'],
                        'shares': 0,
                        'total_cost': 0,
                        'current_value': 0,
                        'average_cost': 0,
                        'currency': 'CHF',
                        'account': 'VIAC',
                        'transaction_count': 0
                    }
                holdings_dict[key]['shares'] += t['shares']
                holdings_dict[key]['total_cost'] += abs(t['amount'])
                holdings_dict[key]['transaction_count'] += 1
                total_invested_chf += abs(t['amount'])

    # Parse all ING DiBa CSV files (holdings snapshot)
    if os.path.exists(ing_diba_folder):
        ing_files = glob.glob(os.path.join(ing_diba_folder, '*.csv')) + glob.glob(os.path.join(ing_diba_folder, '*.CSV'))
        for ing_file in ing_files:
            ing_holdings = parser.parse_ing_diba(ing_file)

            for holding in ing_holdings:
                key = f"ING_{holding['isin']}"
                holdings_dict[key] = {
                    'isin': holding['isin'],
                    'security': holding['security'],
                    'shares': holding['shares'],
                    'total_cost': holding['total_cost'],
                    'current_value': holding['current_value'],
                    'average_cost': holding['average_cost'],
                    'currency': 'EUR',
                    'account': 'ING DiBa',
                    'transaction_count': 1,  # Snapshot doesn't have individual transactions
                    'purchase_date': holding.get('purchase_date', '2024-01-16')
                }
                total_invested_eur += holding['total_cost']
                total_current_value_eur += holding['current_value']

    # Sort transactions by date
    transactions.sort(key=lambda x: x['date'], reverse=True)

    # Convert holdings to list and calculate average costs
    holdings_list = []
    for key, data in holdings_dict.items():
        # Calculate average cost for VIAC holdings
        if data['account'] == 'VIAC' and data['shares'] > 0:
            data['average_cost'] = round(data['total_cost'] / data['shares'], 2)

        holdings_list.append({
            'isin': data['isin'],
            'security': data['security'],
            'shares': round(data['shares'], 3),
            'total_cost': round(data['total_cost'], 2),
            'current_value': round(data['current_value'], 2) if data['current_value'] > 0 else None,
            'average_cost': round(data['average_cost'], 2),
            'currency': data['currency'],
            'account': data['account'],
            'transaction_count': data['transaction_count'],
            'purchase_date': data.get('purchase_date')
        })

    # Sort holdings by account then total cost
    holdings_list.sort(key=lambda x: (x['account'], -x['total_cost']))

    return jsonify({
        'transactions': transactions,
        'holdings': holdings_list,
        'summary': {
            'viac': {
                'total_invested': round(total_invested_chf, 2),
                'currency': 'CHF',
                'account': 'VIAC'
            },
            'ing_diba': {
                'total_invested': round(total_invested_eur, 2),
                'total_current_value': round(total_current_value_eur, 2),
                'currency': 'EUR',
                'account': 'ING DiBa'
            }
        }
    })

if __name__ == '__main__':
    app.run(debug=True, port=5001, use_reloader=True, reloader_type='stat')
