from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple


INTERNAL_TRANSFER = 'Internal Transfer'
DEFAULT_WINDOW_DAYS = 5
DEFAULT_AMOUNT_TOLERANCE = 0.01


def _as_date(value) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).split('T')[0]
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        return None


def _format_date(value) -> str:
    parsed = _as_date(value)
    return parsed.isoformat() if parsed else ''


def _txn_amount(txn: Dict[str, Any]) -> float:
    return abs(float(txn.get('amount') or 0))


def _txn_account(txn: Dict[str, Any]) -> str:
    return (txn.get('account_name') or txn.get('account') or '').strip()


def _txn_hash(txn: Dict[str, Any]) -> str:
    return txn.get('transaction_hash') or ''


def _amounts_match(left: float, right: float, tolerance: float) -> bool:
    return abs(left - right) <= tolerance


def _serialize_transaction(txn: Dict[str, Any]) -> Dict[str, Any]:
    txn_type = txn.get('transaction_type') or txn.get('type') or 'expense'
    return {
        'transaction_hash': _txn_hash(txn),
        'date': _format_date(txn.get('transaction_date') or txn.get('date')),
        'amount': float(txn.get('amount') or 0),
        'currency': txn.get('currency') or 'EUR',
        'type': txn_type,
        'account': _txn_account(txn),
        'recipient': txn.get('recipient') or '',
        'description': txn.get('description') or '',
        'category': txn.get('category') or '',
    }


