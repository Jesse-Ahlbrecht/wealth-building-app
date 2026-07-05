from typing import Any, Dict, List, Optional, Set, Tuple

from services.transfer_pairing import (
    INTERNAL_TRANSFER,
    _amounts_match,
    _as_date,
    _format_date,
    _serialize_transaction,
    _txn_account,
    _txn_amount,
    _txn_hash,
)

IBKR_ACCOUNT = 'Interactive Brokers'
IBKR_KEYWORDS = ('interactive brokers', 'ibkr')
DEFAULT_WINDOW_DAYS = 5
DEFAULT_AMOUNT_TOLERANCE = 0.01


def _is_ibkr_bank_transfer(txn: Dict[str, Any]) -> bool:
    if txn.get('category') != INTERNAL_TRANSFER:
        return False
    text = f"{txn.get('recipient', '')} {txn.get('description', '')}".lower()
    return any(keyword in text for keyword in IBKR_KEYWORDS)


def _serialize_deposit(deposit: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'date': _format_date(deposit.get('date')),
        'amount': float(deposit.get('amount') or 0),
        'currency': deposit.get('currency') or 'CHF',
        'account': deposit.get('account') or IBKR_ACCOUNT,
        'security': deposit.get('security') or 'Deposit',
        'type': deposit.get('type') or 'deposit',
    }


def _deposit_key(deposit: Dict[str, Any]) -> str:
    amount = abs(float(deposit.get('amount') or 0))
    currency = (deposit.get('currency') or 'CHF').upper()
    return f"{_format_date(deposit.get('date'))}:{amount}:{currency}"


def match_ibkr_deposits_to_bank_transfers(
    ibkr_transactions: List[Dict[str, Any]],
    bank_transactions: List[Dict[str, Any]],
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    amount_tolerance: float = DEFAULT_AMOUNT_TOLERANCE,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    bank_candidates = []
    for txn in bank_transactions:
        if not _is_ibkr_bank_transfer(txn):
            continue
        txn_date = _as_date(txn.get('transaction_date') or txn.get('date'))
        if not txn_date:
            continue
        bank_candidates.append({
            'hash': _txn_hash(txn),
            'date': txn_date,
            'amount': _txn_amount(txn),
            'currency': (txn.get('currency') or 'EUR').upper(),
            'raw': txn,
        })

    deposits = [
        txn for txn in ibkr_transactions
        if txn.get('account') == IBKR_ACCOUNT and txn.get('type') == 'deposit'
    ]

    pairs: List[Dict[str, Any]] = []
    used_bank_hashes: Set[str] = set()
    matched_deposit_keys: Set[str] = set()

    for deposit in sorted(deposits, key=lambda item: _format_date(item.get('date'))):
        deposit_date = _as_date(deposit.get('date'))
        if not deposit_date:
            continue
        deposit_amount = abs(float(deposit.get('amount') or 0))
        deposit_currency = (deposit.get('currency') or 'CHF').upper()
        deposit_key = _deposit_key(deposit)

        best_bank = None
        best_day_diff = None
        for bank in bank_candidates:
            if bank['hash'] in used_bank_hashes:
                continue
            if bank['currency'] != deposit_currency:
                continue
            if not _amounts_match(bank['amount'], deposit_amount, amount_tolerance):
                continue
            day_diff = abs((deposit_date - bank['date']).days)
            if day_diff > window_days:
                continue
            if best_bank is None or day_diff < best_day_diff:
                best_bank = bank
                best_day_diff = day_diff

        if not best_bank:
            continue

        used_bank_hashes.add(best_bank['hash'])
        matched_deposit_keys.add(deposit_key)
        bank_serialized = _serialize_transaction(best_bank['raw'])
        deposit_serialized = _serialize_deposit(deposit)

        deposit['matched_bank_transfer'] = {
            'date': bank_serialized['date'],
            'amount': abs(float(bank_serialized['amount'])),
            'currency': bank_serialized['currency'],
            'account': bank_serialized['account'],
            'transaction_hash': bank_serialized['transaction_hash'],
        }

        pairs.append({
            'id': f"{best_bank['hash']}:{deposit_key}",
            'amount': round(deposit_amount, 2),
            'currency': deposit_currency,
            'dayDiff': best_day_diff or 0,
            'bank': bank_serialized,
            'deposit': deposit_serialized,
        })

    unmatched_bank = [
        _serialize_transaction(candidate['raw'])
        for candidate in bank_candidates
        if candidate['hash'] not in used_bank_hashes
    ]
    unmatched_deposits = [
        _serialize_deposit(deposit)
        for deposit in deposits
        if _deposit_key(deposit) not in matched_deposit_keys
    ]

    return pairs, unmatched_bank, unmatched_deposits


def get_ibkr_deposit_pairs(
    wealth_db,
    tenant_id: str,
    *,
    ibkr_transactions: Optional[List[Dict[str, Any]]] = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    amount_tolerance: float = DEFAULT_AMOUNT_TOLERANCE,
) -> Dict[str, Any]:
    if ibkr_transactions is None:
        from services.broker_service import load_broker_data
        ibkr_transactions = load_broker_data(tenant_id).get('transactions', [])

    bank_transactions = wealth_db.get_transactions(tenant_id, limit=50000)
    pairs, unmatched_bank, unmatched_deposits = match_ibkr_deposits_to_bank_transfers(
        ibkr_transactions,
        bank_transactions,
        window_days=window_days,
        amount_tolerance=amount_tolerance,
    )
    return {
        'pairs': pairs,
        'unmatchedBank': unmatched_bank,
        'unmatchedDeposits': unmatched_deposits,
    }
