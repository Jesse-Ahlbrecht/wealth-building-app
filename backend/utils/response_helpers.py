"""
Response Helpers

Standardized API response formatting.
"""

from typing import Any, Dict, Optional


def success_response(data: Any = None, message: Optional[str] = None, status_code: int = 200) -> tuple:
    """
    Create a standardized success response
    
    Args:
        data: Response data
        message: Optional success message
        status_code: HTTP status code
    
    Returns:
        Tuple of (response_dict, status_code)
    """
    response = {'success': True}
    
    if data is not None:
        response['data'] = data
    
    if message:
        response['message'] = message
    
    return response, status_code


def error_response(error: str, status_code: int = 400, details: Optional[Dict] = None) -> tuple:
    """
    Create a standardized error response
    
    Args:
        error: Error message
        status_code: HTTP status code
        details: Optional additional error details
    
    Returns:
        Tuple of (response_dict, status_code)
    """
    response = {
        'success': False,
        'error': error
    }
    
    if details:
        response['details'] = details
    
    return response, status_code

