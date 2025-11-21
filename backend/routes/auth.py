"""
Authentication Routes

Handles user registration, login, password reset, and email verification.
"""

import hashlib
import traceback
from flask import Blueprint, request, g
from auth import get_session_manager
from user_management import get_user_manager
from database import get_wealth_database
from middleware.auth_middleware import authenticate_request
from utils.response_helpers import success_response, error_response
from utils.validators import validate_required_fields

# Initialize dependencies
auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')
session_manager = get_session_manager()
wealth_db = get_wealth_database()
user_manager = get_user_manager(wealth_db.db)


@auth_bp.route('/register', methods=['POST'])
def register():
    """
    Register a new user
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        is_valid, error_msg = validate_required_fields(data, ['email', 'password', 'name'])
        if not is_valid:
            return error_response(error_msg, 400)
        
        email = data['email'].strip()
        password = data['password']
        name = data['name'].strip()
        
        # Generate unique tenant_id for new user (use email hash for uniqueness)
        tenant_id = hashlib.sha256(email.encode()).hexdigest()[:16]
        
        success, user_data, error = user_manager.register_user(email, password, name, tenant_id=tenant_id)
        
        if not success:
            return error_response(error, 400)
        
        return success_response(
            data={'user': user_data},
            message='Registration successful. Please check your email to verify your account.'
        )
        
    except Exception as e:
        print(f"Registration error: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        return error_response(f'Registration failed: {str(e)}', 500)


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Authenticate user and create session token with email and password
    """
    try:
        data = request.get_json()
        
        # Support both email and username for backward compatibility
        email = data.get('email', '').strip() or data.get('username', '').strip()
        password = data.get('password', '')

        if not email or not password:
            return error_response('Email and password are required', 400)

        # Try new authentication system first
        success, user_data, error = user_manager.authenticate_user(email, password)
        
        if success:
            # Create session token
            session_token = session_manager.create_session(
                user_id=str(user_data['id']),
                tenant_id=user_data['tenant_id'],
                additional_claims={
                    'email': user_data['email'],
                    'name': user_data['name'],
                    'email_verified': user_data['email_verified']
                }
            )

            return success_response(data={
                'session_token': session_token,
                'user': {
                    'id': user_data['id'],
                    'email': user_data['email'],
                    'name': user_data['name'],
                    'tenant': user_data['tenant_id'],
                    'email_verified': user_data['email_verified']
                }
            })
        
        # Fallback to demo user for backward compatibility
        if email == 'demo@demo' and password == 'demo':
            session_token = session_manager.create_session(
                user_id='demo',
                tenant_id='default',
                additional_claims={'role': 'user', 'email': 'demo@example.com'}
            )
            return success_response(data={
                'session_token': session_token,
                'user': {'id': 'demo', 'email': 'demo@example.com', 'name': 'Demo User'}
            })
        
        return error_response(error or 'Invalid email or password', 401)
        
    except Exception as e:
        print(f"Login error: {e}")
        traceback.print_exc()
        return error_response('Login failed', 500)


@auth_bp.route('/request-password-reset', methods=['POST'])
def request_password_reset():
    """
    Request a password reset email
    """
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        
        if not email:
            return error_response('Email is required', 400)
        
        user_manager.request_password_reset(email)
        
        # Always return success to prevent email enumeration
        return success_response(
            message='If an account exists with this email, a password reset link will be sent.'
        )
    except Exception as e:
        print(f"Password reset request error: {e}")
        return error_response('Failed to process password reset request', 500)


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """
    Reset password with token
    """
    try:
        data = request.get_json()
        
        is_valid, error_msg = validate_required_fields(data, ['token', 'password'])
        if not is_valid:
            return error_response(error_msg, 400)
        
        token = data['token']
        new_password = data['password']
        
        success, error = user_manager.reset_password(token, new_password)
        
        if not success:
            return error_response(error, 400)
        
        return success_response(
            message='Password reset successful. You can now log in with your new password.'
        )
    except Exception as e:
        print(f"Password reset error: {e}")
        return error_response('Failed to reset password', 500)


@auth_bp.route('/verify-email', methods=['POST'])
def verify_email():
    """
    Verify email address with token
    """
    try:
        data = request.get_json()
        token = data.get('token', '')
        
        if not token:
            return error_response('Verification token is required', 400)
        
        success, error = user_manager.verify_email(token)
        
        if not success:
            return error_response(error, 400)
        
        return success_response(message='Email verified successfully!')
        
    except Exception as e:
        print(f"Email verification error: {e}")
        return error_response('Failed to verify email', 500)


@auth_bp.route('/verify', methods=['GET'])
@authenticate_request
def verify_session():
    """Verify current session is valid"""
    if g.session_claims:
        # Get user info from database if available
        user_id = g.session_claims.get('sub')
        user_data = None
        
        if user_id:
            try:
                user = user_manager.get_user_by_id(int(user_id))
                if user:
                    user_data = {
                        'id': user['id'],
                        'email': user['email'],
                        'name': user['name'],
                        'tenant': user['tenant_id'],
                        'email_verified': user.get('email_verified', False)
                    }
            except Exception as e:
                print(f"Error fetching user data: {e}")
        
        # Fallback to claims if user not found in DB
        if not user_data:
            user_data = {
                'id': g.session_claims.get('sub'),
                'email': g.session_claims.get('email'),
                'name': g.session_claims.get('name'),
                'tenant': g.session_claims.get('tenant'),
                'email_verified': g.session_claims.get('email_verified', False)
            }
        
        return success_response(data={
            'valid': True,
            'user': user_data
        })
    else:
        return error_response('Invalid session', 401)

