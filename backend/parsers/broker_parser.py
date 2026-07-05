"""
Broker Statement Parsers

Parsers for broker statements and depot overviews.
Supports: Interactive Brokers (Flex CSV)
"""

import csv
from datetime import datetime
from parsers.base_parser import BaseParser

ACCOUNT_NAME = 'Interactive Brokers'
IBKR_ENCODINGS = ['utf-8-sig', 'utf-8', 'windows-1252', 'iso-8859-1', 'cp1252']


def _parse_flex_date(value: str) -> str:
    value = (value or '').strip().strip('"').split(';')[0].split(' ')[0]
    if not value:
        return datetime.now().date().isoformat()
    if len(value) == 8 and value.isdigit():
        return datetime.strptime(value, '%Y%m%d').date().isoformat()
    for fmt in ('%Y-%m-%d', '%d.%m.%Y'):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    return value


def _parse_amount(value) -> float:
    if value is None:
        return 0.0
    cleaned = str(value).strip().strip('"').replace("'", '').replace(',', '')
    if not cleaned:
        return 0.0
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _read_ibkr_flex_sections(filepath):
    sections = {}
    current = None
    headers = None

    for encoding in IBKR_ENCODINGS:
        try:
            with open(filepath, 'r', encoding=encoding, newline='') as handle:
                reader = csv.reader(handle)
                for row in reader:
                    if not row:
                        continue
                    tag = row[0]
                    if tag == 'BOS' and len(row) >= 2:
                        current = row[1]
                        headers = None
                        sections.setdefault(current, [])
                    elif current and headers is None and tag not in ('BOF', 'BOA', 'BOS', 'EOS', 'EOA', 'EOF'):
                        headers = row
                    elif current and headers and tag not in ('BOF', 'BOA', 'BOS', 'EOS', 'EOA', 'EOF'):
                        sections[current].append(dict(zip(headers, row)))
                    elif tag == 'EOS':
                        current = None
                        headers = None
            return sections
        except UnicodeDecodeError:
            continue
    return sections


class IBKRParser(BaseParser):
    """Parser for Interactive Brokers Activity Flex Query CSV (BOS/TRNT/CTRN format)."""

    def parse(self, filepath):
        transactions = []
        holdings = {}

        try:
            sections = _read_ibkr_flex_sections(filepath)
        except Exception as error:
            print(f"Error reading IBKR CSV {filepath}: {error}")
            return {'transactions': transactions, 'holdings': [], 'cash_balances': {}}

        for row in sections.get('TRNT', []):
            asset_class = (row.get('AssetClass') or '').upper()
            symbol = (row.get('Symbol') or '').strip()
            if not symbol:
                continue

            trade_date = _parse_flex_date(row.get('TradeDate') or row.get('DateTime'))
            currency = row.get('CurrencyPrimary') or 'USD'
            proceeds = _parse_amount(row.get('Proceeds'))
            net_cash = _parse_amount(row.get('NetCash'))
            amount = net_cash if net_cash else proceeds
            if amount == 0:
                continue

            if asset_class == 'CASH':
                transactions.append({
                    'date': trade_date,
                    'security': row.get('Description') or symbol,
                    'symbol': symbol,
                    'amount': amount,
                    'currency': currency,
                    'type': 'forex',
                    'activity_type': 'forex',
                    'account': ACCOUNT_NAME,
                    'category': 'Internal Transfer',
                })
                continue

            if asset_class != 'STK':
                continue

            quantity = _parse_amount(row.get('Quantity'))
            buy_sell = (row.get('Buy/Sell') or '').upper()
            is_sell = buy_sell == 'SELL' or quantity < 0
            shares = abs(quantity)
            trade_amount = abs(amount)
            isin = (row.get('ISIN') or '').strip()
            security = row.get('Description') or symbol

            transactions.append({
                'date': trade_date,
                'security': security,
                'isin': isin,
                'symbol': symbol,
                'shares': shares,
                'amount': trade_amount if is_sell else -trade_amount,
                'currency': currency,
                'type': 'sell' if is_sell else 'buy',
                'activity_type': 'trade',
                'account': ACCOUNT_NAME,
            })

            key = isin or symbol
            if key not in holdings:
                holdings[key] = {
                    'isin': isin,
                    'security': security,
                    'symbol': symbol,
                    'shares': 0,
                    'total_cost': 0,
                    'current_value': 0,
                    'account': ACCOUNT_NAME,
                    'currency': currency,
                    'date': trade_date,
                }
            if is_sell:
                holdings[key]['shares'] -= shares
                holdings[key]['total_cost'] -= trade_amount
                holdings[key]['current_value'] -= trade_amount
            else:
                holdings[key]['shares'] += shares
                holdings[key]['total_cost'] += trade_amount
                holdings[key]['current_value'] += trade_amount

        for row in sections.get('CTRN', []):
            if (row.get('Type') or '') != 'Deposits/Withdrawals':
                continue
            amount = _parse_amount(row.get('Amount'))
            if amount == 0:
                continue
            currency = row.get('CurrencyPrimary') or 'CHF'
            description = row.get('Description') or ''
            description_lower = description.lower()
            is_incoming_wire = 'disbursement initiated by' in description_lower or 'cash receipts' in description_lower
            if is_incoming_wire:
                amount = abs(amount)
            txn_type = 'deposit' if amount > 0 else 'withdrawal'
            transactions.append({
                'date': _parse_flex_date(row.get('Date/Time')),
                'security': description or 'Deposit/Withdrawal',
                'amount': amount,
                'currency': currency,
                'type': txn_type,
                'activity_type': 'cash',
                'account': ACCOUNT_NAME,
                'category': 'Internal Transfer',
            })

        return {
            'transactions': transactions,
            'holdings': [h for h in holdings.values() if h['shares'] > 0.000001],
            'cash_balances': {},
        }
