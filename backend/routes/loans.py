"""
Loans Routes

Handles loan data retrieval.
"""

import os
import glob
from flask import Blueprint, g, jsonify
from middleware.auth_middleware import authenticate_request, require_auth

loans_bp = Blueprint('loans', __name__, url_prefix='/api')


@loans_bp.route('/loans')
@authenticate_request
@require_auth
def get_loans():
    """
    Return loan data. Demo PDF parsing is disabled unless ENABLE_DEMO_LOANS=true.
    """
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'

    # Placeholder for future database-backed loans. Currently returns empty sets.
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
            'loan_count': len(loans)
        }
    })

