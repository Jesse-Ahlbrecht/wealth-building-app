-- Wealth Management App Database Schema
-- Implements AES-256 encryption using PostgreSQL pgcrypto extension

-- Enable pgcrypto extension for AES-256 encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create custom types
CREATE TYPE transaction_type AS ENUM ('income', 'expense');
CREATE TYPE account_type AS ENUM ('checking', 'savings', 'investment', 'loan', 'brokerage');

-- Tenants table for multi-tenant architecture
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT TRUE
);

-- Encryption keys table (for key versioning and rotation)
CREATE TABLE encryption_keys (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    key_version VARCHAR(50) NOT NULL,
    key_type VARCHAR(20) NOT NULL, -- 'dek' for data encryption key, 'kek' for key encryption key
    encrypted_key BYTEA NOT NULL, -- Key encrypted with master KEK
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, key_version, key_type)
);

-- Users table (encrypted sensitive data)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    username VARCHAR(255) NOT NULL,
    -- Encrypted fields using AES-256-GCM via pgcrypto
    encrypted_email BYTEA, -- pgp_sym_encrypt(email, dek)
    encrypted_name BYTEA, -- pgp_sym_encrypt(name, dek)
    password_hash VARCHAR(255), -- Argon2 hash (not encrypted, just hashed)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    active BOOLEAN DEFAULT TRUE,
    key_version VARCHAR(50) NOT NULL, -- References encryption_keys.key_version
    -- Password reset fields
    reset_token VARCHAR(255), -- Token for password reset
    reset_token_expires TIMESTAMP WITH TIME ZONE, -- Expiration time for reset token
    email_verified BOOLEAN DEFAULT FALSE, -- Email verification status
    verification_token VARCHAR(255), -- Token for email verification
    UNIQUE(tenant_id, username)
);

-- User settings and preferences
CREATE TABLE user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'system',
    currency VARCHAR(3) DEFAULT 'EUR',
    preferences JSONB DEFAULT '{}', -- For toggle buttons and other dynamic settings
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Accounts table (bank accounts, investment accounts, etc.)
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    account_name VARCHAR(255) NOT NULL,
    account_type account_type NOT NULL,
    -- Encrypted sensitive account information
    encrypted_account_number BYTEA, -- pgp_sym_encrypt(account_number, dek)
    encrypted_routing_number BYTEA, -- pgp_sym_encrypt(routing_number, dek)
    balance DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'EUR',
    institution VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    key_version VARCHAR(50) NOT NULL,
    active BOOLEAN DEFAULT TRUE
);

-- Transactions table (encrypted financial data)
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    account_id INTEGER REFERENCES accounts(id),
    transaction_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    transaction_type transaction_type NOT NULL,
    -- Encrypted transaction details
    encrypted_description BYTEA, -- pgp_sym_encrypt(description, dek)
    encrypted_recipient BYTEA, -- pgp_sym_encrypt(recipient/payee, dek)
    encrypted_reference BYTEA, -- pgp_sym_encrypt(reference/transaction_id, dek)
    category VARCHAR(100),
    subcategory VARCHAR(100),
    tags TEXT[], -- Array of tags for filtering
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    key_version VARCHAR(50) NOT NULL,
    -- For duplicate detection and reconciliation
    transaction_hash VARCHAR(64) UNIQUE, -- SHA-256 hash of key transaction fields
    reconciled BOOLEAN DEFAULT FALSE,
    -- Link to source document (file_attachments) if transaction was imported from a file
    source_document_id INTEGER REFERENCES file_attachments(id) ON DELETE CASCADE
);

-- Categories table (customizable expense/income categories)
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    category_name VARCHAR(100) NOT NULL,
    category_type VARCHAR(20) NOT NULL, -- 'income' or 'expense'
    parent_category_id INTEGER REFERENCES categories(id), -- For subcategories
    color VARCHAR(7), -- Hex color code for UI
    icon VARCHAR(50), -- Icon name for UI
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, category_name, category_type)
);

-- Manual category overrides (for transaction categorization corrections)
CREATE TABLE category_overrides (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    transaction_hash VARCHAR(64) REFERENCES transactions(transaction_hash),
    original_category VARCHAR(100),
    override_category VARCHAR(100) NOT NULL,
    override_subcategory VARCHAR(100),
    reason TEXT, -- Why this override was made
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT TRUE
);

-- Investment holdings (stocks, bonds, ETFs, etc.)
CREATE TABLE investment_holdings (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    account_id INTEGER REFERENCES accounts(id),
    symbol VARCHAR(20) NOT NULL,
    -- Encrypted sensitive information
    encrypted_isin BYTEA, -- pgp_sym_encrypt(ISIN, dek)
    encrypted_name BYTEA, -- pgp_sym_encrypt(security_name, dek)
    shares DECIMAL(15,6) NOT NULL,
    average_cost DECIMAL(15,6),
    current_price DECIMAL(15,6),
    currency VARCHAR(3) DEFAULT 'EUR',
    sector VARCHAR(100),
    country VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    key_version VARCHAR(50) NOT NULL
);

-- Investment transactions (buys, sells, dividends)
CREATE TABLE investment_transactions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    holding_id INTEGER REFERENCES investment_holdings(id),
    transaction_type VARCHAR(20) NOT NULL, -- 'buy', 'sell', 'dividend', 'split'
    transaction_date DATE NOT NULL,
    shares DECIMAL(15,6),
    price DECIMAL(15,6),
    amount DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'EUR',
    fees DECIMAL(10,2) DEFAULT 0,
    -- Encrypted transaction details
    encrypted_broker BYTEA, -- pgp_sym_encrypt(broker_name, dek)
    encrypted_reference BYTEA, -- pgp_sym_encrypt(reference_number, dek)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    key_version VARCHAR(50) NOT NULL
);

