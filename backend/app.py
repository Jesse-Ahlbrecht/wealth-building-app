from flask import Flask, jsonify, request, g
from flask_cors import CORS
import csv
from datetime import datetime, timezone
from collections import defaultdict
import os
import re
import glob
import json
import base64
from functools import wraps
from PyPDF2 import PdfReader
from dotenv import load_dotenv
from encryption import get_encryption_service, encrypt_sensitive_data, decrypt_sensitive_data, EncryptedData
from auth import get_session_manager
from database import get_wealth_database
from user_management import get_user_manager
from prediction_service import RecurringPatternDetector, get_dismissed_predictions

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize session manager and database
session_manager = get_session_manager()
wealth_db = get_wealth_database()
user_manager = get_user_manager(wealth_db.db)

def authenticate_request(f):
    """
    Decorator to authenticate API requests and sign responses
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get session token from header
        session_token = request.headers.get('Authorization')
        if session_token and session_token.startswith('Bearer '):
            session_token = session_token[7:]  # Remove 'Bearer ' prefix

        # Validate session
        session_claims = None
        if session_token:
            session_claims = session_manager.validate_session(session_token)

        # Store session info in Flask g object for use in endpoint
        g.session_claims = session_claims
        g.session_token = session_token

        # Call the actual endpoint
        response_data = f(*args, **kwargs)

        # Handle tuple responses (data, status_code)
        status_code = 200
        if isinstance(response_data, tuple):
            response_data, status_code = response_data

        # If it's already a Response object (like from jsonify), extract the JSON data
        if hasattr(response_data, 'get_json'):
            # It's a Response object, extract the JSON data
            json_data = response_data.get_json()
            if json_data is None:
                # If it's not JSON data, return as-is (error responses, etc.)
                return response_data
            response_data = json_data

        # Sign the response
        signed_response = session_manager.create_signed_api_response(
            response_data if isinstance(response_data, dict) else {'data': response_data},
            session_token
        )

        return jsonify(signed_response), status_code

    return decorated_function

def require_auth(f):
    """
    Decorator that requires valid authentication
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not g.session_claims:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Note: Categories are now stored in the database (categories table)
# Transaction category updates are stored in the database (category_overrides table)
# No more file-based storage!

@app.route('/api/auth/register', methods=['POST'])
def register():
    """
    Register a new user
    """
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        name = data.get('name', '').strip()
        
        if not email or not password or not name:
            return {'error': 'Email, password, and name are required'}, 400
        
        # Generate unique tenant_id for new user (use email hash for uniqueness)
        import hashlib
        tenant_id = hashlib.sha256(email.encode()).hexdigest()[:16]
        
        success, user_data, error = user_manager.register_user(email, password, name, tenant_id=tenant_id)
        
        if not success:
            return {'error': error}, 400
        
        return {
            'success': True,
            'message': 'Registration successful. Please check your email to verify your account.',
            'user': user_data
        }
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Registration error: {e}")
        print(f"Traceback: {error_trace}")
        return {'error': f'Registration failed: {str(e)}'}, 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    """
    Authenticate user and create session token with email and password
    """
    try:
        data = request.get_json()
        email = data.get('email', '').strip() or data.get('username', '').strip()  # Support both for backward compatibility
        password = data.get('password', '')

        if not email or not password:
            return {'error': 'Email and password are required'}, 400

        # Try new authentication system first
        success, user_data, error = user_manager.authenticate_user(email, password)
        
        if success:
            # Create session token
            session_token = session_manager.create_session(
                user_id=str(user_data['id']),
                tenant_id=user_data['tenant_id'],
                additional_claims={
                    'email': user_data['email'],
                    'name': user_data['name'],
                    'email_verified': user_data['email_verified']
                }
            )

            return {
                'success': True,
                'session_token': session_token,
                'user': {
                    'id': user_data['id'],
                    'email': user_data['email'],
                    'name': user_data['name'],
                    'tenant': user_data['tenant_id'],
                    'email_verified': user_data['email_verified']
                }
            }
        
        # Fallback to demo user for backward compatibility
        if email == 'demo@demo' and password == 'demo':
            session_token = session_manager.create_session(
                user_id='demo',
                tenant_id='default',
                additional_claims={'role': 'user', 'email': 'demo@example.com'}
            )
            return {
                'success': True,
                'session_token': session_token,
                'user': {'id': 'demo', 'email': 'demo@example.com', 'name': 'Demo User'}
            }
        
        return {'error': error or 'Invalid email or password'}, 401
        
    except Exception as e:
        print(f"Login error: {e}")
        import traceback
        traceback.print_exc()
        return {'error': 'Login failed'}, 500


@app.route('/api/auth/request-password-reset', methods=['POST'])
def request_password_reset():
    """
    Request a password reset email
    """
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        
        if not email:
            return {'error': 'Email is required'}, 400
        
        success, error = user_manager.request_password_reset(email)
        
        # Always return success to prevent email enumeration
        return {
            'success': True,
            'message': 'If an account exists with this email, a password reset link will be sent.'
        }
    except Exception as e:
        print(f"Password reset request error: {e}")
        return {'error': 'Failed to process password reset request'}, 500


@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    """
    Reset password with token
    """
    try:
        data = request.get_json()
        token = data.get('token', '')
        new_password = data.get('password', '')
        
        if not token or not new_password:
            return {'error': 'Token and new password are required'}, 400
        
        success, error = user_manager.reset_password(token, new_password)
        
        if not success:
            return {'error': error}, 400
        
        return {
            'success': True,
            'message': 'Password reset successful. You can now log in with your new password.'
        }
    except Exception as e:
        print(f"Password reset error: {e}")
        return {'error': 'Failed to reset password'}, 500


@app.route('/api/auth/verify-email', methods=['POST'])
def verify_email():
    """
    Verify email address with token
    """
    try:
        data = request.get_json()
        token = data.get('token', '')
        
        if not token:
            return {'error': 'Verification token is required'}, 400
        
        success, error = user_manager.verify_email(token)
        
        if not success:
            return {'error': error}, 400
        
        return {
            'success': True,
            'message': 'Email verified successfully!'
        }
    except Exception as e:
        print(f"Email verification error: {e}")
        return {'error': 'Failed to verify email'}, 500


