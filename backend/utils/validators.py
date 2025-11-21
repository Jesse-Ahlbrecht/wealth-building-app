"""
Input Validators

Common validation functions for API inputs.
"""

from typing import Dict, List, Optional, Tuple


def validate_required_fields(data: Dict, required_fields: List[str]) -> Tuple[bool, Optional[str]]:
    """
    Validate that required fields are present in data
    
    Args:
        data: Dictionary to validate
        required_fields: List of required field names
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not data:
        return False, "No data provided"
    
    missing_fields = [field for field in required_fields if field not in data or not data[field]]
    
    if missing_fields:
        return False, f"Missing required fields: {', '.join(missing_fields)}"
    
    return True, None


def validate_email(email: str) -> bool:
    """
    Basic email validation
    
    Args:
        email: Email address to validate
    
    Returns:
        True if email format is valid
    """
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_password_strength(password: str) -> Tuple[bool, Optional[str]]:
    """
    Validate password strength
    
    Args:
        password: Password to validate
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    
    # Add more validation rules as needed
    # if not any(c.isupper() for c in password):
    #     return False, "Password must contain at least one uppercase letter"
    
    return True, None

