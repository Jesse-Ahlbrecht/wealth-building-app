"""
Authentication Middleware

Decorators for API authentication and authorization.
"""

from functools import wraps
from flask import request, jsonify, g
from auth import get_session_manager

# Initialize session manager
session_manager = get_session_manager()


def authenticate_request(f):
    """
    Decorator to authenticate API requests and sign responses
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get session token from header
        session_token = request.headers.get('Authorization')
        if session_token and session_token.startswith('Bearer '):
            session_token = session_token[7:]  # Remove 'Bearer ' prefix

        # Validate session
        session_claims = None
        if session_token:
            session_claims = session_manager.validate_session(session_token)

        # Store session info in Flask g object for use in endpoint
        g.session_claims = session_claims
        g.session_token = session_token

        # Call the actual endpoint
        response_data = f(*args, **kwargs)

        # Handle tuple responses (data, status_code)
        status_code = 200
        if isinstance(response_data, tuple):
            response_data, status_code = response_data

        # If it's already a Response object (like from jsonify), extract the JSON data
        if hasattr(response_data, 'get_json'):
            # It's a Response object, extract the JSON data
            json_data = response_data.get_json()
            if json_data is None:
                # If it's not JSON data, return as-is (error responses, etc.)
                return response_data
            response_data = json_data

        # Sign the response
        signed_response = session_manager.create_signed_api_response(
            response_data if isinstance(response_data, dict) else {'data': response_data},
            session_token
        )

        return jsonify(signed_response), status_code

    return decorated_function


def require_auth(f):
    """
    Decorator that requires valid authentication
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not g.session_claims:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