@app.route('/api/auth/verify', methods=['GET'])
@authenticate_request
def verify_session():
    """Verify current session is valid"""
    if g.session_claims:
        return {
            'valid': True,
            'user': {
                'id': g.session_claims.get('sub'),
                'tenant': g.session_claims.get('tenant')
            }
        }
    else:
        return {'valid': False}, 401


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
            
            # Find the CSV header row (starts with "Buchungstag", "Buchungsdatum", or "Buchung")
            header_idx = None
            for i, line in enumerate(lines):
                if 'Buchungstag' in line or 'Buchungsdatum' in line or 'Buchung' in line:
                    header_idx = i
                    break
            
            if header_idx is None:
                print(f"Warning: Could not find CSV header in DKB file {filepath}")
                return transactions
            
            # Parse CSV starting from header
            reader = csv.DictReader(lines[header_idx:], delimiter=';')
            print(f"CSV reader fieldnames: {reader.fieldnames}")
            
            for row_num, row in enumerate(reader, start=1):
                try:
                    # Debug: print first few rows
                    if row_num <= 3:
                        print(f"Row {row_num}: {dict(row)}")
                    
                    # DKB CSV format has multiple variants:
                    # Old: Buchungstag, Wertstellung, Buchungstext, Empfänger/Auftraggeber, Verwendungszweck, Betrag, Währung
                    # New: Buchungsdatum, Wertstellung, Status, Zahlungspflichtige*r, Zahlungsempfänger*in, Verwendungszweck, Umsatztyp, IBAN, Betrag (€), ...
                    
                    # Try different date column names (handle both quoted and unquoted)
                    date_str = (row.get('Buchungstag', '').strip() or 
                               row.get('Buchungsdatum', '').strip() or 
                               row.get('Buchung', '').strip() or
                               row.get('"Buchungstag"', '').strip() or
                               row.get('"Buchungsdatum"', '').strip()).strip('"')
                    if not date_str:
                        if row_num <= 3:
                            print(f"  No date found in row {row_num}")
                        continue
                    
                    # Parse date - handle both DD.MM.YYYY and DD.MM.YY formats
                    date = None
                    try:
                        date = datetime.strptime(date_str, '%d.%m.%Y')
                    except ValueError:
                        try:
                            date = datetime.strptime(date_str, '%d.%m.%y')  # 2-digit year
                        except ValueError:
                            try:
                                date = datetime.strptime(date_str, '%Y-%m-%d')
                            except ValueError:
                                if row_num <= 3:
                                    print(f"  Warning: Could not parse date '{date_str}'")
                                continue
                    
                    # Try different amount column names (handle both quoted and unquoted)
                    amount_str = (row.get('Betrag', '').strip() or 
                                 row.get('Betrag (€)', '').strip() or
                                 row.get('"Betrag"', '').strip() or
                                 row.get('"Betrag (€)"', '').strip()).strip('"')
                    if not amount_str:
                        if row_num <= 3:
                            print(f"  No amount found in row {row_num}")
                        continue
                    
                    # Parse amount (German format: 1.234,56 or -1.234,56)
                    amount_str = amount_str.replace('.', '').replace(',', '.')
                    try:
                        amount = float(amount_str)
                    except ValueError:
                        if row_num <= 3:
                            print(f"  Warning: Could not parse amount '{amount_str}'")
                        continue
                    
                    # Get currency (default to EUR for DKB)
                    currency = row.get('Währung', 'EUR').strip().strip('"')
                    if not currency:
                        currency = 'EUR'
                    
                    # Try different recipient/sender column names
                    recipient = (row.get('Empfänger/Auftraggeber', '').strip() or 
                                row.get('Empfänger', '').strip() or
                                row.get('Zahlungsempfänger*in', '').strip() or
                                row.get('Zahlungspflichtige*r', '').strip() or
                                row.get('"Zahlungsempfänger*in"', '').strip() or
                                row.get('"Zahlungspflichtige*r"', '').strip()).strip('"')
                    
                    # Get description
                    description = (row.get('Verwendungszweck', '').strip() or 
                                  row.get('Buchungstext', '').strip() or
                                  row.get('"Verwendungszweck"', '').strip()).strip('"')
                    
                    # Determine transaction type (positive = income, negative = expense)
                    transaction_type = 'income' if amount > 0 else 'expense'
                    
                    # Categorize transaction
                    category = self._categorize_transaction(recipient, description, date.strftime('%Y-%m-%d'), account_name)
                    
                    transactions.append({
                        'date': date.isoformat(),
                        'amount': abs(amount),
                        'currency': currency,
                        'recipient': recipient,
                        'description': description,
                        'category': category,
                        'type': transaction_type,
                        'account': account_name
                    })
                except (ValueError, KeyError) as e:
                    print(f"Error parsing DKB row {row_num}: {e}")
                    import traceback
                    traceback.print_exc()
                    continue
        
        print(f"Parsed {len(transactions)} transactions from DKB file {filepath}")
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

                    category = self._categorize_transaction(recipient or activity_name, locality, date.strftime('%Y-%m-%d'), 'YUH')

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

    def parse_kfw(self, filepath):
        """Parse KfW student loan statements from PDF files"""
        loans = []

        try:
            reader = PdfReader(filepath)
            text = ""
            for page in reader.pages:
                text += page.extract_text()

            # Extract key information using regex patterns
            # Date pattern: "Kontoauszug per DD.MM.YYYY"
            date_match = re.search(r'Kontoauszug per (\d{2}\.\d{2}\.\d{4})', text)
            if not date_match:
                return loans

            statement_date = datetime.strptime(date_match.group(1), '%d.%m.%Y')

            # Extract loan program type
            program_match = re.search(r'Kreditprogramm:\s*(.+)', text)
            program = program_match.group(1).strip() if program_match else 'Unknown'

            # Extract account number
            account_match = re.search(r'Darlehenskonto-Nr\.:\s*(\d+)', text)
            account_number = account_match.group(1) if account_match else ''

            # Extract contract date
            contract_match = re.search(r'Darlehensvertrag vom:\s*(\d{2}\.\d{2}\.\d{4})', text)
            contract_date = None
            if contract_match:
                contract_date = datetime.strptime(contract_match.group(1), '%d.%m.%Y')

            # Extract current balance - look for the most recent "Kapitalsaldo zum" or "Kontostand per"
            balance_matches = re.findall(r'(?:Kapitalsaldo zum|Kontostand per)\s+\d{2}\.\d{2}\.\d{4}\s+([\d.,]+)', text)
            current_balance = 0
            if balance_matches:
                # Get the last (most recent) balance
                balance_str = balance_matches[-1].replace('.', '').replace(',', '.')
                current_balance = float(balance_str)

            # Extract interest rate
            interest_match = re.search(r'ab \d{2}\.\d{2}\.\d{4}:\s*([\d.,]+)\s*%', text)
            interest_rate = 0
            if interest_match:
                interest_str = interest_match.group(1).replace(',', '.')
                interest_rate = float(interest_str)

            # Extract monthly payment if available
            payment_match = re.search(r'Lastschrift\s+([\d.,]+)', text)
            monthly_payment = 0
            if payment_match:
                payment_str = payment_match.group(1).replace('.', '').replace(',', '.')
                monthly_payment = float(payment_str)

            # Extract deferred interest if available
            deferred_interest_match = re.search(r'Aufgeschobene Zinsen:\s*([\d.,]+)\s*EUR', text)
            deferred_interest = 0
            if deferred_interest_match:
                deferred_str = deferred_interest_match.group(1).replace('.', '').replace(',', '.')
                deferred_interest = float(deferred_str)

            # Create loan record
            loan_data = {
                'account_number': account_number,
                'program': program,
                'current_balance': current_balance,
                'interest_rate': interest_rate,
                'monthly_payment': monthly_payment,
                'deferred_interest': deferred_interest,
                'statement_date': statement_date.isoformat(),
                'contract_date': contract_date.isoformat() if contract_date else None,
                'account': f'KfW {program}',
                'type': 'loan'
            }
            loans.append(loan_data)

        except Exception as e:
            print(f"Error parsing KfW PDF {filepath}: {e}")

        return loans

    def _categorize_transaction(self, recipient, description, date=None, account=None):
        """Categorize transaction based on recipient and description
        
        Note: This is only used during initial parsing of bank statements.
        Category overrides are now stored directly in the database.
        """
        recipient = (recipient or '').strip()
        description = (description or '').strip()
        if date:
            date = date.split('T')[0] if 'T' in date else date
        else:
            date = ''
        account = account or ''
        text = f"{recipient} {description}".strip().lower()

        # Load categories fresh each time to pick up changes
        spending_categories = _load_categories('categories_spending.json')
        income_categories = _load_categories('categories_income.json')
        internal_transfer_config = _load_categories('categories_internal_transfer.json')

        # Check for initial setup transactions first (these should be completely excluded)
        if internal_transfer_config and date and account:
            initial_setup_transactions = internal_transfer_config.get('initial_setup', [])
            for setup_transaction in initial_setup_transactions:
                if (setup_transaction.get('date') == date and
                    setup_transaction.get('account') == account and
                    setup_transaction.get('description', '').lower() in description.lower()):
                    return 'Internal Transfer'

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
@authenticate_request
@require_auth
def get_transactions():
    """Get transactions from database"""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'

    try:
        print(f"Getting transactions for tenant: {tenant_id}")
        transactions = wealth_db.get_transactions(tenant_id)
        print(f"Found {len(transactions)} transactions")
        return jsonify(transactions)
    except Exception as e:
        import traceback
        print(f"Error getting transactions: {e}")
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to retrieve transactions'}), 500

