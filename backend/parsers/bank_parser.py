"""
Bank Statement Parsers

Parsers for bank statements from various institutions.
Supports: DKB (German), YUH (Swiss)
"""

import csv
from datetime import datetime
from collections import defaultdict
from parsers.base_parser import BaseParser


class DKBParser(BaseParser):
    """Parser for DKB (Deutsche Kreditbank) German bank statements"""
    
    def _detect_account_type(self, lines):
        """Detect DKB account type from file content"""
        for line in lines[:5]:
            if 'Girokonto' in line:
                return 'DKB Girokonto'
            elif 'Tagesgeld' in line:
                return 'DKB Tagesgeld'
        return 'DKB'
    
    def _extract_balance(self, lines):
        """Extract current balance from DKB CSV header"""
        for line in lines[:10]:
            if 'Kontostand vom' in line:
                parts = line.split(';')
                if len(parts) >= 2:
                    balance_str = parts[1].strip().strip('"').replace('€', '').replace('\xa0', '').strip()
                    balance_str = balance_str.replace('.', '').replace(',', '.')
                    try:
                        return float(balance_str)
                    except ValueError as e:
                        print(f"Error parsing DKB balance: {e}, string was: {repr(balance_str)}")
                        return None
        return None
    
    def parse(self, filepath, account_name=None):
        """Parse DKB German bank statements (EUR)"""
        transactions = []
        
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            lines = f.readlines()
            
            if account_name is None:
                account_name = self._detect_account_type(lines)
            
            balance = self._extract_balance(lines)
            if balance is not None:
                self.account_balances[account_name] = {
                    'balance': balance,
                    'currency': 'EUR'
                }
            
            # Find CSV header
            header_idx = None
            for i, line in enumerate(lines):
                if 'Buchungstag' in line or 'Buchungsdatum' in line or 'Buchung' in line:
                    header_idx = i
                    break
            
            if header_idx is None:
                print(f"Warning: Could not find CSV header in DKB file {filepath}")
                return transactions
            
            reader = csv.DictReader(lines[header_idx:], delimiter=';')
            
            for row_num, row in enumerate(reader, start=1):
                try:
                    # Parse date
                    date_str = (row.get('Buchungstag', '').strip() or 
                               row.get('Buchungsdatum', '').strip() or 
                               row.get('Buchung', '').strip() or
                               row.get('"Buchungstag"', '').strip() or
                               row.get('"Buchungsdatum"', '').strip()).strip('"')
                    if not date_str:
                        continue
                    
                    date = None
                    for fmt in ['%d.%m.%Y', '%d.%m.%y', '%Y-%m-%d']:
                        try:
                            date = datetime.strptime(date_str, fmt)
                            break
                        except ValueError:
                            continue
                    
                    if not date:
                        continue
                    
                    # Parse amount
                    amount_str = (row.get('Betrag', '').strip() or 
                                 row.get('Betrag (€)', '').strip() or
                                 row.get('"Betrag"', '').strip() or
                                 row.get('"Betrag (€)"', '').strip()).strip('"')
                    if not amount_str:
                        continue
                    
                    amount_str = amount_str.replace('.', '').replace(',', '.')
                    try:
                        amount = float(amount_str)
                    except ValueError:
                        continue
                    
                    currency = row.get('Währung', 'EUR').strip().strip('"')
                    if not currency:
                        currency = 'EUR'
                    
                    # Get recipient and description
                    recipient = (row.get('Empfänger/Auftraggeber', '').strip() or 
                                row.get('Empfänger', '').strip() or
                                row.get('Zahlungsempfänger*in', '').strip() or
                                row.get('Zahlungspflichtige*r', '').strip() or
                                row.get('"Zahlungsempfänger*in"', '').strip() or
                                row.get('"Zahlungspflichtige*r"', '').strip()).strip('"')
                    
                    description = (row.get('Verwendungszweck', '').strip() or 
                                  row.get('Buchungstext', '').strip() or
                                  row.get('"Verwendungszweck"', '').strip()).strip('"')
                    
                    transaction_type = 'income' if amount > 0 else 'expense'
                    category = self.categorize_transaction(recipient, description, date.strftime('%Y-%m-%d'), account_name)
                    
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
                    if row_num <= 3:
                        print(f"Error parsing DKB row {row_num}: {e}")
                    continue
        
        print(f"Parsed {len(transactions)} transactions from DKB file {filepath}")
        return transactions


class YUHParser(BaseParser):
    """Parser for YUH Swiss bank statements"""
    
    def parse(self, filepath):
        """Parse YUH Swiss bank statements (CHF)"""
        transactions = []
        yuh_main_balance = 0
        yuh_goal_balances = defaultdict(float)
        
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            
            for row in reader:
                try:
                    date_str = row.get('DATE', '').strip()
                    if not date_str:
                        continue
                    
                    date = datetime.strptime(date_str, '%d/%m/%Y')
                    
                    # Parse amount (CHF only)
                    debit = row.get('DEBIT', '').strip()
                    credit = row.get('CREDIT', '').strip()
                    debit_currency = row.get('DEBIT CURRENCY', '').strip()
                    credit_currency = row.get('CREDIT CURRENCY', '').strip()
                    
                    if debit and debit_currency == 'CHF':
                        amount = float(debit)
                    elif credit and credit_currency == 'CHF':
                        amount = float(credit)
                    else:
                        continue
                    
                    activity_name = row.get('ACTIVITY NAME', '').strip('"')
                    recipient = row.get('RECIPIENT', '').strip('"')
                    locality = row.get('LOCALITY', '').strip('"')
                    activity_type = row.get('ACTIVITY TYPE', '')
                    
                    # Handle goal account transactions
                    if activity_type == 'GOAL_DEPOSIT':
                        goal_name = recipient or locality
                        if goal_name:
                            goal_name = goal_name.strip('"')
                            yuh_goal_balances[goal_name] += amount
                        continue
                    elif activity_type == 'GOAL_WITHDRAWAL':
                        goal_name = recipient or locality
                        if goal_name:
                            goal_name = goal_name.strip('"')
                            yuh_goal_balances[goal_name] += amount
                        continue
                    elif activity_type == 'REWARD_RECEIVED':
                        continue
                    
                    yuh_main_balance += amount
                    
                    category = self.categorize_transaction(
                        recipient or activity_name, 
                        locality, 
                        date.strftime('%Y-%m-%d'), 
                        'YUH'
                    )
                    
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
                    
                except (ValueError, KeyError):
                    continue
        
        # Calculate balances
        total_goal_balance = sum(yuh_goal_balances.values())
        yuh_main_account_balance = yuh_main_balance - total_goal_balance
        
        self.account_balances['YUH'] = {
            'balance': yuh_main_account_balance,
            'currency': 'CHF'
        }
        
        for goal_name, goal_balance in yuh_goal_balances.items():
            account_name = f'YUH - {goal_name}'
            self.account_balances[account_name] = {
                'balance': goal_balance,
                'currency': 'CHF'
            }
        
        return transactions
