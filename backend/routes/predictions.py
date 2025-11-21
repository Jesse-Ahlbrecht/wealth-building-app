"""
Predictions Routes

Handles recurring payment prediction dismissals.
"""

import traceback
from datetime import datetime, timedelta
from flask import Blueprint, g, request, jsonify
from database import get_wealth_database
from middleware.auth_middleware import authenticate_request, require_auth
from utils.response_helpers import success_response, error_response

predictions_bp = Blueprint('predictions', __name__, url_prefix='/api')
wealth_db = get_wealth_database()


@predictions_bp.route('/predictions/dismiss', methods=['POST'])
@authenticate_request
@require_auth
def dismiss_prediction():
    """
    Dismiss a prediction so it won't show up again
    """
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    
    try:
        data = request.get_json()
        prediction_key = data.get('prediction_key')
        recurrence_type = data.get('recurrence_type', 'monthly')
        
        if not prediction_key:
            return error_response('prediction_key is required', 400)
        
        # Calculate expiry date based on recurrence type
        current_date = datetime.now()
        
        if recurrence_type == 'monthly':
            # Expire after 2 months
            expires_at = current_date + timedelta(days=60)
        elif recurrence_type == 'quarterly':
            # Expire after 4 months
            expires_at = current_date + timedelta(days=120)
        elif recurrence_type == 'yearly':
            # Expire after 14 months
            expires_at = current_date + timedelta(days=420)
        else:
            # Default: 2 months
            expires_at = current_date + timedelta(days=60)
        
        # Store dismissal in database
        with wealth_db.db.get_cursor() as cursor:
            # Get tenant DB ID
            cursor.execute(
                "SELECT id FROM tenants WHERE tenant_id = %s",
                [tenant_id]
            )
            tenant_result = cursor.fetchone()
            if not tenant_result:
                return error_response('Tenant not found', 404)
            
            tenant_db_id = tenant_result[0]
            
            # Insert or update dismissal
            cursor.execute("""
                INSERT INTO prediction_dismissals 
                (tenant_id, prediction_key, expires_at)
                VALUES (%s, %s, %s)
                ON CONFLICT (prediction_key) 
                DO UPDATE SET dismissed_at = CURRENT_TIMESTAMP, expires_at = EXCLUDED.expires_at
            """, [tenant_db_id, prediction_key, expires_at.date()])
        
        return success_response(message='Prediction dismissed successfully')
        
    except Exception as e:
        print(f"Error dismissing prediction: {e}")
        traceback.print_exc()
        return error_response('Failed to dismiss prediction', 500)