@app.route('/api/summary')
@authenticate_request
@require_auth
def get_summary():
    """Get transaction summary from database"""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    print(f"📊 get_summary called with tenant_id: {tenant_id}")

    try:
        # Get all transactions from database
        db_transactions = wealth_db.get_transactions(tenant_id, limit=10000, offset=0)

        # No demo data - users must upload their own data
        print(f"Total transactions from database: {len(db_transactions)}")
        
        if len(db_transactions) > 0:
            # Convert database transactions to the format expected by the frontend
            transactions = []
            for t in db_transactions:
                transactions.append({
                    'date': t['transaction_date'].isoformat() if hasattr(t['transaction_date'], 'isoformat') else str(t['transaction_date']),
                    'amount': float(t['amount']) if t['transaction_type'] == 'income' else -float(t['amount']),
                    'currency': t['currency'],
                    'type': t['transaction_type'],
                    'recipient': t.get('recipient', ''),
                    'description': t.get('description', ''),
                    'category': t.get('category', 'Uncategorized'),
                    'account': t.get('account_name', 'Unknown'),
                    'transaction_hash': t.get('transaction_hash', '')
                })

            print(f"Formatted {len(transactions)} transactions for frontend")
        else:
            # No transactions found - return empty array (user will see onboarding)
            print(f"No transactions found for tenant {tenant_id} - returning empty array")
            return jsonify([])
    except Exception as e:
        print(f"Error fetching transactions from database: {e}")
        import traceback
        traceback.print_exc()
        # On error, return empty array (user will see onboarding)
        return jsonify([])

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

    print(f"Processing {len(transactions)} transactions for grouping...")
    for idx, t in enumerate(transactions):
        try:
            # Parse date - handle different formats
            date_str = t['date']
            if isinstance(date_str, str):
                # Try ISO format first
                try:
                    date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                except ValueError:
                    # Try other formats
                    try:
                        date = datetime.strptime(date_str, '%Y-%m-%d')
                    except ValueError:
                        try:
                            date = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
                        except ValueError:
                            print(f"Warning: Could not parse date '{date_str}' for transaction {idx}")
                            continue
            else:
                # Already a datetime object
                date = date_str
            
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
                    'account': t['account'],
                    'transaction_hash': t.get('transaction_hash', '')
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
                    'account': t['account'],
                    'transaction_hash': t.get('transaction_hash', '')
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
                    'account': t['account'],
                    'transaction_hash': t.get('transaction_hash', '')
                })

            monthly_data[month_key]['currency_totals'][t['currency']] += t['amount']
        except Exception as e:
            print(f"Error processing transaction {idx}: {e}")
            print(f"Transaction data: {t}")
            import traceback
            traceback.print_exc()
            continue

    print(f"Grouped transactions into {len(monthly_data)} months")
    
    # Generate predictions for current month
    current_month = datetime.now().strftime('%Y-%m')
    try:
        print(f"Generating predictions for current month: {current_month}")
        
        # Detect recurring patterns
        detector = RecurringPatternDetector()
        patterns = detector.detect_recurring_patterns(transactions)
        print(f"Detected {len(patterns)} recurring patterns")
        
        # Get dismissed predictions
        dismissed_predictions = set()
        try:
            # Query dismissed predictions directly
            target_year, target_month_num = map(int, current_month.split('-'))
            target_date = datetime(target_year, target_month_num, 1)
            
            with wealth_db.db.get_cursor() as cursor:
                # Check if table exists
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'prediction_dismissals'
                    )
                """)
                table_exists = cursor.fetchone()[0]
                
                if table_exists:
                    cursor.execute("""
                        SELECT prediction_key 
                        FROM prediction_dismissals 
                        WHERE tenant_id = (SELECT id FROM tenants WHERE tenant_id = %s)
                        AND (expires_at IS NULL OR expires_at >= %s)
                    """, [tenant_id, target_date.date()])
                    result = cursor.fetchall()
                    dismissed_predictions = {row[0] for row in result}
                    print(f"Found {len(dismissed_predictions)} dismissed predictions")
                else:
                    print("⚠️ prediction_dismissals table does not exist yet (run schema.sql to create it)")
        except Exception as e:
            print(f"Warning: Could not fetch dismissed predictions: {e}")
            import traceback
            traceback.print_exc()
        
        # Generate predictions for current month
        predictions = detector.generate_predictions_for_month(patterns, current_month, dismissed_predictions)
        print(f"Generated {len(predictions)} predictions for {current_month}")
        
        # Debug: Print prediction details
        for pred in predictions:
            print(f"  - Prediction: {pred['recipient']} ({pred['category']}) - {pred['recurrence_type']} - {pred['amount']} {pred['currency']}")
        
        # Merge predictions into current month's data
        if predictions:
            # Create current month entry if it doesn't exist
            if current_month not in monthly_data:
                monthly_data[current_month] = {
                    'income': 0,
                    'expenses': 0,
                    'income_categories': defaultdict(float),
                    'income_transactions': defaultdict(list),
                    'expense_categories': defaultdict(float),
                    'expense_transactions': defaultdict(list),
                    'internal_transfer_total': 0,
                    'internal_transfer_transactions': [],
                    'currency_totals': {'EUR': 0, 'CHF': 0}
                }
            
            print(f"💡 Adding {len(predictions)} predictions to month {current_month}")
            print(f"💡 Current month data has {len(monthly_data[current_month]['income_transactions'])} income categories and {len(monthly_data[current_month]['expense_transactions'])} expense categories")
            
            # Filter out predictions that match existing transactions
            filtered_predictions = []
            for prediction in predictions:
                category = prediction['category']
                recipient = prediction['recipient']
                pred_amount = abs(float(prediction['amount']))
                
                # Check if there's already a matching transaction this month
                existing_transactions = []
                if prediction['type'] == 'income':
                    existing_transactions = monthly_data[current_month]['income_transactions'].get(category, [])
                else:
                    existing_transactions = monthly_data[current_month]['expense_transactions'].get(category, [])
                
                # Look for a matching transaction (same recipient and similar amount within 10%)
                is_duplicate = False
                for txn in existing_transactions:
                    if txn.get('recipient') == recipient:
                        txn_amount = abs(float(txn.get('amount', 0)))
                        amount_diff = abs(txn_amount - pred_amount) / pred_amount if pred_amount > 0 else 0
                        if amount_diff < 0.10:  # Within 10% of predicted amount
                            is_duplicate = True
                            print(f"  ⏭️  Skipping prediction for {recipient}: actual transaction already exists ({txn_amount} vs predicted {pred_amount})")
                            break
                
                if not is_duplicate:
                    filtered_predictions.append(prediction)
            
            print(f"💡 After filtering, {len(filtered_predictions)} predictions remain (removed {len(predictions) - len(filtered_predictions)} duplicates)")
            
            for prediction in filtered_predictions:
                category = prediction['category']
                amount = abs(float(prediction['amount']))
                
                if prediction['type'] == 'income':
                    # Add to income category transactions
                    monthly_data[current_month]['income_transactions'][category].append(prediction)
                    # Add predicted amount to totals
                    monthly_data[current_month]['income'] += amount
                    monthly_data[current_month]['income_categories'][category] += amount
                    print(f"  ✓ Added income prediction to category '{category}': {amount} (now has {len(monthly_data[current_month]['income_transactions'][category])} transactions)")
                else:
                    # Add to expense category transactions
                    monthly_data[current_month]['expense_transactions'][category].append(prediction)
                    # Add predicted amount to totals
                    monthly_data[current_month]['expenses'] += amount
                    monthly_data[current_month]['expense_categories'][category] += amount
                    print(f"  ✓ Added expense prediction to category '{category}': {amount} (now has {len(monthly_data[current_month]['expense_transactions'][category])} transactions)")
    except Exception as e:
        print(f"Error generating predictions: {e}")
        import traceback
        traceback.print_exc()
    
    # Calculate saving rate for each month
    summary = []
    for month, data in sorted(monthly_data.items(), reverse=True):
        total_income = data['income']
        total_expenses = data['expenses']
        savings = total_income - total_expenses
        saving_rate = (savings / total_income * 100) if total_income > 0 else 0

        # Prepare income category data with transactions
        # Include categories that have transactions even if total is 0 (for predictions)
        income_categories_with_transactions = {}
        all_income_categories = set(data['income_categories'].keys()) | set(data['income_transactions'].keys())
        for category in all_income_categories:
            total = data['income_categories'].get(category, 0)
            transactions = data['income_transactions'].get(category, [])
            if transactions:  # Only include if there are transactions
                income_categories_with_transactions[category] = {
                    'total': round(total, 2),
                    'transactions': sorted(
                        transactions,
                        key=lambda x: x['date'],
                        reverse=True
                    )
                }

        # Prepare expense category data with transactions
        # Include categories that have transactions even if total is 0 (for predictions)
        expense_categories_with_transactions = {}
        all_expense_categories = set(data['expense_categories'].keys()) | set(data['expense_transactions'].keys())
        for category in all_expense_categories:
            total = data['expense_categories'].get(category, 0)
            transactions = data['expense_transactions'].get(category, [])
            if transactions:  # Only include if there are transactions
                expense_categories_with_transactions[category] = {
                    'total': round(total, 2),
                    'transactions': sorted(
                        transactions,
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

        month_summary = {
            'month': month,
            'income': round(total_income, 2),
            'expenses': round(total_expenses, 2),
            'savings': round(savings, 2),
            'saving_rate': round(saving_rate, 2),
            'income_categories': income_categories_with_transactions,
            'expense_categories': expense_categories_with_transactions,
            'internal_transfers': internal_transfers_data,
            'currency_totals': {k: round(v, 2) for k, v in data['currency_totals'].items()}
        }
        
        # Log info about current month
        if month == current_month:
            print(f"📊 Current month ({month}) summary:")
            print(f"   Income categories: {len(income_categories_with_transactions)}")
            print(f"   Expense categories: {len(expense_categories_with_transactions)}")
            for cat_name, cat_data in income_categories_with_transactions.items():
                predicted_count = sum(1 for t in cat_data['transactions'] if t.get('is_predicted'))
                if predicted_count > 0:
                    print(f"   📥 Income category '{cat_name}': {len(cat_data['transactions'])} transactions ({predicted_count} predicted)")
            for cat_name, cat_data in expense_categories_with_transactions.items():
                predicted_count = sum(1 for t in cat_data['transactions'] if t.get('is_predicted'))
                if predicted_count > 0:
                    print(f"   📤 Expense category '{cat_name}': {len(cat_data['transactions'])} transactions ({predicted_count} predicted)")
        
        summary.append(month_summary)

    print(f"Returning summary with {len(summary)} months")
    return jsonify(summary)


@app.route('/api/accounts')
@authenticate_request
@require_auth
def get_accounts():
    """Get accounts from database"""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'

    try:
        accounts = wealth_db.get_accounts(tenant_id)

        # No demo data - users must upload their own data
        if accounts:
            accounts_list = []
            totals = {'EUR': 0, 'CHF': 0}

            for account in accounts:
                account_summary = {
                    'account': account['account_name'],
                    'balance': float(account['balance']) if account['balance'] else 0,
                    'currency': account['currency'],
                    'transaction_count': 0,
                    'last_transaction_date': None
                }
                accounts_list.append(account_summary)

                currency = account['currency']
                balance = float(account['balance']) if account['balance'] else 0
                if currency in totals:
                    totals[currency] += balance

            return jsonify({
                'accounts': accounts_list,
                'totals': {k: round(v, 2) for k, v in totals.items()}
            })
        else:
            # No accounts found - return empty (user will see onboarding)
            return jsonify({'accounts': [], 'totals': {}})
    except Exception as e:
        print(f"Error getting accounts: {e}")
        # On error, return empty accounts (user will see onboarding)
        return jsonify({'accounts': [], 'totals': {}})

@app.route('/api/broker')
@authenticate_request
@require_auth
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
                # ... rest of broker aggregation logic continues here ...

@app.route('/api/projection')
@authenticate_request
@require_auth
def get_projection():
    """Get wealth projection data based on current net worth and savings history"""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'

    try:
        # Get accounts for current net worth
        accounts = wealth_db.get_accounts(tenant_id)
        current_net_worth = sum(account['balance'] for account in accounts)

        # Get summary data for savings calculation
        summary_data = wealth_db.get_summary_data(tenant_id, months=6)

        if not summary_data:
            return jsonify({
                'currentNetWorth': current_net_worth,
                'averageMonthlySavings': 0,
                'averageSavingsRate': 0
            })

        # Calculate average monthly savings from recent months
        total_savings = sum(month['savings'] for month in summary_data)
        total_income = sum(month['income'] for month in summary_data)

        average_monthly_savings = total_savings / len(summary_data) if summary_data else 0
        average_savings_rate = (total_savings / total_income * 100) if total_income > 0 else 0

        return jsonify({
            'currentNetWorth': current_net_worth,
            'averageMonthlySavings': average_monthly_savings,
            'averageSavingsRate': average_savings_rate
        })

    except Exception as e:
        print(f"Error getting projection data: {e}")
        # Return minimal valid data to prevent frontend crash
        return jsonify({
            'currentNetWorth': 0,
            'averageMonthlySavings': 0,
            'averageSavingsRate': 0
        })
    
@app.route('/api/loans')
@authenticate_request
@require_auth
def get_loans():
    parser = BankStatementParser()

    # Parse all KfW loan statements
    base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'credits')
    kfw_folder = os.path.join(base_path, 'kfw')

    loans = []
    total_loan_balance = 0
    total_monthly_payment = 0

    # Parse all KfW PDF files
    if os.path.exists(kfw_folder):
        kfw_files = glob.glob(os.path.join(kfw_folder, '*.pdf')) + glob.glob(os.path.join(kfw_folder, '*.PDF'))
        for kfw_file in kfw_files:
            file_loans = parser.parse_kfw(kfw_file)
            loans.extend(file_loans)

            # Calculate totals
            for loan in file_loans:
                total_loan_balance += loan['current_balance']
                total_monthly_payment += loan['monthly_payment']

    # Sort loans by program type
    loans.sort(key=lambda x: x['program'])

    return jsonify({
        'loans': loans,
        'summary': {
            'total_balance': round(total_loan_balance, 2),
            'total_monthly_payment': round(total_monthly_payment, 2),
            'loan_count': len(loans)
        }
    })


@app.route('/api/categories', methods=['GET'])
@authenticate_request
@require_auth
def get_categories():
    """Get all available categories including custom ones"""
    try:
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        
        # Load default categories from JSON files
        spending_categories = _load_categories('categories_spending.json')
        income_categories = _load_categories('categories_income.json')
        
        # Get tenant-specific custom categories from database
        db_categories = wealth_db.get_categories(tenant_id)
        
        # Combine default and custom categories (return just names)
        all_categories = {
            'income': list(income_categories.keys()) + [c['category_name'] for c in db_categories.get('income', [])],
            'expense': list(spending_categories.keys()) + [c['category_name'] for c in db_categories.get('expense', [])]
        }
        
        return jsonify(all_categories)
    except Exception as e:
        print(f"Error getting categories: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'income': [], 'expense': []})


@app.route('/api/categories', methods=['POST'])
@authenticate_request
@require_auth
def create_custom_category():
    """Create a new custom category"""
    try:
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        data = request.get_json()
        category_name = data.get('name', '').strip()
        category_type = data.get('type', 'expense')
        
        print(f"Creating custom category for tenant {tenant_id}: {category_name} ({category_type})")
        
        if not category_name:
            return jsonify({'error': 'Category name is required'}), 400
        
        if category_type not in ['income', 'expense']:
            return jsonify({'error': 'Category type must be income or expense'}), 400
        
        # Check if category already exists in default categories
        if category_type == 'expense':
            default_categories = _load_categories('categories_spending.json')
        else:
            default_categories = _load_categories('categories_income.json')
        
        if category_name in default_categories:
            return jsonify({'error': 'Category already exists as a default category'}), 400
        
        # Create category in database
        try:
            wealth_db.create_custom_category(tenant_id, category_name, category_type)
            print(f"✓ Custom category created successfully")
            return jsonify({'success': True, 'message': 'Custom category created successfully'})
        except ValueError as e:
            # Duplicate category
            print(f"Category already exists: {e}")
            return jsonify({'error': str(e)}), 400
        
    except Exception as e:
        print(f"Error creating custom category: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to create custom category'}), 500

@app.route('/api/update-category', methods=['POST'])
@authenticate_request
@require_auth
def update_category():
    """Update the category of a specific transaction"""
    try:
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        data = request.get_json()
        transaction = data.get('transaction') or {}
        new_category = data.get('newCategory')

        print(f"=== UPDATE CATEGORY ===")
        print(f"Tenant: {tenant_id}, New category: {new_category}")
        print(f"Transaction data: {transaction}")

        if not transaction:
            print("ERROR: No transaction data provided")
            return jsonify({'error': 'Missing transaction data'}), 400
            
        if not new_category:
            print("ERROR: No new category provided")
            return jsonify({'error': 'Missing newCategory'}), 400

        # Get the transaction hash (should be included in transaction object)
        transaction_hash = transaction.get('transaction_hash')
        
        if not transaction_hash:
            print(f"ERROR: Missing transaction_hash in transaction object. Keys available: {list(transaction.keys())}")
            return jsonify({'error': 'Missing transaction_hash - please refresh the page'}), 400

        print(f"Updating transaction {transaction_hash} to category: {new_category}")

        # Update the category in the database
        wealth_db.create_category_override(
            tenant_id=tenant_id,
            transaction_hash=transaction_hash,
            override_category=new_category,
            reason='Manual user override'
        )

        print(f"✓ Category updated successfully")
        return jsonify({'success': True, 'message': 'Category updated successfully'})

    except Exception as e:
        print(f"Error updating category: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to update category: {str(e)}'}), 500

@app.route('/api/upload-statement', methods=['POST'])
@authenticate_request
@require_auth
def upload_statement():
    """
    Upload and store encrypted bank statements

    Implements the secure file upload process:
    1. Receive client-encrypted file
    2. Add server-side encryption layer
    3. Store encrypted blob with metadata
    4. Return secure reference for future access
    """
    try:
        if 'encryptedFile' not in request.files or 'encryptionMetadata' not in request.form:
            return jsonify({'error': 'Missing encrypted file or metadata'}), 400

        encrypted_file = request.files['encryptedFile']
        metadata_str = request.form['encryptionMetadata']

        # Parse encryption metadata
        try:
            metadata = json.loads(metadata_str)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid encryption metadata'}), 400

        # Read the client-encrypted file data
        client_ciphertext = encrypted_file.read()

        # Get encryption service for server-side encryption
        encryption_service = get_encryption_service()

        # Create server-side encryption metadata
        server_metadata = {
            'client_encryption': metadata,
            'server_encryption': {
                'algorithm': 'AES-256-GCM',
                'encrypted_at': datetime.now(timezone.utc).isoformat()
            },
            'file_info': {
                'original_name': metadata['originalName'],
                'original_size': metadata['originalSize'],
                'original_type': metadata['originalType'],
                'uploaded_at': datetime.now(timezone.utc).isoformat()
            }
        }

        # Encrypt with server-side encryption
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        associated_data = json.dumps(server_metadata, sort_keys=True).encode()
        server_encrypted_data = encryption_service.encrypt_data(
            client_ciphertext,
            tenant_id,
            associated_data
        )

        # Store encrypted file in database
        file_record = wealth_db.store_encrypted_file(
            tenant_id=tenant_id,
            encrypted_data=server_encrypted_data['encrypted_data'],
            metadata=server_metadata
        )

        return jsonify({
            'success': True,
            'file_id': file_record['id'],
            'message': 'File uploaded and encrypted successfully'
        })
    except Exception as e:
        print(f"Error uploading statement: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to upload statement'}), 500


# In-memory progress tracking (keyed by upload_id)
upload_progress = {}

@app.route('/api/upload-csv', methods=['POST'])
@authenticate_request
@require_auth
def upload_csv():
    """
    Upload and parse CSV bank statements (YUH or DKB format)
    """
    try:
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        bank_type = request.form.get('bankType', 'auto')  # 'yuh', 'dkb', or 'auto'
        upload_id = request.form.get('uploadId')  # Optional upload ID for progress tracking
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Initialize progress tracking
        if upload_id:
            upload_progress[upload_id] = {
                'total': 0,
                'processed': 0,
                'imported': 0,
                'skipped': 0,
                'status': 'parsing'
            }
        
        # Save file temporarily
        import tempfile
        import uuid
        temp_dir = tempfile.gettempdir()
        temp_filename = f"{uuid.uuid4()}_{file.filename}"
        temp_path = os.path.join(temp_dir, temp_filename)
        file.save(temp_path)
        
        try:
            parser = BankStatementParser()
            
            # Parse based on bank type or auto-detect
            print(f"Parsing CSV file: {file.filename}, bank_type: {bank_type}")
            transactions = []
            
            if bank_type == 'yuh':
                transactions = parser.parse_yuh(temp_path)
                print(f"Parsed as YUH, found {len(transactions)} transactions")
            elif bank_type == 'dkb':
                transactions = parser.parse_dkb(temp_path)
                print(f"Parsed as DKB, found {len(transactions)} transactions")
            else:
                # Auto-detect: Try DKB first if filename suggests DKB (contains "Umsatzliste" or "Girokonto" or "Tagesgeld")
                filename_lower = file.filename.lower()
                if 'umsatzliste' in filename_lower or 'girokonto' in filename_lower or 'tagesgeld' in filename_lower or 'dkb' in filename_lower:
                    print(f"Auto-detecting as DKB based on filename: {file.filename}")
                    transactions = parser.parse_dkb(temp_path)
                    print(f"Auto-detected as DKB, parsed {len(transactions)} transactions")
                elif 'yuh' in filename_lower:
                    print(f"Auto-detecting as YUH based on filename: {file.filename}")
                    transactions = parser.parse_yuh(temp_path)
                    print(f"Auto-detected as YUH, parsed {len(transactions)} transactions")
                else:
                    # Try YUH first, then DKB
                    try:
                        transactions = parser.parse_yuh(temp_path)
                        print(f"Auto-detected as YUH, parsed {len(transactions)} transactions")
                    except Exception as e:
                        print(f"YUH parsing failed: {e}, trying DKB...")
                        transactions = parser.parse_dkb(temp_path)
                        print(f"Auto-detected as DKB, parsed {len(transactions)} transactions")
            
            print(f"Total transactions parsed: {len(transactions)}")
            
            if len(transactions) == 0:
                if upload_id:
                    upload_progress.pop(upload_id, None)
                return jsonify({
                    'success': False,
                    'error': 'No transactions found in CSV file. Please check the file format.',
                    'imported': 0,
                    'skipped': 0
                }), 400
            
            # Update progress: parsing complete, starting processing
            if upload_id:
                upload_progress[upload_id] = {
                    'total': len(transactions),
                    'processed': 0,
                    'imported': 0,
                    'skipped': 0,
                    'status': 'processing'
                }
            
            print(f"Starting to import {len(transactions)} transactions into database...")
            # Create accounts and transactions in database
            created_accounts = {}
            imported_count = 0
            skipped_count = 0
            
            for idx, trans in enumerate(transactions):
                if (idx + 1) % 100 == 0:
                    print(f"Processing transaction {idx + 1}/{len(transactions)}...")
                    # Update progress every 100 transactions
                    if upload_id and upload_id in upload_progress:
                        upload_progress[upload_id]['processed'] = idx + 1
                        upload_progress[upload_id]['imported'] = imported_count
                        upload_progress[upload_id]['skipped'] = skipped_count
                
                account_name = trans.get('account', 'Unknown')
                
                # Create account if it doesn't exist
                if account_name not in created_accounts:
                    try:
                        # Check if account already exists
                        existing_accounts = wealth_db.get_accounts(tenant_id)
                        account_id = None
                        for acc in existing_accounts:
                            if acc.get('account_name') == account_name:
                                account_id = acc.get('id')
                                break
                        
                        if not account_id:
                            # Determine account type and institution
                            if 'YUH' in account_name:
                                account_type, institution, currency = ('checking', 'YUH', 'CHF')
                            elif 'DKB' in account_name:
                                account_type, institution, currency = ('checking', 'DKB', 'EUR')
                            else:
                                account_type, institution, currency = ('checking', 'Misc', 'EUR')
                            
                            # Get balance from parser if available
                            balance = 0
                            if account_name in parser.account_balances:
                                balance = parser.account_balances[account_name].get('balance', 0)
                            
                            account = wealth_db.create_account(tenant_id, {
                                'name': account_name,
                                'type': account_type,
                                'balance': balance,
                                'currency': currency,
                                'institution': institution
                            })
                            account_id = account['id']
                        created_accounts[account_name] = account_id
                    except Exception as e:
                        print(f"Error creating account {account_name}: {e}")
                        continue
                
                # Create transaction
                account_id = created_accounts[account_name]
                try:
                    transaction_data = {
                        'date': trans['date'],
                        'amount': abs(trans['amount']),
                        'currency': trans['currency'],
                        'type': trans['type'],
                        'description': trans.get('description', ''),
                        'recipient': trans.get('recipient', ''),
                        'category': trans.get('category', 'Uncategorized')
                    }

                    result = wealth_db.create_transaction(tenant_id, account_id, transaction_data)
                    if result:
                        imported_count += 1
                    else:
                        skipped_count += 1
                except Exception as e:
                    if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                        skipped_count += 1
                    else:
                        print(f"Error creating transaction: {e}")

            print(f"Finished importing transactions. Imported: {imported_count}, Skipped: {skipped_count}")
            print(f"Tenant ID used for import: {tenant_id}")
            
            # Update final progress
            if upload_id:
                upload_progress[upload_id] = {
                    'total': len(transactions),
                    'processed': len(transactions),
                    'imported': imported_count,
                    'skipped': skipped_count,
                    'status': 'complete'
                }
            
            # Clean up temp file
            os.remove(temp_path)

            print(f"Returning success response with {imported_count} imported transactions")
            return jsonify({
                'success': True,
                'message': f'Successfully imported {imported_count} transactions',
                'imported': imported_count,
                'skipped': skipped_count,
                'accounts_created': len(created_accounts),
                'tenant_id': tenant_id  # Include tenant_id in response for debugging
            })

        except Exception as e:
            # Clean up temp file on error
            if os.path.exists(temp_path):
                os.remove(temp_path)
            # Clean up progress tracking
            if upload_id:
                upload_progress.pop(upload_id, None)
            print(f"Error parsing CSV: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Failed to parse CSV file: {str(e)}'}), 500

    except Exception as e:
        import traceback
        print(f"Error uploading CSV: {e}")
        traceback.print_exc()
        # Clean up progress tracking
        if upload_id:
            upload_progress.pop(upload_id, None)
        return jsonify({'error': 'Failed to upload CSV file'}), 500


@app.route('/api/upload-progress/<upload_id>', methods=['GET'])
@authenticate_request
@require_auth
def get_upload_progress(upload_id):
    """Get progress for a specific upload"""
    if upload_id in upload_progress:
        progress = upload_progress[upload_id]
        return jsonify({
            'success': True,
            'total': progress['total'],
            'processed': progress['processed'],
            'imported': progress['imported'],
            'skipped': progress['skipped'],
            'status': progress['status'],
            'progress_percent': round((progress['processed'] / progress['total'] * 100) if progress['total'] > 0 else 0)
        })
    else:
        return jsonify({
            'success': False,
            'error': 'Upload ID not found'
        }), 404


@app.route('/api/predictions/dismiss', methods=['POST'])
@authenticate_request
@require_auth
def dismiss_prediction():
    """
    Dismiss a prediction so it won't show up again
    """
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    
    try:
        data = request.get_json()
        prediction_key = data.get('prediction_key')
        recurrence_type = data.get('recurrence_type', 'monthly')
        
        if not prediction_key:
            return jsonify({'error': 'prediction_key is required'}), 400
        
        # Calculate expiry date based on recurrence type
        from datetime import timedelta
        current_date = datetime.now()
        
        if recurrence_type == 'monthly':
            # Expire after 2 months
            expires_at = current_date + timedelta(days=60)
        elif recurrence_type == 'quarterly':
            # Expire after 4 months
            expires_at = current_date + timedelta(days=120)
        elif recurrence_type == 'yearly':
            # Expire after 14 months
            expires_at = current_date + timedelta(days=420)
        else:
            # Default: 2 months
            expires_at = current_date + timedelta(days=60)
        
        # Store dismissal in database
        with wealth_db.db.get_cursor() as cursor:
            # Get tenant DB ID
            cursor.execute(
                "SELECT id FROM tenants WHERE tenant_id = %s",
                [tenant_id]
            )
            tenant_result = cursor.fetchone()
            if not tenant_result:
                return jsonify({'error': 'Tenant not found'}), 404
            
            tenant_db_id = tenant_result[0]
            
            # Insert or update dismissal
            cursor.execute("""
                INSERT INTO prediction_dismissals 
                (tenant_id, prediction_key, expires_at)
                VALUES (%s, %s, %s)
                ON CONFLICT (prediction_key) 
                DO UPDATE SET dismissed_at = CURRENT_TIMESTAMP, expires_at = EXCLUDED.expires_at
            """, [tenant_db_id, prediction_key, expires_at.date()])
        
        return jsonify({
            'success': True,
            'message': 'Prediction dismissed successfully'
        })
        
    except Exception as e:
        print(f"Error dismissing prediction: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to dismiss prediction'}), 500


@app.route('/api/download-statement/<file_id>', methods=['GET'])
@authenticate_request
@require_auth
def download_statement(file_id):
    """
    Download and decrypt a previously uploaded statement

    Implements secure file retrieval with proper decryption
    """
    try:
        storage_dir = os.path.join(os.path.dirname(__file__), 'encrypted_storage')

        # Load encrypted metadata
        metadata_path = os.path.join(storage_dir, f"{file_id}.meta.enc")
        with open(metadata_path, 'r', encoding='utf-8') as f:
            encrypted_metadata = f.read()

        # Decrypt metadata
        metadata_package = decrypt_sensitive_data(encrypted_metadata)
        server_encrypted_data = metadata_package['server_encrypted']
        server_metadata = metadata_package['server_metadata']

        # Load encrypted file
        file_path = os.path.join(storage_dir, file_id)
        with open(file_path, 'rb') as f:
            server_ciphertext = f.read()

        # Reconstruct server encryption data
        server_encrypted = EncryptedData(
            ciphertext=server_ciphertext,
            nonce=base64.b64decode(server_encrypted_data['nonce']),
            key_version=server_encrypted_data['key_version'],
            algorithm=server_encrypted_data['algorithm'],
            encrypted_at=server_encrypted_data['encrypted_at']
        )

        # Decrypt server layer
        encryption_service = get_encryption_service()
        tenant_id = server_metadata['client_encryption'].get('tenantId', 'default')
        associated_data = json.dumps(server_metadata, sort_keys=True).encode()

        client_ciphertext = encryption_service.decrypt_data(
            server_encrypted,
            tenant_id,
            associated_data
        )

        # Return the client-encrypted data (client will decrypt the final layer)
        # In a production app, you might want to implement session-based access control here
        return jsonify({
            'encryptedData': base64.b64encode(client_ciphertext).decode(),
            'metadata': server_metadata['client_encryption']
        })

    except FileNotFoundError:
        return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        print(f"Error downloading statement {file_id}: {e}")
        return jsonify({'error': 'Failed to retrieve file'}), 500

@app.route('/api/essential-categories', methods=['GET'])
@authenticate_request
def get_essential_categories():
    """Get user's essential categories preferences"""
    try:
        tenant_id = g.session_claims.get('tenant')
        if not tenant_id:
            return jsonify({'error': 'Tenant ID not found'}), 400
        
        categories = wealth_db.get_essential_categories(tenant_id)
        return jsonify({'categories': categories}), 200
    except Exception as e:
        print(f"Error fetching essential categories: {e}")
        return jsonify({'error': 'Failed to fetch essential categories'}), 500

@app.route('/api/essential-categories', methods=['POST'])
@authenticate_request
def save_essential_categories():
    """Save user's essential categories preferences"""
    try:
        tenant_id = g.session_claims.get('tenant')
        if not tenant_id:
            return jsonify({'error': 'Tenant ID not found'}), 400
        
        data = request.get_json()
        categories = data.get('categories', [])
        
        if not isinstance(categories, list):
            return jsonify({'error': 'Categories must be an array'}), 400
        
        wealth_db.save_essential_categories(tenant_id, categories)
        return jsonify({'success': True, 'categories': categories}), 200
    except Exception as e:
        print(f"Error saving essential categories: {e}")
        return jsonify({'error': 'Failed to save essential categories'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001, use_reloader=True, reloader_type='stat')