def _normalize_for_pairing(
    transactions: List[Dict[str, Any]],
    *,
    skip_hashes: Set[str],
    only_uncategorized: bool,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    expenses = []
    incomes = []
    by_hash: Dict[str, Dict[str, Any]] = {}

    for txn in transactions:
        txn_hash = _txn_hash(txn)
        if not txn_hash or txn_hash in skip_hashes:
            continue
        if only_uncategorized and txn.get('category') == INTERNAL_TRANSFER:
            continue

        txn_date = _as_date(txn.get('transaction_date') or txn.get('date'))
        if not txn_date:
            continue

        account = _txn_account(txn)
        if not account:
            continue

        amount = _txn_amount(txn)
        if amount <= 0:
            continue

        by_hash[txn_hash] = txn
        normalized = {
            'hash': txn_hash,
            'date': txn_date,
            'amount': amount,
            'currency': (txn.get('currency') or '').upper(),
            'account': account,
        }
        txn_type = txn.get('transaction_type') or txn.get('type')
        if txn_type == 'expense':
            expenses.append(normalized)
        elif txn_type == 'income':
            incomes.append(normalized)

    return expenses, incomes, by_hash


def _select_transfer_pairs(
    expenses: List[Dict[str, Any]],
    incomes: List[Dict[str, Any]],
    *,
    window_days: int,
    amount_tolerance: float,
) -> List[Tuple[int, int, str, str]]:
    candidates: List[Tuple[int, int, str, str]] = []
    for expense in expenses:
        for income in incomes:
            if expense['account'] == income['account']:
                continue
            if expense['currency'] != income['currency']:
                continue
            if not _amounts_match(expense['amount'], income['amount'], amount_tolerance):
                continue

            day_diff = abs((expense['date'] - income['date']).days)
            if day_diff > window_days:
                continue

            score = (window_days - day_diff) * 1000
            if expense['date'] == income['date']:
                score += 100
            candidates.append((score, day_diff, expense['hash'], income['hash']))

    candidates.sort(key=lambda item: (-item[0], item[1]))

    matched: Set[str] = set()
    pairs: List[Tuple[int, int, str, str]] = []
    for score, day_diff, expense_hash, income_hash in candidates:
        if expense_hash in matched or income_hash in matched:
            continue
        matched.add(expense_hash)
        matched.add(income_hash)
        pairs.append((day_diff, expense_hash, income_hash))

    return pairs


def find_transfer_pairs(
    transactions: List[Dict[str, Any]],
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    amount_tolerance: float = DEFAULT_AMOUNT_TOLERANCE,
    skip_hashes: Optional[Set[str]] = None,
) -> List[Tuple[str, str]]:
    skip_hashes = skip_hashes or set()
    expenses, incomes, _ = _normalize_for_pairing(
        transactions,
        skip_hashes=skip_hashes,
        only_uncategorized=True,
    )
    selected = _select_transfer_pairs(
        expenses,
        incomes,
        window_days=window_days,
        amount_tolerance=amount_tolerance,
    )
    return [(expense_hash, income_hash) for _, expense_hash, income_hash in selected]


def build_transfer_pair_details(
    transactions: List[Dict[str, Any]],
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    amount_tolerance: float = DEFAULT_AMOUNT_TOLERANCE,
    skip_hashes: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    skip_hashes = skip_hashes or set()
    expenses, incomes, by_hash = _normalize_for_pairing(
        transactions,
        skip_hashes=skip_hashes,
        only_uncategorized=False,
    )
    selected = _select_transfer_pairs(
        expenses,
        incomes,
        window_days=window_days,
        amount_tolerance=amount_tolerance,
    )

    pairs = []
    for day_diff, expense_hash, income_hash in selected:
        expense_txn = by_hash.get(expense_hash)
        income_txn = by_hash.get(income_hash)
        if not expense_txn or not income_txn:
            continue
        outflow = _serialize_transaction(expense_txn)
        inflow = _serialize_transaction(income_txn)
        pairs.append({
            'id': f'{expense_hash}:{income_hash}',
            'dayDiff': day_diff,
            'amount': outflow['amount'],
            'currency': outflow['currency'],
            'outflow': outflow,
            'inflow': inflow,
        })

    return pairs


def get_transfer_pairs(
    wealth_db,
    tenant_id: str,
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    amount_tolerance: float = DEFAULT_AMOUNT_TOLERANCE,
) -> Dict[str, Any]:
    wealth_db.set_tenant_context(tenant_id)
    transactions = wealth_db.get_transactions(tenant_id, limit=50000, offset=0)
    skip_hashes = wealth_db.get_active_category_override_hashes(tenant_id)

    pairs = build_transfer_pair_details(
        transactions,
        window_days=window_days,
        amount_tolerance=amount_tolerance,
        skip_hashes=skip_hashes,
    )

    paired_hashes = {hash_value for pair in pairs for hash_value in (pair['outflow']['transaction_hash'], pair['inflow']['transaction_hash'])}
    unmatched = [
        _serialize_transaction(txn)
        for txn in transactions
        if txn.get('category') == INTERNAL_TRANSFER
        and (txn_hash := _txn_hash(txn))
        and txn_hash not in paired_hashes
        and txn_hash not in skip_hashes
    ]

    return {'pairs': pairs, 'unmatched': unmatched}


def apply_transfer_pairs(
    wealth_db,
    tenant_id: str,
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    amount_tolerance: float = DEFAULT_AMOUNT_TOLERANCE,
) -> Dict[str, int]:
    wealth_db.set_tenant_context(tenant_id)
    transactions = wealth_db.get_transactions(tenant_id, limit=50000, offset=0)
    skip_hashes = wealth_db.get_active_category_override_hashes(tenant_id)

    pairs = find_transfer_pairs(
        transactions,
        window_days=window_days,
        amount_tolerance=amount_tolerance,
        skip_hashes=skip_hashes,
    )

    if not pairs:
        return {'pairs': 0, 'updated': 0}

    hashes = sorted({h for pair in pairs for h in pair})
    updated = 0
    with wealth_db.db.get_cursor() as cursor:
        placeholders = ', '.join(['%s'] * len(hashes))
        cursor.execute(
            f"""
            UPDATE transactions
            SET category = %s
            WHERE tenant_id = %s
              AND transaction_hash IN ({placeholders})
              AND category != %s
            """,
            [INTERNAL_TRANSFER, tenant_db_id, *hashes, INTERNAL_TRANSFER],
        )
        updated = cursor.rowcount

    return {'pairs': len(pairs), 'updated': updated}
