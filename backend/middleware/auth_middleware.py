"""
Authentication Middleware

Decorators for API authentication and authorization.
"""

import os
from functools import wraps
from flask import request, jsonify, g
from auth import get_session_manager

# Initialize session manager
session_manager = get_session_manager()

LOCAL_DEV_TENANT = 'local-dev'
LOCAL_DEV_USERNAME = 'local-dev'


def _local_auth_bypass_enabled():
    disabled_values = {'0', 'false', 'no', 'off'}
    bypass_setting = os.environ.get('WEALTH_LOCAL_AUTH_BYPASS', '1').lower()
    return os.environ.get('FLASK_ENV') == 'development' and bypass_setting not in disabled_values


def _get_local_dev_claims():
    """
    Create the local development tenant/user on demand and return session claims.
    The bypass is only enabled in Flask development mode.
    """
    from database import get_wealth_database

    wealth_db = get_wealth_database()

    with wealth_db.db.get_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO tenants (tenant_id, name, active)
            VALUES (%s, %s, TRUE)
            ON CONFLICT (tenant_id)
            DO UPDATE SET active = TRUE
            RETURNING id
            """,
            [LOCAL_DEV_TENANT, 'Local Development']
        )
        tenant_db_id = cursor.fetchone()[0]
        wealth_db._ensure_tenant_dek(cursor, tenant_db_id)

        cursor.execute(
            """
            SELECT id
            FROM users
            WHERE tenant_id = %s AND username = %s
            """,
            [tenant_db_id, LOCAL_DEV_USERNAME]
        )
        user = cursor.fetchone()

        if user:
            user_id = user[0]
        else:
            cursor.execute(
                """
                INSERT INTO users (
                    tenant_id, username, encrypted_email, encrypted_name,
                    password_hash, key_version, email_verified
                )
                VALUES (
                    %s, %s,
                    encrypt_tenant_data(%s, %s),
                    encrypt_tenant_data(%s, %s),
                    NULL, 'v1', TRUE
                )
                RETURNING id
                """,
                [
                    tenant_db_id, LOCAL_DEV_USERNAME,
                    'local-dev@example.test', tenant_db_id,
                    'Local Development', tenant_db_id
                ]
            )
            user_id = cursor.fetchone()[0]

        cursor.execute(
            """
            INSERT INTO user_settings (user_id, theme, currency, preferences)
            VALUES (%s, 'system', 'CHF', '{}'::jsonb)
            ON CONFLICT (user_id) DO NOTHING
            """,
            [user_id]
        )

    return {
        'sub': str(user_id),
        'tenant': LOCAL_DEV_TENANT,
        'email': 'local-dev@example.test',
        'name': 'Local Development',
        'email_verified': True,
        'local_dev': True
    }


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

        if not session_claims and _local_auth_bypass_enabled():
            session_claims = _get_local_dev_claims()

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
