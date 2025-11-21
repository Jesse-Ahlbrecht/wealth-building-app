"""
Loans Routes

Handles loan data retrieval.
"""

import os
import glob
from flask import Blueprint, g, jsonify
from middleware.auth_middleware import authenticate_request, require_auth
from database import get_wealth_database

loans_bp = Blueprint('loans', __name__, url_prefix='/api')
wealth_db = get_wealth_database()


@loans_bp.route('/loans')
@authenticate_request
@require_auth
def get_loans():
    """
    Return loan data from database.
    Falls back to demo PDF parsing if ENABLE_DEMO_LOANS=true and no loans in database.
    """
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'

    # Try to get loans from database first
    try:
        loans = wealth_db.get_loans(tenant_id)
        
        # Convert database format to API format
        api_loans = []
        total_loan_balance = 0
        total_monthly_payment = 0
        
        for loan in loans:
            # Map database fields to API response format
            api_loan = {
                'account_number': loan.get('account_number', ''),
                'program': loan.get('loan_name', ''),
                'current_balance': loan.get('current_balance', 0),
                'interest_rate': loan.get('interest_rate', 0),
                'monthly_payment': loan.get('monthly_payment', 0),
                'currency': loan.get('currency', 'EUR'),
                'contract_date': loan.get('origination_date'),
                'statement_date': loan.get('updated_at'),  # Use updated_at as statement_date
                'deferred_interest': 0  # Not stored in database currently
            }
            api_loans.append(api_loan)
            
            total_loan_balance += api_loan['current_balance']
            total_monthly_payment += api_loan['monthly_payment']
        
        # If we have loans from database, return them
        if api_loans:
            return jsonify({
                'loans': api_loans,
                'summary': {
                    'total_balance': round(total_loan_balance, 2),
                    'total_monthly_payment': round(total_monthly_payment, 2),
                    'loan_count': len(api_loans),
                    'currency': api_loans[0]['currency'] if api_loans else 'EUR'
                }
            })
    except Exception as e:
        print(f"Error fetching loans from database: {e}")
        import traceback
        traceback.print_exc()
        # Fall through to demo loans if database fails

    # Fallback to demo loans if database is empty or fails
    loans = []
    total_loan_balance = 0
    total_monthly_payment = 0

    use_demo_loans = os.environ.get('ENABLE_DEMO_LOANS', '').lower() in ('1', 'true', 'yes')

    if use_demo_loans:
        from parsers.loan_parser import LoanParser
        parser = LoanParser()
        base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'credits')
        kfw_folder = os.path.join(base_path, 'kfw')

        if os.path.exists(kfw_folder):
            kfw_files = glob.glob(os.path.join(kfw_folder, '*.pdf')) + glob.glob(os.path.join(kfw_folder, '*.PDF'))
            for kfw_file in kfw_files:
                file_loans = parser.parse_kfw(kfw_file)
                loans.extend(file_loans)

                for loan in file_loans:
                    total_loan_balance += loan['current_balance']
                    total_monthly_payment += loan['monthly_payment']

        loans.sort(key=lambda x: x['program'])

    return jsonify({
        'loans': loans,
        'summary': {
            'total_balance': round(total_loan_balance, 2),
            'total_monthly_payment': round(total_monthly_payment, 2),
            'loan_count': len(loans),
            'currency': loans[0]['currency'] if loans else 'EUR'
        }
    })

