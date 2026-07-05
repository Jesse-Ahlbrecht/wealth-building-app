"""
Accounts Routes

Handles account listing and summary.

Note: This route contains complex logic that should be moved to a service layer.
For now, it's extracted as-is for modularity.
"""

import traceback
from flask import Blueprint, g, jsonify, request
from database import get_wealth_database
from middleware.auth_middleware import authenticate_request, require_auth
from services.broker_service import load_broker_data
from utils.response_helpers import success_response, error_response

accounts_bp = Blueprint('accounts', __name__, url_prefix='/api')
wealth_db = get_wealth_database()


@accounts_bp.route('/accounts')
@authenticate_request
@require_auth
def get_accounts():
    """Get accounts from database with broker aggregation"""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'

    try:
        accounts = wealth_db.get_accounts(tenant_id)

        accounts_list = []
        totals = {'EUR': 0, 'CHF': 0}

        # Add bank accounts
        if accounts:
            for account in accounts:
                account_summary = {
                    'account': account['account_name'],
                    'balance': float(account['balance']) if account['balance'] else 0,
                    'currency': account['currency'],
                    'transaction_count': 0,
                    'last_transaction_date': None
                }
                accounts_list.append(account_summary)

                currency = account['currency']
                balance = float(account['balance']) if account['balance'] else 0
                if currency in totals:
                    totals[currency] += balance

        # Add broker accounts from broker holdings (reuses broker_service's cached
        # decrypt/parse pipeline instead of re-parsing documents here)
        try:
            ibkr_summary = load_broker_data(tenant_id).get('summary', {}).get('interactive_brokers')
            ibkr_total_value = ibkr_summary['total_value_chf'] if ibkr_summary else 0

            if ibkr_total_value > 0:
                accounts_list.append({
                    'account': 'Interactive Brokers',
                    'balance': ibkr_total_value,
                    'currency': 'CHF',
                    'transaction_count': 0,
                    'last_transaction_date': None
                })
                totals['CHF'] += ibkr_total_value
        except Exception as e:
            print(f"Error adding broker accounts: {e}")
            traceback.print_exc()
            # Continue even if broker accounts fail

        return jsonify({
            'accounts': accounts_list,
            'totals': {k: round(v, 2) for k, v in totals.items()}
        })
    except Exception as e:
        print(f"Error getting accounts: {e}")
        traceback.print_exc()
        # On error, return empty accounts (user will see onboarding)
        return jsonify({'accounts': [], 'totals': {}})


@accounts_bp.route('/accounts/<int:account_id>', methods=['PUT'])
@authenticate_request
@require_auth
def rename_account(account_id):
    """Rename an account"""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    payload = request.get_json(silent=True) or {}
    name = (payload.get('name') or '').strip()

    if not name:
        return error_response('Name is required', 400)

    updated = wealth_db.update_account_name(tenant_id, account_id, name)
    if not updated:
        return error_response('Account not found', 404)

    return success_response(updated)


@accounts_bp.route('/accounts/<int:account_id>', methods=['DELETE'])
@authenticate_request
@require_auth
def delete_account(account_id):
    """Permanently delete an account and all of its transactions"""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'

    deleted = wealth_db.delete_account(tenant_id, account_id)
    if not deleted:
        return error_response('Account not found', 404)

    return success_response({'id': account_id})

