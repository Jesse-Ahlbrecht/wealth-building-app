"""
Application Configuration

Centralized configuration management for the Flask application.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration"""
    
    # Flask
    SECRET_KEY = os.environ.get('WEALTH_SECRET_KEY', 'dev-secret-key')
    DEBUG = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    # Database
    DB_HOST = os.environ.get('DB_HOST', 'localhost')
    DB_PORT = int(os.environ.get('DB_PORT', '5432'))
    DB_NAME = os.environ.get('DB_NAME', 'wealth_app')
    DB_USER = os.environ.get('DB_USER', os.environ.get('USER', 'postgres'))
    DB_PASSWORD = os.environ.get('DB_PASSWORD', '')
    
    # Encryption Keys
    WEALTH_MASTER_KEY = os.environ.get('WEALTH_MASTER_KEY')
    WEALTH_TOKEN_KEY = os.environ.get('WEALTH_TOKEN_KEY')
    WEALTH_HMAC_SECRET = os.environ.get('WEALTH_HMAC_SECRET')
    WEALTH_DEK_KEY = os.environ.get('WEALTH_DEK_KEY', 'dev-key')
    
    # Email Configuration
    SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
    SMTP_USER = os.environ.get('SMTP_USER', '')
    SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
    SMTP_FROM = os.environ.get('SMTP_FROM', os.environ.get('SMTP_USER', ''))
    APP_URL = os.environ.get('APP_URL', 'http://localhost:3000')
    
    # CORS
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*')


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False


# Configuration mapping
config_by_name = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}


def get_config(env_name='default'):
    """Get configuration by environment name"""
    return config_by_name.get(env_name, DevelopmentConfig)

