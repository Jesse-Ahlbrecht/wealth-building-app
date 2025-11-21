"""
Broker Statement Parsers

Parsers for broker statements and depot overviews.
Supports: VIAC (Swiss), ING DiBa (German)
"""

import csv
import re
from datetime import datetime
from PyPDF2 import PdfReader
from parsers.base_parser import BaseParser


class VIACParser(BaseParser):
    """Parser for VIAC Swiss broker statements (PDF)"""
    
    def parse(self, filepath):
        """Parse VIAC broker statements from PDF files"""
        transactions = []
        
        try:
            reader = PdfReader(filepath)
            text = ""
            for page in reader.pages:
                text += page.extract_text()
            
            # Extract date
            date_match = re.search(r'Basel,\s*(\d{2}\.\d{2}\.\d{4})', text)
            if not date_match:
                return transactions
            
            date_str = date_match.group(1)
            date = datetime.strptime(date_str, '%d.%m.%Y')
            
            # Detect transaction type
            transaction_type_match = re.search(r'Börsenabrechnung\s*-\s*(Kauf|Verkauf)', text)
            is_sell = transaction_type_match and transaction_type_match.group(1) == 'Verkauf'
            transaction_type = 'sell' if is_sell else 'buy'
            
            # Extract security name
            security_match = re.search(
                r'Börsenabrechnung\s*-\s*(?:Kauf|Verkauf)\s+(.+?)(?:\n|Wir haben)', 
                text, 
                re.DOTALL
            )
            security_name = security_match.group(1).strip() if security_match else 'Unknown'
            
            # Extract shares
            shares_match = re.search(r'(\d+\.\d+)\s+Anteile', text)
            shares = float(shares_match.group(1)) if shares_match else 0
            
            # Extract ISIN
            isin_match = re.search(r'ISIN:\s*([A-Z0-9]+)', text)
            isin = isin_match.group(1) if isin_match else ''
            
            # Extract price in USD
            price_match = re.search(r'Kurs:\s*USD\s*([\d\'\.]+)', text)
            price_usd = 0
            if price_match:
                price_str = price_match.group(1).replace('\'', '')
                price_usd = float(price_str)
            
            # Extract total amount in CHF
            amount_match = re.search(r'Verrechneter Betrag:.*?CHF\s*([\d\'\.]+)', text, re.DOTALL)
            amount_chf = 0
            if amount_match:
                amount_str = amount_match.group(1).replace('\'', '')
                amount_chf = float(amount_str)
            
            # Extract valuta date
            valuta_match = re.search(r'Valuta\s*(\d{2}\.\d{2}\.\d{4})', text)
            valuta_date = date
            if valuta_match:
                valuta_date = datetime.strptime(valuta_match.group(1), '%d.%m.%Y')
            
            transactions.append({
                'date': valuta_date.isoformat(),
                'security': security_name,
                'isin': isin,
                'shares': shares,
                'price_usd': price_usd,
                'amount': amount_chf if is_sell else -amount_chf,
                'currency': 'CHF',
                'type': transaction_type,
                'account': 'VIAC'
            })
            
        except Exception as e:
            print(f"Error parsing VIAC PDF {filepath}: {e}")
        
        return transactions


class INGDiBaParser(BaseParser):
    """Parser for ING DiBa German broker depot overview (CSV)"""
    
    def parse(self, filepath):
        """Parse ING DiBa broker depot overview from CSV files"""
        holdings = []
        
        try:
            # Try different encodings
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
            
            # Extract snapshot date
            date_match = re.search(r'vom\s+(\d{2}\.\d{2}\.\d{4})', lines[0])
            snapshot_date = datetime.now()
            if date_match:
                snapshot_date = datetime.strptime(date_match.group(1), '%d.%m.%Y')
            
            # Find header line
            header_idx = None
            for i, line in enumerate(lines):
                if 'ISIN' in line and 'Wertpapiername' in line:
                    header_idx = i
                    break
            
            if header_idx is None:
                return holdings
            
            # Parse CSV
            reader = csv.DictReader(lines[header_idx:], delimiter=';')
            
            for row in reader:
                try:
                    isin = row.get('ISIN', '').strip().strip('"')
                    if not isin:
                        continue
                    
                    security = row.get('Wertpapiername', '').strip().strip('"')
                    
                    shares_str = row.get('Stück/Nominale', '').strip().strip('"')
                    if not shares_str:
                        continue
                    shares = float(shares_str.replace('.', '').replace(',', '.'))
                    
                    purchase_value_str = row.get('Einstandswert', '').strip().strip('"')
                    if not purchase_value_str:
                        continue
                    purchase_value = float(purchase_value_str.replace('.', '').replace(',', '.'))
                    
                    currency = row.get('Währung', 'EUR').strip().strip('"')
                    
                    current_value_str = row.get('Kurswert', '').strip().strip('"')
                    current_value = 0
                    if current_value_str:
                        current_value = float(current_value_str.replace('.', '').replace(',', '.'))
                    
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
                        'purchase_date': '2024-01-16'
                    })
                    
                except (ValueError, KeyError) as e:
                    print(f"Error parsing ING DiBa row: {e}, row: {row}")
                    continue
        
        except Exception as e:
            print(f"Error parsing ING DiBa CSV {filepath}: {e}")
        
        return holdings
