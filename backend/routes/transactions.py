"""
Transaction Routes

Handles transaction retrieval and summary generation.
"""

import traceback
from datetime import datetime
from collections import defaultdict
from flask import Blueprint, g, jsonify
from database import get_wealth_database
from middleware.auth_middleware import authenticate_request, require_auth
from utils.response_helpers import error_response
from category_config import get_bank_savings_movement_categories
from services.broker_savings import merge_broker_savings_into_summary
from services.broker_service import load_broker_data
from services.transfer_pairing import get_transfer_pairs, INTERNAL_TRANSFER
from services.refund_pairing import build_refund_lookup, get_refund_pairs
from services.ibkr_deposit_pairing import get_ibkr_deposit_pairs

transactions_bp = Blueprint('transactions', __name__, url_prefix='/api')
wealth_db = get_wealth_database()

SAVINGS_MOVEMENT_CATEGORIES = get_bank_savings_movement_categories()


@transactions_bp.route('/transactions')
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
        print(f"Error getting transactions: {e}")
        print(traceback.format_exc())
        return jsonify({'error': 'Failed to retrieve transactions'}), 500


@transactions_bp.route('/transactions/transfer-pairs')
@authenticate_request
@require_auth
def list_transfer_pairs():
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    try:
        return jsonify(get_transfer_pairs(wealth_db, tenant_id))
    except Exception as e:
        print(f"Error getting transfer pairs: {e}")
        print(traceback.format_exc())
        return error_response('Failed to retrieve transfer pairs', 500)


@transactions_bp.route('/transactions/refund-pairs')
@authenticate_request
@require_auth
def list_refund_pairs():
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    try:
        return jsonify(get_refund_pairs(wealth_db, tenant_id))
    except Exception as e:
        print(f"Error getting refund pairs: {e}")
        print(traceback.format_exc())
        return error_response('Failed to retrieve refund pairs', 500)


@transactions_bp.route('/transactions/ibkr-deposit-pairs')
@authenticate_request
@require_auth
def list_ibkr_deposit_pairs():
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    try:
        return jsonify(get_ibkr_deposit_pairs(wealth_db, tenant_id))
    except Exception as e:
        print(f"Error getting IBKR deposit pairs: {e}")
        print(traceback.format_exc())
        return error_response('Failed to retrieve IBKR deposit pairs', 500)


