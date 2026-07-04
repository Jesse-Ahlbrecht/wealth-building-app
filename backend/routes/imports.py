"""
Imports Routes

Normalized client-side import ingestion and coverage overview.
"""

from datetime import datetime, timedelta
from flask import Blueprint, g, request

from database import get_wealth_database
from middleware.auth_middleware import authenticate_request, require_auth
from parsers.base_parser import BaseParser
from utils.response_helpers import success_response, error_response

imports_bp = Blueprint('imports_bp', __name__, url_prefix='/api/imports')
wealth_db = get_wealth_database()


def _serialize_date(value):
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return value


def _infer_account_type(account_name: str, source_type: str = '') -> str:
    name = (account_name or '').lower()
    source = (source_type or '').lower()

    if any(keyword in name for keyword in ['broker', 'viac', 'depot', 'interactive brokers', 'ibkr']) or 'broker' in source:
        return 'brokerage'
    if any(keyword in name for keyword in ['loan', 'kfw']):
        return 'loan'
    if any(keyword in name for keyword in ['tagesgeld', 'savings']):
        return 'savings'
    if 'investment' in name:
        return 'investment'
    return 'checking'


def _get_or_create_account(tenant_id: str, account_name: str, currency: str, source_type: str = '', current_balance=None):
    accounts = wealth_db.get_accounts(tenant_id)
    for account in accounts:
        if account['account_name'] == account_name:
            if current_balance is not None:
                wealth_db.update_account_balance(tenant_id, account['id'], float(current_balance), currency)
            return account

    created = wealth_db.create_account(tenant_id, {
        'name': account_name,
        'type': _infer_account_type(account_name, source_type),
        'balance': float(current_balance) if current_balance is not None else 0,
        'currency': currency
    })
    return {
        'id': created['id'],
        'account_name': created['account_name'],
        'currency': created['currency'],
        'account_type': created['account_type']
    }


def _merge_segments(batches):
    merged = []
    for batch in sorted(batches, key=lambda item: (item['statement_start_date'], item['statement_end_date'])):
        start = batch['statement_start_date']
        end = batch['statement_end_date']
        if not merged:
            merged.append({
                'start_date': start,
                'end_date': end,
                'transaction_count': batch['transaction_count'],
                'import_count': 1
            })
            continue

        previous = merged[-1]
        if start <= previous['end_date'] + timedelta(days=1):
            previous['end_date'] = max(previous['end_date'], end)
            previous['transaction_count'] += batch['transaction_count']
            previous['import_count'] += 1
        else:
            merged.append({
                'start_date': start,
                'end_date': end,
                'transaction_count': batch['transaction_count'],
                'import_count': 1
            })
    return merged


def _calculate_gaps(segments):
    gaps = []
    for previous, current in zip(segments, segments[1:]):
        gap_start = previous['end_date'] + timedelta(days=1)
        gap_end = current['start_date'] - timedelta(days=1)
        if gap_start <= gap_end:
            gaps.append({
                'start_date': gap_start.isoformat(),
                'end_date': gap_end.isoformat(),
                'days': (gap_end - gap_start).days + 1
            })
    return gaps


@imports_bp.route('', methods=['GET'])
@authenticate_request
@require_auth
def get_import_overview():
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'

    try:
        accounts = wealth_db.get_accounts(tenant_id)
        batches = wealth_db.list_import_batches(tenant_id)

        coverage_by_account = {}
        for account in accounts:
            coverage_by_account[account['account_name']] = {
                'accountName': account['account_name'],
                'currency': account['currency'],
                'accountType': account['account_type'],
                'batches': [],
                'segments': [],
                'gaps': [],
                'lastImportAt': None,
                'lastStatementEndDate': None,
                'totalTransactions': 0
            }

        for batch in batches:
            entry = coverage_by_account.setdefault(batch['account_name'], {
                'accountName': batch['account_name'],
                'currency': batch['currency'],
                'accountType': batch['account_type'],
                'batches': [],
                'segments': [],
                'gaps': [],
                'lastImportAt': None,
                'lastStatementEndDate': None,
                'totalTransactions': 0
            })
            entry['batches'].append({
                'id': batch['id'],
                'sourceType': batch['source_type'],
                'filename': batch['filename'],
                'statementStartDate': _serialize_date(batch['statement_start_date']),
                'statementEndDate': _serialize_date(batch['statement_end_date']),
                'transactionCount': batch['transaction_count'],
                'importedCount': batch['imported_count'],
                'skippedCount': batch['skipped_count'],
                'importedAt': _serialize_date(batch['imported_at'])
            })
            entry['totalTransactions'] += batch['transaction_count'] or 0

        for entry in coverage_by_account.values():
            raw_batches = [
                {
                    'statement_start_date': datetime.fromisoformat(batch['statementStartDate']).date(),
                    'statement_end_date': datetime.fromisoformat(batch['statementEndDate']).date(),
                    'transaction_count': batch['transactionCount']
                }
                for batch in entry['batches']
            ]
            segments = _merge_segments(raw_batches) if raw_batches else []
            entry['segments'] = [
                {
                    'startDate': segment['start_date'].isoformat(),
                    'endDate': segment['end_date'].isoformat(),
                    'transactionCount': segment['transaction_count'],
                    'importCount': segment['import_count']
                }
                for segment in segments
            ]
            entry['gaps'] = _calculate_gaps(segments)
            if entry['batches']:
                entry['lastImportAt'] = max(batch['importedAt'] for batch in entry['batches'])
                entry['lastStatementEndDate'] = max(batch['statementEndDate'] for batch in entry['batches'])
                entry['batches'].sort(key=lambda batch: (batch['statementEndDate'], batch['importedAt']), reverse=True)

        overview = {
            'accounts': sorted(coverage_by_account.values(), key=lambda item: item['accountName'].lower()),
            'recentImports': [
                {
                    'id': batch['id'],
                    'accountName': batch['account_name'],
                    'filename': batch['filename'],
                    'sourceType': batch['source_type'],
                    'statementStartDate': _serialize_date(batch['statement_start_date']),
                    'statementEndDate': _serialize_date(batch['statement_end_date']),
                    'transactionCount': batch['transaction_count'],
                    'importedCount': batch['imported_count'],
                    'skippedCount': batch['skipped_count'],
                    'importedAt': _serialize_date(batch['imported_at'])
                }
                for batch in batches[:20]
            ]
        }
        return success_response(overview)
    except Exception as exc:
        return error_response(f'Failed to load import overview: {exc}', 500)


