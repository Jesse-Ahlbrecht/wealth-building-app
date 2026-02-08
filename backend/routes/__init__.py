"""Routes package"""

from .auth import auth_bp
from .transactions import transactions_bp
from .documents import documents_bp
from .accounts import accounts_bp
from .broker import broker_bp
from .loans import loans_bp
from .categories import categories_bp
from .predictions import predictions_bp
from .settings import settings_bp

__all__ = [
    'auth_bp',
    'transactions_bp',
    'documents_bp',
    'accounts_bp',
    'broker_bp',
    'loans_bp',
    'categories_bp',
    'predictions_bp',
    'settings_bp'
]

