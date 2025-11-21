"""
Error Handlers

Unified error handling for the application.
"""

from flask import jsonify
import traceback


def handle_api_error(error, status_code=500, include_traceback=False):
    """
    Standardized error response handler
    
    Args:
        error: Exception or error message
        status_code: HTTP status code
        include_traceback: Whether to include traceback in response (dev only)
    
    Returns:
        JSON response tuple
    """
    error_message = str(error) if error else "An error occurred"
    
    response = {
        'error': error_message,
        'success': False
    }
    
    if include_traceback:
        response['traceback'] = traceback.format_exc()
    
    return jsonify(response), status_code


def register_error_handlers(app):
    """
    Register global error handlers with Flask app
    
    Args:
        app: Flask application instance
    """
    
    @app.errorhandler(400)
    def bad_request(error):
        return handle_api_error("Bad request", 400)
    
    @app.errorhandler(401)
    def unauthorized(error):
        return handle_api_error("Unauthorized", 401)
    
    @app.errorhandler(403)
    def forbidden(error):
        return handle_api_error("Forbidden", 403)
    
    @app.errorhandler(404)
    def not_found(error):
        return handle_api_error("Resource not found", 404)
    
    @app.errorhandler(500)
    def internal_error(error):
        return handle_api_error("Internal server error", 500)

