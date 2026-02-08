"""
Wealth Management App - Main Application Entry Point

A clean, modular Flask application for wealth tracking and management.
"""

from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import core dependencies
from encryption import get_encryption_service
from auth import get_session_manager
from database import get_wealth_database
from user_management import get_user_manager

# Initialize core services (needed by blueprints)
session_manager = get_session_manager()
wealth_db = get_wealth_database()
user_manager = get_user_manager(wealth_db.db)
encryption_service = get_encryption_service()

# Import blueprints
from routes import (
    auth_bp,
    transactions_bp,
    documents_bp,
    accounts_bp,
    broker_bp,
    loans_bp,
    categories_bp,
    predictions_bp,
    settings_bp
)

# Import error handlers
from middleware.error_handlers import register_error_handlers

# Create Flask app
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})

# Register error handlers
register_error_handlers(app)

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(transactions_bp)
app.register_blueprint(documents_bp)
app.register_blueprint(accounts_bp)
app.register_blueprint(broker_bp)
app.register_blueprint(loans_bp)
app.register_blueprint(categories_bp)
app.register_blueprint(predictions_bp)
app.register_blueprint(settings_bp)


# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    return {'status': 'healthy', 'message': 'Wealth Management API is running'}


# Root endpoint
@app.route('/', methods=['GET'])
def root():
    return {
        'message': 'Wealth Management API',
        'version': '2.0.0',
        'endpoints': [
            '/api/auth/*',
            '/api/transactions',
            '/api/accounts',
            '/api/broker',
            '/api/loans',
            '/api/categories',
            '/api/documents/*',
            '/api/predictions/*'
        ]
    }


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
