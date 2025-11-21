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

transactions_bp = Blueprint('transactions', __name__, url_prefix='/api')
wealth_db = get_wealth_database()


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
        'internal_transfer_total': 0,
        'internal_transfer_transactions': [],
        'currency_totals': {'EUR': 0, 'CHF': 0}
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
            if t['category'] == 'Internal Transfer':
                monthly_data[month_key]['internal_transfer_total'] += abs(t['amount'])
                monthly_data[month_key]['internal_transfer_transactions'].append({
                    'date': t['date'],
                    'amount': t['amount'],
                    'currency': t['currency'],
                    'recipient': t['recipient'],
                    'description': t['description'],
                    'account': t['account'],
                    'transaction_hash': t.get('transaction_hash', '')
                })
                monthly_data[month_key]['currency_totals'][t['currency']] += t['amount']
                continue

            if t['type'] == 'income':
                monthly_data[month_key]['income'] += abs(t['amount'])
                monthly_data[month_key]['income_categories'][t['category']] += abs(t['amount'])
                # Store individual income transactions for each category
                monthly_data[month_key]['income_transactions'][t['category']].append({
                    'date': t['date'],
                    'amount': t['amount'],
                    'currency': t['currency'],
                    'recipient': t['recipient'],
                    'description': t['description'],
                    'account': t['account'],
                    'transaction_hash': t.get('transaction_hash', '')
                })
            else:
                monthly_data[month_key]['expenses'] += abs(t['amount'])
                monthly_data[month_key]['expense_categories'][t['category']] += abs(t['amount'])
                # Store individual expense transactions for each category
                monthly_data[month_key]['expense_transactions'][t['category']].append({
                    'date': t['date'],
                    'amount': t['amount'],
                    'currency': t['currency'],
                    'recipient': t['recipient'],
                    'description': t['description'],
                    'account': t['account'],
                    'transaction_hash': t.get('transaction_hash', '')
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
        income_transactions = {k: list(v) for k, v in data['income_transactions'].items()}
        expense_transactions = {k: list(v) for k, v in data['expense_transactions'].items()}
        
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
            'internalTransferTotal': data['internal_transfer_total'],
            'internalTransferTransactions': data['internal_transfer_transactions'],
            'currencyTotals': data['currency_totals']
        })

    print(f"Returning summary with {len(summary)} months")
    print(f"Sample month data: {summary[0] if summary else 'No months'}")
    return jsonify(summary)

