from collections import defaultdict
from datetime import date, datetime
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from services.categorizer import normalize_merchant_text
from services.transfer_pairing import (
    _as_date,
    _format_date,
    _serialize_transaction,
    _txn_amount,
    _txn_hash,
    INTERNAL_TRANSFER,
)
DEFAULT_REFUND_WINDOW_DAYS = 120
DEFAULT_AMOUNT_TOLERANCE = 0.01

_SKIP_MERCHANT_TOKENS = frozenset({
    'handel', 'geschäfte', 'geschaefte', 'sonstige', 'zahlung', 'gutschrift',
    'erstattung', 'rückerstattung', 'überweisung', 'transfer',
    'partial', 'refund', 'order',
})


def _strip_payment_prefix(value: str) -> str:
    text = (value or '').lower()
    text = re.sub(r'\bs2p\s*\*?\s*', ' ', text)
    text = re.sub(r'\*+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def _canonicalize_merchant(key: str, full_text: str = '') -> str:
    blob = f'{key} {full_text}'.lower()
    for brand in ('tavero', 'intimissimi', 'amazon'):
        if brand in blob:
            return brand
    return key


def merchant_refund_key(recipient: str = '', description: str = '') -> str:
    recipient_key = normalize_merchant_text(_strip_payment_prefix(recipient), for_recipient=True)
    full_text = normalize_merchant_text(_strip_payment_prefix(f'{recipient} {description}'))

    if len(recipient_key) >= 4 and recipient_key not in _SKIP_MERCHANT_TOKENS:
        return _canonicalize_merchant(recipient_key, full_text)

    for token in full_text.split():
        cleaned = token.strip('*')
        if len(cleaned) >= 4 and cleaned not in _SKIP_MERCHANT_TOKENS:
            return _canonicalize_merchant(cleaned, full_text)

    return _canonicalize_merchant(recipient_key or full_text or 'unknown', full_text)


def _normalize_refund_transactions(
    transactions: List[Dict[str, Any]],
    *,
    skip_hashes: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    skip_hashes = skip_hashes or set()
    normalized = []

    for txn in transactions:
        txn_hash = _txn_hash(txn)
        if not txn_hash or txn_hash in skip_hashes:
            continue
        if txn.get('category') == INTERNAL_TRANSFER:
            continue

        txn_date = _as_date(txn.get('transaction_date') or txn.get('date'))
        if not txn_date:
            continue

        amount = _txn_amount(txn)
        if amount <= 0:
            continue

        txn_type = txn.get('transaction_type') or txn.get('type')
        if txn_type not in ('expense', 'income'):
            continue

        category = txn.get('category') or 'Other'
        normalized.append({
            'hash': txn_hash,
            'date': txn_date,
            'amount': amount,
            'currency': (txn.get('currency') or 'EUR').upper(),
            'category': category,
            'merchant': merchant_refund_key(txn.get('recipient') or '', txn.get('description') or ''),
            'type': txn_type,
            'raw': txn,
        })

    return normalized


def allocate_refunds(
    transactions: List[Dict[str, Any]],
    *,
    window_days: int = DEFAULT_REFUND_WINDOW_DAYS,
    amount_tolerance: float = DEFAULT_AMOUNT_TOLERANCE,
    skip_hashes: Optional[Set[str]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, float], Dict[str, float]]:
    normalized = _normalize_refund_transactions(transactions, skip_hashes=skip_hashes)
    groups: Dict[Tuple[str, str, str], Dict[str, List]] = defaultdict(lambda: {'expenses': [], 'incomes': []})

    for txn in normalized:
        key = (txn['merchant'], txn['currency'], txn['category'])
        bucket = 'expenses' if txn['type'] == 'expense' else 'incomes'
        groups[key][bucket].append(txn)

    allocations: List[Dict[str, Any]] = []
    expense_refunded: Dict[str, float] = defaultdict(float)
    income_refunded: Dict[str, float] = defaultdict(float)

    for (merchant, currency, category), group in groups.items():
        expenses = sorted(group['expenses'], key=lambda item: item['date'])
        incomes = sorted(group['incomes'], key=lambda item: item['date'])
        expense_remaining = {item['hash']: item['amount'] for item in expenses}

        for income in incomes:
            income_left = income['amount']
            candidates = [
                expense for expense in expenses
                if expense_remaining[expense['hash']] > amount_tolerance
                and expense['date'] <= income['date']
                and (income['date'] - expense['date']).days <= window_days
            ]
            candidates.sort(
                key=lambda expense: (
                    (income['date'] - expense['date']).days,
                    expense['date'],
                )
            )

            for expense in candidates:
                if income_left <= amount_tolerance:
                    break
                if expense_remaining[expense['hash']] <= amount_tolerance:
                    continue

                allocated = min(income_left, expense_remaining[expense['hash']])
                if allocated <= amount_tolerance:
                    continue

                allocations.append({
                    'id': f"{expense['hash']}:{income['hash']}:{len(allocations)}",
                    'merchant': merchant,
                    'currency': currency,
                    'category': category,
                    'amount': round(allocated, 2),
                    'purchase': _serialize_transaction(expense['raw']),
                    'refund': _serialize_transaction(income['raw']),
                })
                income_left -= allocated
                expense_remaining[expense['hash']] -= allocated
                expense_refunded[expense['hash']] += allocated
                income_refunded[income['hash']] += allocated

    return allocations, dict(expense_refunded), dict(income_refunded)


def build_refund_lookup(
    transactions: List[Dict[str, Any]],
    *,
    window_days: int = DEFAULT_REFUND_WINDOW_DAYS,
    amount_tolerance: float = DEFAULT_AMOUNT_TOLERANCE,
    skip_hashes: Optional[Set[str]] = None,
) -> Tuple[Dict[str, float], Dict[str, float]]:
    _, expense_refunded, income_refunded = allocate_refunds(
        transactions,
        window_days=window_days,
        amount_tolerance=amount_tolerance,
        skip_hashes=skip_hashes,
    )
    return expense_refunded, income_refunded
