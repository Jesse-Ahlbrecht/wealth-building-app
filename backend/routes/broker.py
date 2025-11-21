"""
Broker Routes

Handles broker account data and historical valuations.
"""

from flask import Blueprint
from middleware.auth_middleware import authenticate_request, require_auth
from services import broker_service

broker_bp = Blueprint('broker', __name__, url_prefix='/api')


@broker_bp.route('/broker')
@authenticate_request
@require_auth
def get_broker():
    """Get broker holdings and transactions"""
    return broker_service.get_broker()


@broker_bp.route('/broker/historical-valuation')
@authenticate_request
@require_auth
def get_broker_historical_valuation():
    """Get historical broker valuation data"""
    return broker_service.get_broker_historical_valuation()