@transactions_bp.route('/summary')
@authenticate_request
@require_auth
def get_summary():
    """Get transaction summary from database"""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    print(f"📊 get_summary called with tenant_id: {tenant_id}")

    try:
        # Get all transactions from database
        db_transactions = wealth_db.get_transactions(tenant_id, limit=10000, offset=0)

        print(f"Total transactions from database: {len(db_transactions)}")
        if db_transactions:
            print(f"Sample transaction: date={db_transactions[0].get('transaction_date')}, amount={db_transactions[0].get('amount')}, type={db_transactions[0].get('transaction_type')}")
        
        if len(db_transactions) == 0:
            # No transactions found - return empty array (user will see onboarding)
            print(f"No transactions found for tenant {tenant_id} - returning empty array")
            return jsonify([])
            
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

        skip_refund_hashes = wealth_db.get_active_category_override_hashes(tenant_id)

        expense_refunded, income_refunded = build_refund_lookup(
            db_transactions,
            skip_hashes=skip_refund_hashes,
        )
        
    except Exception as e:
        print(f"Error fetching transactions from database: {e}")
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
        'savings_categories': defaultdict(float),
        'savings_transactions': defaultdict(list),
        'savings_movement_total': 0,
        'internal_transfer_total': 0,
        'internal_transfer_transactions': [],
        'currency_totals': defaultdict(float)
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
            if t['category'] == INTERNAL_TRANSFER:
                monthly_data[month_key]['internal_transfer_total'] += abs(t['amount'])
                monthly_data[month_key]['internal_transfer_transactions'].append({
                    'date': t['date'],
                    'amount': t['amount'],
                    'currency': t['currency'],
                    'recipient': t['recipient'],
                    'description': t['description'],
                    'account': t['account'],
                    'category': t['category'],
                    'type': t['type'],
                    'transaction_hash': t.get('transaction_hash', '')
                })
                monthly_data[month_key]['currency_totals'][t['currency']] += t['amount']
                continue

            if t['type'] == 'income':
                txn_hash = t.get('transaction_hash', '')
                gross = abs(t['amount'])
                refunded = income_refunded.get(txn_hash, 0)
                net = gross - refunded
                income_txn = {
                    'date': t['date'],
                    'amount': t['amount'],
                    'currency': t['currency'],
                    'recipient': t['recipient'],
                    'description': t['description'],
                    'account': t['account'],
                    'category': t['category'],
                    'type': t['type'],
                    'transaction_hash': txn_hash,
                    'refundedAmount': refunded,
                }
                if net > 0.01:
                    monthly_data[month_key]['income'] += net
                    monthly_data[month_key]['income_categories'][t['category']] += net
                if net > 0.01 or refunded > 0:
                    monthly_data[month_key]['income_transactions'][t['category']].append(income_txn)
            elif t['category'] in SAVINGS_MOVEMENT_CATEGORIES:
                amount = abs(t['amount'])
                monthly_data[month_key]['savings_movement_total'] += amount
                monthly_data[month_key]['savings_categories'][t['category']] += amount
                monthly_data[month_key]['savings_transactions'][t['category']].append({
                    'date': t['date'],
                    'amount': t['amount'],
                    'currency': t['currency'],
                    'recipient': t['recipient'],
                    'description': t['description'],
                    'account': t['account'],
                    'category': t['category'],
                    'type': t['type'],
                    'transaction_hash': t.get('transaction_hash', '')
                })
            else:
                txn_hash = t.get('transaction_hash', '')
                gross = abs(t['amount'])
                refunded = expense_refunded.get(txn_hash, 0)
                net = gross - refunded
                if net > 0.01:
                    monthly_data[month_key]['expenses'] += net
                    monthly_data[month_key]['expense_categories'][t['category']] += net
                monthly_data[month_key]['expense_transactions'][t['category']].append({
                    'date': t['date'],
                    'amount': t['amount'],
                    'currency': t['currency'],
                    'recipient': t['recipient'],
                    'description': t['description'],
                    'account': t['account'],
                    'category': t['category'],
                    'type': t['type'],
                    'transaction_hash': txn_hash,
                    'refundedAmount': refunded,
                })

            monthly_data[month_key]['currency_totals'][t['currency']] += t['amount']
        except Exception as e:
            print(f"Error processing transaction {idx}: {e}")
            print(f"Transaction data: {t}")
            traceback.print_exc()
            continue

    print(f"Grouped transactions into {len(monthly_data)} months")

    # Convert to list format
    summary = []
    for month, data in sorted(monthly_data.items(), reverse=True):
        # Convert defaultdicts to regular dicts
        income_categories = dict(data['income_categories'])
        expense_categories = dict(data['expense_categories'])
        savings_categories = dict(data['savings_categories'])
        income_transactions = {k: list(v) for k, v in data['income_transactions'].items()}
        expense_transactions = {k: list(v) for k, v in data['expense_transactions'].items()}
        savings_transactions = {k: list(v) for k, v in data['savings_transactions'].items()}
        
        summary.append({
            'month': month,
            'income': data['income'],
            'expenses': data['expenses'],
            'savings': data['income'] - data['expenses'],
            'savingRate': (data['income'] - data['expenses']) / data['income'] * 100 if data['income'] > 0 else 0,
            'incomeCategories': income_categories,
            'incomeTransactions': income_transactions,
            'expenseCategories': expense_categories,
            'expenseTransactions': expense_transactions,
            'savingsCategories': savings_categories,
            'savingsTransactions': savings_transactions,
            'savingsMovementTotal': data['savings_movement_total'],
            'internalTransferTotal': data['internal_transfer_total'],
            'internalTransferTransactions': data['internal_transfer_transactions'],
            'currencyTotals': dict(data['currency_totals'])
        })

    try:
        broker_data = load_broker_data(tenant_id)
        summary = merge_broker_savings_into_summary(summary, broker_data.get('transactions', []))
    except Exception as broker_error:
        print(f"Warning: failed to merge broker savings into summary: {broker_error}")

    print(f"Returning summary with {len(summary)} months")
    print(f"Sample month data: {summary[0] if summary else 'No months'}")
    return jsonify(summary)
