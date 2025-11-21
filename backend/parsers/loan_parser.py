"""
Loan Statement Parsers

Parsers for loan and credit statements.
Supports: KfW (German student loans)
"""

import re
from datetime import datetime
from PyPDF2 import PdfReader
from parsers.base_parser import BaseParser


class KfWParser(BaseParser):
    """Parser for KfW German student loan statements (PDF)"""
    
    def parse(self, filepath):
        """Parse KfW student loan statements from PDF files"""
        loans = []
        
        try:
            reader = PdfReader(filepath)
            text = ""
            for page in reader.pages:
                text += page.extract_text()
            
            # Extract statement date
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
            
            # Extract current balance
            balance_matches = re.findall(
                r'(?:Kapitalsaldo zum|Kontostand per)\s+\d{2}\.\d{2}\.\d{4}\s+([\d.,]+)', 
                text
            )
            current_balance = 0
            if balance_matches:
                balance_str = balance_matches[-1].replace('.', '').replace(',', '.')
                current_balance = float(balance_str)
            
            # Extract interest rate
            interest_match = re.search(r'ab \d{2}\.\d{2}\.\d{4}:\s*([\d.,]+)\s*%', text)
            interest_rate = 0
            if interest_match:
                interest_str = interest_match.group(1).replace(',', '.')
                interest_rate = float(interest_str)
            
            # Extract monthly payment
            payment_match = re.search(r'Lastschrift\s+([\d.,]+)', text)
            monthly_payment = 0
            if payment_match:
                payment_str = payment_match.group(1).replace('.', '').replace(',', '.')
                monthly_payment = float(payment_str)
            
            # Extract deferred interest
            deferred_interest_match = re.search(r'Aufgeschobene Zinsen:\s*([\d.,]+)\s*EUR', text)
            deferred_interest = 0
            if deferred_interest_match:
                deferred_str = deferred_interest_match.group(1).replace('.', '').replace(',', '.')
                deferred_interest = float(deferred_str)
            
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
