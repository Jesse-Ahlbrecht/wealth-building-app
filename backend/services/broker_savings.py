from category_config import get_broker_savings_category_names
from services.broker_service import IBKR_ACCOUNT

INVESTMENTS_CATEGORY, CASH_CATEGORY = get_broker_savings_category_names()


def _month_key(date_value):
    if not date_value:
        return None
    text = str(date_value).split('T')[0]
    return text[:7] if len(text) >= 7 else None


def _normalize_broker_transaction(txn, category):
    is_buy = txn.get('type') == 'buy'
    amount = abs(float(txn.get('amount') or 0))
    shares = txn.get('shares')
    shares_text = f'{shares} shares · ' if shares else ''
    symbol = txn.get('symbol') or ''

    if is_buy:
        description = f'{shares_text}{symbol}'.strip()
        signed_amount = -amount
    elif txn.get('type') == 'forex':
        description = 'FX conversion'
        signed_amount = amount
    else:
        description = txn.get('type') or ''
        signed_amount = amount if txn.get('type') != 'withdrawal' else -amount

    return {
        'date': txn.get('date'),
        'amount': signed_amount,
        'currency': txn.get('currency'),
        'recipient': txn.get('security') or symbol or IBKR_ACCOUNT,
        'description': description,
        'account': txn.get('account'),
        'category': category,
        'type': 'expense',
    }


def build_broker_monthly_savings(transactions):
    by_month = {}

    for txn in transactions or []:
        if txn.get('account') != IBKR_ACCOUNT:
            continue

        month = _month_key(txn.get('date'))
        if not month:
            continue

        amount = abs(float(txn.get('amount') or 0))
        if not amount:
            continue

        txn_type = txn.get('type')
        if txn_type == 'buy':
            category = INVESTMENTS_CATEGORY
            signed_amount = amount
        elif txn_type in ('deposit', 'sell', 'forex'):
            category = CASH_CATEGORY
            signed_amount = amount
        elif txn_type == 'withdrawal':
            category = CASH_CATEGORY
            signed_amount = -amount
        else:
            continue

        month_data = by_month.setdefault(month, {
            'savings_categories': {},
            'savings_transactions': {},
        })
        month_data['savings_categories'][category] = (
            month_data['savings_categories'].get(category, 0) + signed_amount
        )
        month_data['savings_transactions'].setdefault(category, []).append(
            _normalize_broker_transaction(txn, category)
        )

    return by_month


def merge_broker_savings_into_summary(summary, transactions):
    broker_by_month = build_broker_monthly_savings(transactions)
    if not broker_by_month:
        return summary

    summary_by_month = {item['month']: item for item in summary}

    for month, broker_month in broker_by_month.items():
        if month not in summary_by_month:
            continue

        item = summary_by_month[month]
        savings_categories = dict(item.get('savingsCategories') or {})
        savings_transactions = {
            key: list(value)
            for key, value in (item.get('savingsTransactions') or {}).items()
        }
        movement_total = item.get('savingsMovementTotal') or 0

        for category, amount in broker_month['savings_categories'].items():
            if not amount:
                continue
            savings_categories[category] = savings_categories.get(category, 0) + amount
            movement_total += amount

        for category, txns in broker_month['savings_transactions'].items():
            savings_transactions[category] = savings_transactions.get(category, []) + txns

        item['savingsCategories'] = savings_categories
        item['savingsTransactions'] = savings_transactions
        item['savingsMovementTotal'] = movement_total

    return summary