-- Loans and credit information
CREATE TABLE loans (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    loan_name VARCHAR(255) NOT NULL,
    -- Encrypted sensitive loan information
    encrypted_account_number BYTEA, -- pgp_sym_encrypt(account_number, dek)
    encrypted_lender BYTEA, -- pgp_sym_encrypt(lender_name, dek)
    principal_amount DECIMAL(15,2) NOT NULL,
    current_balance DECIMAL(15,2) NOT NULL,
    interest_rate DECIMAL(5,3),
    monthly_payment DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'EUR',
    loan_type VARCHAR(50), -- 'student', 'mortgage', 'personal', etc.
    origination_date DATE,
    maturity_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    key_version VARCHAR(50) NOT NULL,
    active BOOLEAN DEFAULT TRUE
);

-- File attachments (encrypted bank statements, documents)
CREATE TABLE file_attachments (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100),
    -- Double-encrypted file data (client + server encryption)
    encrypted_data BYTEA NOT NULL, -- Server-encrypted file content
    encryption_metadata JSONB, -- Client encryption metadata
    checksum VARCHAR(64), -- SHA-256 of original file for integrity
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    key_version VARCHAR(50) NOT NULL,
    -- File type classification
    file_type VARCHAR(50), -- 'bank_statement', 'tax_document', 'investment_report', etc.
    -- Reference to related entities
    account_id INTEGER REFERENCES accounts(id),
    transaction_id INTEGER REFERENCES transactions(id),
    holding_id INTEGER REFERENCES investment_holdings(id)
);

-- Audit log for all encryption/decryption operations
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL, -- 'encrypt', 'decrypt', 'key_rotate', 'login', etc.
    resource_type VARCHAR(50), -- 'transaction', 'file', 'account', etc.
    resource_id INTEGER,
    key_version VARCHAR(50),
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Note: Row Level Security is not enabled in this simplified version
-- In production, you would implement proper tenant isolation

-- Indexes for performance
CREATE INDEX idx_transactions_tenant_date ON transactions(tenant_id, transaction_date DESC);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_transactions_hash ON transactions(transaction_hash);
CREATE INDEX idx_transactions_source_document ON transactions(source_document_id);
CREATE INDEX idx_accounts_tenant ON accounts(tenant_id);
CREATE INDEX idx_categories_tenant_type ON categories(tenant_id, category_type);
CREATE INDEX idx_files_tenant_type ON file_attachments(tenant_id, file_type);
CREATE INDEX idx_audit_tenant_action ON audit_log(tenant_id, action, created_at DESC);

-- Functions for encryption/decryption helpers

-- Function to get the active DEK for a tenant
CREATE OR REPLACE FUNCTION get_active_dek(tenant_id_param INTEGER)
RETURNS BYTEA AS $$
DECLARE
    dek BYTEA;
BEGIN
    SELECT encrypted_key INTO dek
    FROM encryption_keys
    WHERE tenant_id = tenant_id_param
      AND key_type = 'dek'
      AND active = TRUE
    ORDER BY created_at DESC
    LIMIT 1;

    IF dek IS NULL THEN
        RAISE EXCEPTION 'No active DEK found for tenant %', tenant_id_param;
    END IF;

    RETURN dek;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to encrypt data with tenant's active DEK
CREATE OR REPLACE FUNCTION encrypt_tenant_data(data TEXT, tenant_id_param INTEGER)
RETURNS BYTEA AS $$
DECLARE
    dek BYTEA;
BEGIN
    IF tenant_id_param IS NULL THEN
        RAISE EXCEPTION 'Tenant ID must be provided';
    END IF;

    dek := get_active_dek(tenant_id_param);

    RETURN pgp_sym_encrypt(data, encode(dek, 'hex'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt data with tenant's active DEK
CREATE OR REPLACE FUNCTION decrypt_tenant_data(encrypted_data BYTEA, tenant_id_param INTEGER)
RETURNS TEXT AS $$
DECLARE
    dek BYTEA;
BEGIN
    IF tenant_id_param IS NULL THEN
        RAISE EXCEPTION 'Tenant ID must be provided';
    END IF;

    dek := get_active_dek(tenant_id_param);

    RETURN pgp_sym_decrypt(encrypted_data, encode(dek, 'hex'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create transaction hash for duplicate detection
CREATE OR REPLACE FUNCTION create_transaction_hash(
    account_id INTEGER,
    transaction_date DATE,
    amount DECIMAL,
    description TEXT,
    recipient TEXT
) RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(
        digest(
            account_id || '|' || transaction_date || '|' || amount || '|' ||
            COALESCE(description, '') || '|' || COALESCE(recipient, ''),
            'sha256'
        ),
        'hex'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_holdings_updated_at
    BEFORE UPDATE ON investment_holdings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loans_updated_at
    BEFORE UPDATE ON loans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Prediction dismissals table for recurring payment predictions
CREATE TABLE prediction_dismissals (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    recipient VARCHAR(255),
    category VARCHAR(100),
    prediction_key VARCHAR(255) UNIQUE NOT NULL,
    dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at DATE
);

CREATE INDEX idx_prediction_dismissals_tenant ON prediction_dismissals(tenant_id, expires_at);
CREATE INDEX idx_prediction_dismissals_key ON prediction_dismissals(prediction_key);

-- Insert default tenant for development
INSERT INTO tenants (tenant_id, name) VALUES ('default', 'Default Tenant');

-- Insert default encryption key (in production, this would be managed by KMS)
-- This is just for development - in production, keys would be managed externally
INSERT INTO encryption_keys (tenant_id, key_version, key_type, encrypted_key)
VALUES (
    1, -- default tenant
    'v1',
    'dek',
    decode('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex') -- Placeholder key
);