def _statement_dates(batch, transactions):
    return (
        batch.get('statementStartDate') or min(item['date'] for item in transactions),
        batch.get('statementEndDate') or max(item['date'] for item in transactions),
    )


def _record_import_batch(tenant_id, account, account_name, batch, currency, transactions,
                         imported_count, skipped_count, imported_batches, duplicate_file=False):
    statement_start, statement_end = _statement_dates(batch, transactions)
    metadata = {
        'currency': currency,
        'notes': batch.get('notes'),
        'clientParserVersion': batch.get('clientParserVersion', 1),
    }
    if duplicate_file:
        metadata['duplicateFile'] = True

    batch_record = wealth_db.create_import_batch(tenant_id, {
        'account_id': account['id'],
        'source_type': batch.get('sourceType', 'csv_import'),
        'filename': batch.get('filename'),
        'statement_start_date': statement_start,
        'statement_end_date': statement_end,
        'transaction_count': len(transactions),
        'imported_count': imported_count,
        'skipped_count': skipped_count,
        'checksum': batch.get('checksum'),
        'metadata': metadata
    })
    imported_batches.append({
        'id': batch_record['id'],
        'accountName': account_name,
        'importedCount': imported_count,
        'skippedCount': skipped_count,
        'statementStartDate': statement_start,
        'statementEndDate': statement_end
    })


@imports_bp.route('', methods=['POST'])
@authenticate_request
@require_auth
def import_transactions():
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    payload = request.get_json(silent=True) or {}
    batches = payload.get('batches')

    if not isinstance(batches, list) or not batches:
        return error_response('Missing batches', 400)

    categorizer = BaseParser()
    imported_batches = []

    try:
        for batch in batches:
            account_name = (batch.get('accountName') or '').strip()
            transactions = batch.get('transactions') or []
            if not account_name:
                return error_response('Each batch requires accountName', 400)
            if not transactions:
                return error_response(f'Batch for {account_name} has no transactions', 400)

            currency = batch.get('currency') or transactions[0].get('currency') or 'CHF'
            account = _get_or_create_account(
                tenant_id,
                account_name,
                currency,
                batch.get('sourceType', ''),
                batch.get('currentBalance')
            )

            imported_count = 0
            skipped_count = 0

            batch_checksum = batch.get('checksum')
            if batch_checksum and wealth_db.import_batch_checksum_exists(tenant_id, account['id'], batch_checksum):
                _record_import_batch(
                    tenant_id, account, account_name, batch, currency, transactions,
                    0, len(transactions), imported_batches, duplicate_file=True
                )
                continue

            seen_dedup_keys = set()

            for transaction in transactions:
                date_value = transaction.get('date')
                amount = abs(float(transaction.get('amount', 0)))
                transaction_type = transaction.get('type') or ('income' if float(transaction.get('amount', 0)) > 0 else 'expense')
                recipient = transaction.get('recipient', '')
                description = transaction.get('description', '')
                category = transaction.get('category') or categorizer.categorize_transaction(
                    recipient,
                    description,
                    date_value,
                    account_name
                )

                transaction_data = {
                    'date': date_value,
                    'amount': amount,
                    'currency': transaction.get('currency') or currency,
                    'type': transaction_type,
                    'recipient': recipient,
                    'description': description,
                    'reference': transaction.get('reference', ''),
                    'category': category,
                    'subcategory': transaction.get('subcategory'),
                    'tags': transaction.get('tags', [])
                }

                result = wealth_db.create_transaction(
                    tenant_id=tenant_id,
                    account_id=account['id'],
                    transaction_data=transaction_data,
                    seen_dedup_keys=seen_dedup_keys
                )
                if result:
                    imported_count += 1
                else:
                    skipped_count += 1

            _record_import_batch(
                tenant_id, account, account_name, batch, currency, transactions,
                imported_count, skipped_count, imported_batches
            )

        return success_response({'batches': imported_batches}, message='Import completed', status_code=201)
    except Exception as exc:
        return error_response(f'Import failed: {exc}', 500)
