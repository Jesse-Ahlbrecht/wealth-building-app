"""
Settings Routes

Handles user settings retrieval and updates.
"""

import traceback
from flask import Blueprint, request, g, jsonify
from database import get_wealth_database
from user_management import get_user_manager
from middleware.auth_middleware import authenticate_request, require_auth
from utils.response_helpers import success_response, error_response

settings_bp = Blueprint('settings', __name__, url_prefix='/api/settings')
wealth_db = get_wealth_database()
user_manager = get_user_manager(wealth_db.db)


@settings_bp.route('', methods=['GET'])
@authenticate_request
@require_auth
def get_settings():
    """Get user settings"""
    try:
        user_id = g.session_claims.get('sub')
        if not user_id:
            return error_response('User ID not found in session', 401)
            
        settings = user_manager.get_user_settings(int(user_id))
        return success_response(data=settings)

    except Exception as e:
        print(f"Error getting settings: {e}")
        traceback.print_exc()
        return error_response('Failed to retrieve settings', 500)


@settings_bp.route('', methods=['PUT'])
@authenticate_request
@require_auth
def update_settings():
    """Update user settings"""
    try:
        user_id = g.session_claims.get('sub')
        if not user_id:
            return error_response('User ID not found in session', 401)
            
        data = request.get_json()
        if not data:
            return error_response('No data provided', 400)
            
        success = user_manager.update_user_settings(int(user_id), data)
        
        if success:
            return success_response(message='Settings updated successfully')
        else:
            return error_response('Failed to update settings', 500)
            
    except Exception as e:
        print(f"Error updating settings: {e}")
        traceback.print_exc()
        return error_response('Failed to update settings', 500)
