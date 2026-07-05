"""
Database connection and operations for Wealth Management App

Implements PostgreSQL with pgcrypto for encrypted data storage
"""

import os
import uuid
import hashlib
import logging
import re
import secrets
import pg8000
from contextlib import contextmanager
from typing import Dict, List, Any, Optional, Generator
from datetime import datetime, date
from decimal import Decimal
import json

logger = logging.getLogger(__name__)


class DatabaseConnection:
    """Database connection manager"""

    def __init__(self):
        self.connection_params = None
        self._initialize_params()

    def _initialize_params(self):
        """Initialize database connection parameters"""
        try:
            # Database connection parameters
            self.connection_params = {
                'host': os.environ.get('DB_HOST', 'localhost'),
                'port': int(os.environ.get('DB_PORT', '5432')),
                'database': os.environ.get('DB_NAME', 'wealth_app'),
                'user': os.environ.get('DB_USER', os.environ.get('USER', 'postgres')),
                'password': os.environ.get('DB_PASSWORD', ''),
            }

            logger.info("Database connection parameters initialized successfully")

        except Exception as e:
            logger.error("Failed to initialize database connection parameters: %s", e)
            raise

    @contextmanager
    def get_connection(self) -> Generator[pg8000.Connection, None, None]:
        """Get a database connection"""
        conn = None
        try:
            conn = pg8000.connect(**self.connection_params)
            yield conn
        finally:
            if conn:
                conn.close()

    @contextmanager
    def get_cursor(self) -> Generator[pg8000.Cursor, None, None]:
        """Get a database cursor with automatic cleanup"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            try:
                yield cursor
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                cursor.close()


# Global database instance
_db = None

def get_database() -> DatabaseConnection:
    """Get the global database instance"""
    global _db
    if _db is None:
        _db = DatabaseConnection()
    return _db


class WealthDatabase:
    """High-level database operations for the wealth app"""

    def __init__(self):
        self.db = get_database()

    @staticmethod
    def _normalize_category_rule_text(value: str) -> str:
        """Normalize counterparty text for learned category matching."""
        normalized = (value or '').lower()
        normalized = re.sub(r'[^\w\s]', ' ', normalized)
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        return normalized

    def _category_rule_key(self, recipient: str = '', description: str = '') -> str:
        recipient_key = self._normalize_category_rule_text(recipient)
        if recipient_key:
            return recipient_key
        return self._normalize_category_rule_text(description)

    def _ensure_category_rules_table(self, cursor):
        """Create the learned-category rule lookup table on demand.

        This is a denormalized index of (counterparty -> category) decisions so
        imports can resolve a learned category with a single indexed lookup
        instead of decrypting every prior override.
        """
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS category_rules (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL,
                rule_key TEXT NOT NULL,
                transaction_type VARCHAR(20) NOT NULL DEFAULT '',
                override_category TEXT NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (tenant_id, rule_key, transaction_type)
            )
        """)

    def _ensure_import_batches_table(self, cursor):
        """Create import batch storage on demand for normalized client-side imports."""
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS import_batches (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER REFERENCES tenants(id),
                account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
                source_type VARCHAR(50) NOT NULL,
                filename VARCHAR(255),
                statement_start_date DATE NOT NULL,
                statement_end_date DATE NOT NULL,
                transaction_count INTEGER DEFAULT 0,
                imported_count INTEGER DEFAULT 0,
                skipped_count INTEGER DEFAULT 0,
                checksum VARCHAR(64),
                metadata JSONB DEFAULT '{}'::jsonb,
                imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_account_dates
            ON import_batches(tenant_id, account_id, statement_start_date, statement_end_date)
        """)

    def set_tenant_context(self, tenant_id: str) -> int:
        """
        Set the current tenant context and return tenant database ID

        Args:
            tenant_id: String tenant identifier

        Returns:
            Database tenant ID
        """
        with self.db.get_cursor() as cursor:
            cursor.execute(
                "SELECT id FROM tenants WHERE tenant_id = %s AND active = TRUE",
                [tenant_id]
            )
            result = cursor.fetchone()
            if not result:
                raise ValueError(f"Tenant '{tenant_id}' not found or inactive")

            tenant_db_id = result[0]
            
            # Ensure DEK exists for this tenant
            self._ensure_tenant_dek(cursor, tenant_db_id)

            return tenant_db_id
    
    def _ensure_tenant_dek(self, cursor, tenant_db_id: int):
        """
        Ensure a DEK (Data Encryption Key) exists for the tenant.
        Creates one if it doesn't exist.
        
        Args:
            cursor: Database cursor
            tenant_db_id: Tenant database ID
        """
        # Check if active DEK exists
        cursor.execute(
            """
            SELECT id FROM encryption_keys 
            WHERE tenant_id = %s AND key_type = 'dek' AND active = TRUE
            LIMIT 1
            """,
            [tenant_db_id]
        )
        if cursor.fetchone():
            return  # DEK already exists
        
        # Generate a new DEK (32 bytes = 256 bits)
        dek_bytes = secrets.token_bytes(32)
        
        # Insert the DEK into encryption_keys table
        cursor.execute(
            """
            INSERT INTO encryption_keys (tenant_id, key_version, key_type, encrypted_key, active)
            VALUES (%s, 'v1', 'dek', %s, TRUE)
            ON CONFLICT (tenant_id, key_version, key_type) DO NOTHING
            """,
            [tenant_db_id, dek_bytes]
        )

    def get_or_create_user(self, tenant_id: str, username: str, email: str = None, name: str = None) -> Dict[str, Any]:
        """
        Get or create a user record

        Args:
            tenant_id: Tenant identifier
            username: Username
            email: User email (optional)
            name: User full name (optional)

        Returns:
            User data dictionary
        """
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            # Check if user exists
            cursor.execute(
                "SELECT id, username, created_at FROM users WHERE tenant_id = %s AND username = %s",
                [tenant_db_id, username]
            )
            user = cursor.fetchone()

            if user:
                return {'id': user[0], 'username': user[1], 'created_at': user[2]}

            # Create new user
            encrypted_email = None
            encrypted_name = None

            if email:
                cursor.execute("SELECT encrypt_tenant_data(%s, %s)", [email, tenant_db_id])
                encrypted_email = cursor.fetchone()[0]

            if name:
                cursor.execute("SELECT encrypt_tenant_data(%s, %s)", [name, tenant_db_id])
                encrypted_name = cursor.fetchone()[0]

            cursor.execute("""
                INSERT INTO users (tenant_id, username, encrypted_email, encrypted_name, key_version)
                VALUES (%s, %s, %s, %s, 'v1')
                RETURNING id, username, created_at
            """, [tenant_db_id, username, encrypted_email, encrypted_name])

            result = cursor.fetchone()
            return {'id': result[0], 'username': result[1], 'created_at': result[2]}

    def create_transaction(self, tenant_id: str, account_id: int, transaction_data: Dict[str, Any],
                          source_document_id: int = None, seen_dedup_keys: set = None) -> Dict[str, Any]:
        """
        Create a new transaction record with encrypted sensitive data.

        Skips insert when a matching transaction already exists (same hash or
        format-normalized date/amount/recipient/description on the same account).
        """
        tenant_db_id = self.set_tenant_context(tenant_id)
        dedup_key = self.get_transaction_dedup_key(account_id, transaction_data)

        if seen_dedup_keys is not None:
            if dedup_key in seen_dedup_keys:
                return None
            seen_dedup_keys.add(dedup_key)

        transaction_hash = self._calculate_transaction_hash(account_id, transaction_data)

        if self._transaction_hash_exists(tenant_db_id, transaction_hash):
            logger.debug("Duplicate transaction found by hash - skipping")
            return None

        if self._find_similar_by_dedup_key(tenant_db_id, dedup_key):
            logger.debug("Duplicate transaction found by normalized fields - skipping")
            return None

        learned_category = self.get_learned_category_for_transaction(tenant_id, transaction_data)
        if learned_category:
            transaction_data = {
                **transaction_data,
                'category': learned_category
            }

        try:
            with self.db.get_cursor() as cursor:
                cursor.execute("""
                    INSERT INTO transactions (
                        tenant_id, account_id, transaction_date, amount, currency,
                        transaction_type, encrypted_description, encrypted_recipient,
                        encrypted_reference, category, subcategory, tags,
                        transaction_hash, source_document_id, key_version
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s,
                        encrypt_tenant_data(%s, %s), encrypt_tenant_data(%s, %s), encrypt_tenant_data(%s, %s),
                        %s, %s, %s, %s, %s, 'v1'
                    )
                    RETURNING id, transaction_date, amount, currency, transaction_type,
                             category, subcategory, tags, transaction_hash, created_at
                """, (
                    tenant_db_id, account_id,
                    transaction_data['date'], transaction_data['amount'], transaction_data.get('currency', 'EUR'),
                    transaction_data['type'],
                    transaction_data.get('description'), tenant_db_id,
                    transaction_data.get('recipient'), tenant_db_id,
                    transaction_data.get('reference', ''), tenant_db_id,
                    transaction_data.get('category'), transaction_data.get('subcategory'),
                    transaction_data.get('tags', []), transaction_hash, source_document_id
                ))

                result = cursor.fetchone()
                return {
                    'id': result[0], 'transaction_date': result[1], 'amount': result[2],
                    'currency': result[3], 'transaction_type': result[4], 'category': result[5],
                    'subcategory': result[6], 'tags': result[7], 'transaction_hash': result[8],
                    'created_at': result[9]
                }
        except Exception as e:
            # Handle duplicate key violations (race condition or missed duplicate check)
            error_str = str(e)
            if 'duplicate key' in error_str.lower() or '23505' in error_str or 'failed transaction block' in error_str.lower():
                # Duplicate transaction - return None to indicate it was skipped
                logger.debug("Duplicate transaction (race condition) - skipping")
                return None
            # Re-raise other errors
            raise

    def _normalize_transaction_text(self, value: str, for_recipient: bool = False) -> str:
        text = (value or '').strip()
        if len(text) >= 2 and text[0] == text[-1] and text[0] in '"\'':
            text = text[1:-1].strip()

        text = text.lower()
        text = re.sub(r'[\s"\']+', ' ', text).strip()

        if not for_recipient:
            return text

        compact = text.replace('.', '').replace(' ', '')
        merchant_mappings = {
            'amzn': 'amazon',
            'amznmktpde': 'amazon',
            'paypal': 'paypal',
            'pp': 'paypal',
        }
        for pattern, normalized in merchant_mappings.items():
            if pattern in compact:
                return normalized

        text = re.sub(r'[^\w\s]', '', text).strip()
        text = re.sub(r'\s+', ' ', text)

        words = text.split()
        if not words:
            return text

        if words[0] in ('amazon', 'amzn'):
            return 'amazon'

        if len(text) > 30 and len(words[0]) > 3:
            return words[0]

        return text

    def get_transaction_dedup_key(self, account_id: int, transaction_data: Dict[str, Any]) -> tuple:
        return (
            account_id,
            str(transaction_data['date']),
            str(transaction_data['amount']),
            transaction_data.get('currency', 'EUR'),
            transaction_data.get('type'),
            self._normalize_transaction_text(transaction_data.get('recipient', ''), for_recipient=True),
            self._normalize_transaction_text(transaction_data.get('description', '')),
        )

    def _calculate_transaction_hash(self, account_id: int, transaction_data: Dict[str, Any]) -> str:
        dedup_key = self.get_transaction_dedup_key(account_id, transaction_data)
        hash_string = f"{dedup_key[0]}|{dedup_key[1]}|{dedup_key[2]}|{dedup_key[6]}|{dedup_key[5]}"
        return hashlib.sha256(hash_string.encode()).hexdigest()

    def _transaction_hash_exists(self, tenant_db_id: int, transaction_hash: str) -> bool:
        with self.db.get_cursor() as cursor:
            cursor.execute("""
                SELECT 1 FROM transactions
                WHERE transaction_hash = %s AND tenant_id = %s
                LIMIT 1
            """, [transaction_hash, tenant_db_id])
            return cursor.fetchone() is not None

    def _find_similar_by_dedup_key(self, tenant_db_id: int, dedup_key: tuple) -> bool:
        account_id, date_value, amount, currency, transaction_type, _, _ = dedup_key

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                SELECT transaction_date, amount, currency, transaction_type,
                       decrypt_tenant_data(encrypted_description, %s) as description,
                       decrypt_tenant_data(encrypted_recipient, %s) as recipient
                FROM transactions
                WHERE tenant_id = %s AND account_id = %s AND transaction_date = %s
                  AND amount = %s AND currency = %s AND transaction_type = %s
            """, [
                tenant_db_id, tenant_db_id,
                tenant_db_id, account_id, date_value, amount, currency, transaction_type
            ])

            for row in cursor.fetchall():
                candidate_key = (
                    account_id,
                    str(row[0]),
                    str(row[1]),
                    row[2],
                    row[3],
                    self._normalize_transaction_text(row[5] or '', for_recipient=True),
                    self._normalize_transaction_text(row[4] or ''),
                )
                if candidate_key == dedup_key:
                    return True
            return False

    def get_learned_category_for_transaction(self, tenant_id: str, transaction_data: Dict[str, Any]) -> Optional[str]:
        """Return a manually learned category for a similar transaction, if one exists."""
        current_category = transaction_data.get('category')
        if current_category == 'Internal Transfer':
            return None

        rule_key = self._category_rule_key(
            transaction_data.get('recipient', ''),
            transaction_data.get('description', '')
        )
        if len(rule_key) < 3:
            return None

        transaction_type = str(transaction_data.get('type') or '')
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            self._ensure_category_rules_table(cursor)
            # Single indexed lookup keyed on the normalized counterparty. A rule
            # stored without a type ('') applies to any transaction type.
            cursor.execute("""
                SELECT override_category
                FROM category_rules
                WHERE tenant_id = %s
                  AND rule_key = %s
                  AND (transaction_type = %s OR transaction_type = '')
                ORDER BY (transaction_type = %s) DESC, updated_at DESC
                LIMIT 1
            """, [tenant_db_id, rule_key, transaction_type, transaction_type])

            row = cursor.fetchone()
            return row[0] if row else None

    def get_transaction_by_hash(self, tenant_id: str, transaction_hash: str) -> Optional[Dict[str, Any]]:
        """Get transaction by its hash"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                SELECT id, transaction_date, amount, currency, transaction_type,
                       decrypt_tenant_data(encrypted_description, %s) as description,
                       decrypt_tenant_data(encrypted_recipient, %s) as recipient,
                       decrypt_tenant_data(encrypted_reference, %s) as reference,
                       category, subcategory, tags, transaction_hash, created_at
                FROM transactions
                WHERE transaction_hash = %s AND tenant_id = %s
            """, [tenant_db_id, tenant_db_id, tenant_db_id, transaction_hash, tenant_db_id])

            result = cursor.fetchone()
            if result:
                return {
                    'id': result[0], 'transaction_date': result[1], 'amount': result[2],
                    'currency': result[3], 'transaction_type': result[4], 'description': result[5],
                    'recipient': result[6], 'reference': result[7], 'category': result[8],
                    'subcategory': result[9], 'tags': result[10], 'transaction_hash': result[11],
                    'created_at': result[12]
                }
            return None

    def get_active_category_override_hashes(self, tenant_id: str) -> set:
        tenant_db_id = self.set_tenant_context(tenant_id)
        with self.db.get_cursor() as cursor:
            cursor.execute("""
                SELECT transaction_hash FROM category_overrides
                WHERE tenant_id = %s AND active = TRUE
            """, (tenant_db_id,))
            return {row[0] for row in cursor.fetchall()}

    def get_transactions(self, tenant_id: str, limit: int = 1000, offset: int = 0, source_document_id: int = None) -> List[Dict[str, Any]]:
        """Get paginated transactions for a tenant, optionally filtered by source document ID"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            # Build query with optional document filter
            base_query = """
                SELECT t.id, t.transaction_date, t.amount, t.currency, t.transaction_type,
                       decrypt_tenant_data(t.encrypted_description, %s) as description,
                       decrypt_tenant_data(t.encrypted_recipient, %s) as recipient,
                       decrypt_tenant_data(t.encrypted_reference, %s) as reference,
                       t.category, t.subcategory, t.tags, t.transaction_hash, t.created_at,
                       a.account_name, a.account_type
                FROM transactions t
                JOIN accounts a ON t.account_id = a.id
                WHERE t.tenant_id = %s
            """
            
            if source_document_id:
                query = base_query + " AND t.source_document_id = %s ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT %s OFFSET %s"
                params = [tenant_db_id, tenant_db_id, tenant_db_id, tenant_db_id, source_document_id, limit, offset]
            else:
                query = base_query + " ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT %s OFFSET %s"
                params = [tenant_db_id, tenant_db_id, tenant_db_id, tenant_db_id, limit, offset]
            
            cursor.execute(query, params)

            results = []
            for row in cursor.fetchall():
                results.append({
                    'id': row[0], 'transaction_date': row[1], 'amount': row[2],
                    'currency': row[3], 'transaction_type': row[4], 'description': row[5],
                    'recipient': row[6], 'reference': row[7], 'category': row[8],
                    'subcategory': row[9], 'tags': row[10], 'transaction_hash': row[11],
                    'created_at': row[12], 'account_name': row[13], 'account_type': row[14]
                })
            return results

    def get_accounts(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get all accounts for a tenant"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                SELECT id, account_name, account_type, balance, currency,
                       decrypt_tenant_data(encrypted_account_number, %s) as account_number,
                       decrypt_tenant_data(encrypted_routing_number, %s) as routing_number,
                       institution, created_at, updated_at
                FROM accounts
                WHERE active = TRUE AND tenant_id = %s
                ORDER BY account_name
            """, [tenant_db_id, tenant_db_id, tenant_db_id])

            results = []
            for row in cursor.fetchall():
                results.append({
                    'id': row[0], 'account_name': row[1], 'account_type': row[2],
                    'balance': row[3], 'currency': row[4], 'account_number': row[5],
                    'routing_number': row[6], 'institution': row[7],
                    'created_at': row[8], 'updated_at': row[9]
                })
            return results

    def update_account_balance(self, tenant_id: str, account_id: int, balance: float, currency: str = None):
        """Update an account balance when an import provides a fresh statement balance."""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            if currency:
                cursor.execute("""
                    UPDATE accounts
                    SET balance = %s, currency = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND tenant_id = %s
                """, [balance, currency, account_id, tenant_db_id])
            else:
                cursor.execute("""
                    UPDATE accounts
                    SET balance = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND tenant_id = %s
                """, [balance, account_id, tenant_db_id])

    def create_import_batch(self, tenant_id: str, batch_data: Dict[str, Any]) -> Dict[str, Any]:
        """Record metadata for a normalized import batch."""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            self._ensure_import_batches_table(cursor)
            cursor.execute("""
                INSERT INTO import_batches (
                    tenant_id, account_id, source_type, filename,
                    statement_start_date, statement_end_date,
                    transaction_count, imported_count, skipped_count,
                    checksum, metadata
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                RETURNING id, imported_at
            """, [
                tenant_db_id,
                batch_data['account_id'],
                batch_data.get('source_type', 'csv_import'),
                batch_data.get('filename'),
                batch_data['statement_start_date'],
                batch_data['statement_end_date'],
                batch_data.get('transaction_count', 0),
                batch_data.get('imported_count', 0),
                batch_data.get('skipped_count', 0),
                batch_data.get('checksum'),
                json.dumps(batch_data.get('metadata') or {})
            ])
            result = cursor.fetchone()
            return {
                'id': result[0],
                'imported_at': result[1]
            }

    def list_import_batches(self, tenant_id: str) -> List[Dict[str, Any]]:
        """List all normalized import batches with account details."""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            self._ensure_import_batches_table(cursor)
            cursor.execute("""
                SELECT ib.id, ib.source_type, ib.filename, ib.statement_start_date,
                       ib.statement_end_date, ib.transaction_count, ib.imported_count,
                       ib.skipped_count, ib.checksum, ib.metadata, ib.imported_at,
                       a.account_name, a.currency, a.account_type
                FROM import_batches ib
                JOIN accounts a ON ib.account_id = a.id
                WHERE ib.tenant_id = %s
                ORDER BY ib.imported_at DESC, ib.id DESC
            """, [tenant_db_id])

            results = []
            for row in cursor.fetchall():
                metadata = row[9] if isinstance(row[9], dict) else {}
                results.append({
                    'id': row[0],
                    'source_type': row[1],
                    'filename': row[2],
                    'statement_start_date': row[3],
                    'statement_end_date': row[4],
                    'transaction_count': row[5],
                    'imported_count': row[6],
                    'skipped_count': row[7],
                    'checksum': row[8],
                    'metadata': metadata,
                    'imported_at': row[10],
                    'account_name': row[11],
                    'currency': row[12],
                    'account_type': row[13]
                })
            return results

    def import_batch_checksum_exists(self, tenant_id: str, account_id: int, checksum: str) -> bool:
        if not checksum:
            return False

        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            self._ensure_import_batches_table(cursor)
            cursor.execute("""
                SELECT 1 FROM import_batches
                WHERE tenant_id = %s AND account_id = %s AND checksum = %s
                LIMIT 1
            """, [tenant_db_id, account_id, checksum])
            return cursor.fetchone() is not None

    def create_account(self, tenant_id: str, account_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new account"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            # Encrypt sensitive data
            encrypted_account_number = None
            encrypted_routing_number = None

            if account_data.get('account_number'):
                cursor.execute("SELECT encrypt_tenant_data(%s, %s)", [account_data['account_number'], tenant_db_id])
                encrypted_account_number = cursor.fetchone()[0]

            if account_data.get('routing_number'):
                cursor.execute("SELECT encrypt_tenant_data(%s, %s)", [account_data['routing_number'], tenant_db_id])
                encrypted_routing_number = cursor.fetchone()[0]

            cursor.execute("""
                INSERT INTO accounts (
                    tenant_id, account_name, account_type, encrypted_account_number,
                    encrypted_routing_number, balance, currency, institution, key_version
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'v1')
                RETURNING id, account_name, account_type, balance, currency, institution, created_at
            """, [
                tenant_db_id, account_data['name'], account_data['type'],
                encrypted_account_number, encrypted_routing_number,
                account_data.get('balance', 0), account_data.get('currency', 'EUR'),
                account_data.get('institution')
            ])

            result = cursor.fetchone()
            return {
                'id': result[0], 'account_name': result[1], 'account_type': result[2],
                'balance': result[3], 'currency': result[4], 'institution': result[5],
                'created_at': result[6]
            }

    def create_loan(self, tenant_id: str, loan_data: Dict[str, Any], source_document_id: int = None) -> Dict[str, Any]:
        """Create or update a loan record"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            # Encrypt sensitive data
            encrypted_account_number = None
            encrypted_lender = None

            if loan_data.get('account_number'):
                cursor.execute("SELECT encrypt_tenant_data(%s, %s)", [loan_data['account_number'], tenant_db_id])
                encrypted_account_number = cursor.fetchone()[0]

            if loan_data.get('lender'):
                cursor.execute("SELECT encrypt_tenant_data(%s, %s)", [loan_data['lender'], tenant_db_id])
                encrypted_lender = cursor.fetchone()[0]
            elif loan_data.get('program'):
                # Use program as lender if lender not provided
                cursor.execute("SELECT encrypt_tenant_data(%s, %s)", [loan_data['program'], tenant_db_id])
                encrypted_lender = cursor.fetchone()[0]

            # Check if loan with same account number already exists
            account_number = loan_data.get('account_number', '')
            if account_number:
                cursor.execute("""
                    SELECT id FROM loans 
                    WHERE tenant_id = %s AND active = TRUE
                    AND decrypt_tenant_data(encrypted_account_number, %s) = %s
                """, [tenant_db_id, tenant_db_id, account_number])
                existing = cursor.fetchone()
                
                if existing:
                    # Update existing loan
                    loan_id = existing[0]
                    cursor.execute("""
                        UPDATE loans SET
                            current_balance = %s,
                            interest_rate = %s,
                            monthly_payment = %s,
                            updated_at = CURRENT_TIMESTAMP,
                            key_version = 'v1'
                        WHERE id = %s
                    """, [
                        loan_data.get('current_balance', 0),
                        loan_data.get('interest_rate', 0),
                        loan_data.get('monthly_payment', 0),
                        loan_id
                    ])
                    cursor.execute("""
                        SELECT id, loan_name, current_balance, interest_rate, monthly_payment,
                               currency, loan_type, origination_date, created_at, updated_at
                        FROM loans WHERE id = %s
                    """, [loan_id])
                    result = cursor.fetchone()
                    return {
                        'id': result[0], 'loan_name': result[1], 'current_balance': result[2],
                        'interest_rate': result[3], 'monthly_payment': result[4],
                        'currency': result[5], 'loan_type': result[6],
                        'origination_date': result[7], 'created_at': result[8], 'updated_at': result[9]
                    }

            # Create new loan
            loan_name = loan_data.get('loan_name') or loan_data.get('program') or loan_data.get('account', 'Loan')
            contract_date = loan_data.get('contract_date')
            if isinstance(contract_date, str):
                try:
                    from datetime import datetime
                    contract_date = datetime.fromisoformat(contract_date.replace('Z', '+00:00')).date()
                except:
                    contract_date = None
            
            cursor.execute("""
                INSERT INTO loans (
                    tenant_id, loan_name, encrypted_account_number, encrypted_lender,
                    principal_amount, current_balance, interest_rate, monthly_payment,
                    currency, loan_type, origination_date, key_version
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'v1')
                RETURNING id, loan_name, current_balance, interest_rate, monthly_payment,
                          currency, loan_type, origination_date, created_at, updated_at
            """, [
                tenant_db_id, loan_name, encrypted_account_number, encrypted_lender,
                loan_data.get('current_balance', 0),  # Use current_balance as principal if principal not provided
                loan_data.get('current_balance', 0),
                loan_data.get('interest_rate', 0),
                loan_data.get('monthly_payment', 0),
                loan_data.get('currency', 'EUR'),
                loan_data.get('loan_type') or loan_data.get('type', 'student'),
                contract_date
            ])

            result = cursor.fetchone()
            return {
                'id': result[0], 'loan_name': result[1], 'current_balance': result[2],
                'interest_rate': result[3], 'monthly_payment': result[4],
                'currency': result[5], 'loan_type': result[6],
                'origination_date': result[7], 'created_at': result[8], 'updated_at': result[9]
            }

    def get_loans(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get all active loans for a tenant"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                SELECT id, loan_name,
                       decrypt_tenant_data(encrypted_account_number, %s) as account_number,
                       decrypt_tenant_data(encrypted_lender, %s) as lender,
                       principal_amount, current_balance, interest_rate, monthly_payment,
                       currency, loan_type, origination_date, created_at, updated_at
                FROM loans
                WHERE tenant_id = %s AND active = TRUE
                ORDER BY loan_name
            """, [tenant_db_id, tenant_db_id, tenant_db_id])

            loans = []
            for row in cursor.fetchall():
                loans.append({
                    'id': row[0],
                    'loan_name': row[1],
                    'account_number': row[2] or '',
                    'lender': row[3] or '',
                    'principal_amount': float(row[4]) if row[4] else 0,
                    'current_balance': float(row[5]) if row[5] else 0,
                    'interest_rate': float(row[6]) if row[6] else 0,
                    'monthly_payment': float(row[7]) if row[7] else 0,
                    'currency': row[8] or 'EUR',
                    'loan_type': row[9] or 'student',
                    'origination_date': row[10].isoformat() if row[10] else None,
                    'created_at': row[11].isoformat() if row[11] else None,
                    'updated_at': row[12].isoformat() if row[12] else None
                })
            return loans

    def get_categories(self, tenant_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """Get all categories for a tenant"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                SELECT id, category_name, category_type, parent_category_id,
                       color, icon, created_at
                FROM categories
                WHERE active = TRUE AND tenant_id = %s
                ORDER BY category_type, category_name
            """, [tenant_db_id])

            categories = {'income': [], 'expense': []}
            for row in cursor.fetchall():
                row_dict = {
                    'id': row[0], 'category_name': row[1], 'category_type': row[2],
                    'parent_category_id': row[3], 'color': row[4], 'icon': row[5],
                    'created_at': row[6]
                }
                cat_type = row_dict['category_type']
                if cat_type in categories:
                    categories[cat_type].append(row_dict)

            return categories

    def create_custom_category(self, tenant_id: str, category_name: str, 
                               category_type: str) -> Dict[str, Any]:
        """Create a custom category for a tenant"""
        try:
            tenant_db_id = self.set_tenant_context(tenant_id)
            logger.debug("Creating category for tenant_db_id=%s", tenant_db_id)
        except Exception as e:
            logger.error("Error resolving tenant context: %s", e)
            raise ValueError(f"Tenant not found: {tenant_id}")

        with self.db.get_cursor() as cursor:
            try:
                cursor.execute("""
                    INSERT INTO categories (
                        tenant_id, category_name, category_type, active
                    ) VALUES (%s, %s, %s, TRUE)
                    RETURNING id, category_name, category_type, created_at
                """, (tenant_db_id, category_name, category_type))
                
                result = cursor.fetchone()
                logger.info("Category created successfully (id=%s)", result[0])
                return {
                    'id': result[0],
                    'category_name': result[1],
                    'category_type': result[2],
                    'created_at': result[3]
                }
            except Exception as e:
                logger.error("Database error creating category: %s", e)
                # Handle duplicate category gracefully
                if 'unique constraint' in str(e).lower():
                    raise ValueError(f"Category '{category_name}' already exists")
                raise

    def create_category_override(self, tenant_id: str, transaction_hash: str,
                               override_category: str, reason: str = None) -> Dict[str, Any]:
        """Create a category override for a transaction"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            # Get the current transaction first; its counterparty becomes the learned rule.
            cursor.execute("""
                SELECT category, transaction_type,
                       decrypt_tenant_data(encrypted_recipient, %s) as recipient,
                       decrypt_tenant_data(encrypted_description, %s) as description
                FROM transactions
                WHERE transaction_hash = %s AND tenant_id = %s
            """, (tenant_db_id, tenant_db_id, transaction_hash, tenant_db_id))
            current = cursor.fetchone()
            original_category = current[0] if current else None
            current_type = current[1] if current else None
            current_rule_key = self._category_rule_key(current[2], current[3]) if current else ''

            # Create override
            cursor.execute("""
                INSERT INTO category_overrides (
                    tenant_id, transaction_hash, original_category,
                    override_category, reason, active
                ) VALUES (%s, %s, %s, %s, %s, TRUE)
                RETURNING id, created_at
            """, (tenant_db_id, transaction_hash, original_category, override_category, reason))

            result = cursor.fetchone()

            matching_hashes = [transaction_hash]
            if current_rule_key:
                cursor.execute("""
                    SELECT transaction_hash, transaction_type,
                           decrypt_tenant_data(encrypted_recipient, %s) as recipient,
                           decrypt_tenant_data(encrypted_description, %s) as description
                    FROM transactions
                    WHERE tenant_id = %s
                      AND transaction_hash IS NOT NULL
                """, (tenant_db_id, tenant_db_id, tenant_db_id))

                for candidate_hash, candidate_type, recipient, description in cursor.fetchall():
                    if current_type and candidate_type and str(candidate_type) != str(current_type):
                        continue
                    if self._category_rule_key(recipient, description) == current_rule_key:
                        matching_hashes.append(candidate_hash)

            matching_hashes = list(dict.fromkeys(matching_hashes))
            placeholders = ', '.join(['%s'] * len(matching_hashes))
            cursor.execute(
                f"UPDATE transactions SET category = %s WHERE tenant_id = %s AND transaction_hash IN ({placeholders})",
                [override_category, tenant_db_id, *matching_hashes]
            )

            # Persist a fast-lookup rule so future imports can resolve this
            # counterparty's category without decrypting every prior override.
            if current_rule_key:
                self._ensure_category_rules_table(cursor)
                cursor.execute("""
                    INSERT INTO category_rules (
                        tenant_id, rule_key, transaction_type, override_category, updated_at
                    ) VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (tenant_id, rule_key, transaction_type)
                    DO UPDATE SET override_category = EXCLUDED.override_category,
                                  updated_at = CURRENT_TIMESTAMP
                """, [tenant_db_id, current_rule_key, str(current_type or ''), override_category])

            return {
                'id': result[0],
                'created_at': result[1],
                'updated_transactions': len(matching_hashes)
            }

    def recategorize_by_counterparty_keywords(
        self,
        tenant_id: str,
        keywords: List[str],
        from_category: str,
        to_category: str,
        remove_learned_rules: bool = True,
    ) -> Dict[str, int]:
        tenant_db_id = self.set_tenant_context(tenant_id)
        keyword_patterns = [k.lower() for k in keywords if k]
        updated = 0
        rules_removed = 0

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                SELECT transaction_hash,
                       decrypt_tenant_data(encrypted_recipient, %s) as recipient,
                       decrypt_tenant_data(encrypted_description, %s) as description,
                       category
                FROM transactions
                WHERE tenant_id = %s
            """, (tenant_db_id, tenant_db_id, tenant_db_id))

            matching_hashes = []
            rule_keys = set()
            for transaction_hash, recipient, description, category in cursor.fetchall():
                text = f"{recipient or ''} {description or ''}".lower()
                if not any(keyword in text for keyword in keyword_patterns):
                    continue
                if from_category and category != from_category:
                    continue
                matching_hashes.append(transaction_hash)
                rule_keys.add(self._category_rule_key(recipient, description))

            if matching_hashes:
                placeholders = ', '.join(['%s'] * len(matching_hashes))
                cursor.execute(
                    f"UPDATE transactions SET category = %s WHERE tenant_id = %s AND transaction_hash IN ({placeholders})",
                    [to_category, tenant_db_id, *matching_hashes],
                )
                updated = len(matching_hashes)

            if remove_learned_rules and rule_keys:
                self._ensure_category_rules_table(cursor)
                for rule_key in rule_keys:
                    if len(rule_key) < 3:
                        continue
                    cursor.execute("""
                        DELETE FROM category_rules
                        WHERE tenant_id = %s AND rule_key = %s
                    """, (tenant_db_id, rule_key))
                    rules_removed += cursor.rowcount

        return {'updated_transactions': updated, 'removed_rules': rules_removed}

    def create_file_attachment(self, tenant_id: str, file_data: Dict[str, Any],
                             encrypted_data: bytes, encryption_metadata: Dict[str, Any],
                             key_version: str = 'v1', uploaded_by: Optional[int] = None) -> Dict[str, Any]:
        """Store an encrypted file attachment"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        metadata_dict: Dict[str, Any]
        if isinstance(encryption_metadata, (str, bytes, bytearray)):
            if isinstance(encryption_metadata, (bytes, bytearray)):
                metadata_str = encryption_metadata.decode('utf-8')
            else:
                metadata_str = encryption_metadata
            try:
                metadata_dict = json.loads(metadata_str)
            except json.JSONDecodeError:
                metadata_dict = {}
        elif isinstance(encryption_metadata, dict):
            metadata_dict = encryption_metadata
        else:
            metadata_dict = {}

        metadata_payload = json.dumps(metadata_dict)

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                INSERT INTO file_attachments (
                    tenant_id, file_name, original_name, file_size, mime_type,
                    encrypted_data, encryption_metadata, checksum, uploaded_by,
                    key_version, file_type, account_id, transaction_id, holding_id
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s::jsonb, %s, %s,
                    %s, %s, %s, %s, %s
                )
                RETURNING id, file_name, original_name, file_size, mime_type,
                          file_type, uploaded_at, uploaded_by, checksum
            """, (
                tenant_db_id,
                file_data['file_name'],
                file_data['original_name'],
                file_data['file_size'],
                file_data.get('mime_type'),
                encrypted_data,
                metadata_payload,
                file_data.get('checksum'),
                uploaded_by,
                key_version,
                file_data.get('file_type'),
                file_data.get('account_id'),
                file_data.get('transaction_id'),
                file_data.get('holding_id')
            ))

            result = cursor.fetchone()
            return {
                'id': result[0],
                'file_name': result[1],
                'original_name': result[2],
                'file_size': result[3],
                'mime_type': result[4],
                'file_type': result[5],
                'uploaded_at': result[6],
                'uploaded_by': result[7],
                'checksum': result[8],
                'metadata': metadata_dict
            }

    def store_encrypted_file(self, tenant_id: str, encrypted_data: bytes,
                             metadata: Dict[str, Any], file_type: Optional[str] = None,
                             uploaded_by: Optional[int] = None,
                             account_id: Optional[int] = None,
                             transaction_id: Optional[int] = None,
                             holding_id: Optional[int] = None) -> Dict[str, Any]:
        """Persist encrypted file content and metadata."""
        # Derive file info details from metadata payload
        file_info = metadata.get('file_info', {}) or {}

        original_name = file_info.get('original_name') or metadata.get('originalName') or 'document.bin'
        original_name = os.path.basename(original_name)

        # Generate deterministic checksum when missing
        checksum = file_info.get('checksum') or metadata.get('checksum')
        if not checksum:
            checksum = hashlib.sha256(encrypted_data).hexdigest()
            file_info['checksum'] = checksum

        original_size = file_info.get('original_size') or metadata.get('originalSize') or len(encrypted_data)
        mime_type = file_info.get('original_type') or metadata.get('originalType')

        # Ensure metadata keeps the updated file_info block
        metadata['file_info'] = {
            **file_info,
            'original_name': original_name,
            'original_size': original_size,
            'original_type': mime_type
        }

        stored_name = f"{uuid.uuid4().hex}_{original_name}"
        file_data = {
            'file_name': stored_name,
            'original_name': original_name,
            'file_size': int(original_size),
            'mime_type': mime_type,
            'checksum': checksum,
            'file_type': file_type,
            'account_id': account_id,
            'transaction_id': transaction_id,
            'holding_id': holding_id
        }

        return self.create_file_attachment(
            tenant_id=tenant_id,
            file_data=file_data,
            encrypted_data=encrypted_data,
            encryption_metadata=metadata,
            uploaded_by=uploaded_by
        )

    def list_file_attachments(self, tenant_id: str,
                              file_types: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Fetch file attachments for a tenant, optionally filtered by type."""
        tenant_db_id = self.set_tenant_context(tenant_id)

        base_query = """
            SELECT
                id,
                file_name,
                original_name,
                file_size,
                mime_type,
                file_type,
                uploaded_at,
                uploaded_by,
                checksum,
                encryption_metadata
            FROM file_attachments
            WHERE tenant_id = %s
        """
        params: List[Any] = [tenant_db_id]

        if file_types:
            base_query += " AND file_type = ANY(%s)"
            params.append(file_types)

        base_query += " ORDER BY uploaded_at DESC, id DESC"

        with self.db.get_cursor() as cursor:
            cursor.execute(base_query, params)
            rows = cursor.fetchall()

        attachments: List[Dict[str, Any]] = []
        for row in rows:
            metadata_payload = row[9]
            if isinstance(metadata_payload, str):
                try:
                    metadata_payload = json.loads(metadata_payload)
                except json.JSONDecodeError:
                    metadata_payload = {}

            uploaded_at = row[6]
            if hasattr(uploaded_at, 'isoformat'):
                uploaded_at_iso = uploaded_at.isoformat()
            else:
                uploaded_at_iso = uploaded_at

            attachments.append({
                'id': row[0],
                'file_name': row[1],
                'original_name': row[2],
                'file_size': row[3],
                'mime_type': row[4],
                'file_type': row[5],
                'uploaded_at': uploaded_at_iso,
                'uploaded_by': row[7],
                'checksum': row[8],
                'metadata': metadata_payload
            })

        return attachments

    def delete_file_attachment(self, tenant_id: str, file_id: int) -> Optional[Dict[str, Any]]:
        """Delete a file attachment owned by a tenant and return metadata if found."""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM file_attachments
                WHERE tenant_id = %s AND id = %s
                RETURNING id, file_type, encryption_metadata
                """,
                (tenant_db_id, file_id)
            )
            result = cursor.fetchone()
            if not result:
                return None

            metadata = result[2]
            if isinstance(metadata, str):
                try:
                    metadata = json.loads(metadata)
                except json.JSONDecodeError:
                    metadata = {}

            return {
                'id': result[0],
                'file_type': result[1],
                'metadata': metadata or {}
            }

    def delete_file_attachments_by_type(self, tenant_id: str, file_type: str) -> List[Dict[str, Any]]:
        """Delete all file attachments for a tenant matching a specific type."""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM file_attachments
                WHERE tenant_id = %s AND file_type = %s
                RETURNING id, encryption_metadata
                """,
                (tenant_db_id, file_type)
            )
            rows = cursor.fetchall()

        deleted_records: List[Dict[str, Any]] = []
        for row in rows:
            metadata = row[1]
            if isinstance(metadata, str):
                try:
                    metadata = json.loads(metadata)
                except json.JSONDecodeError:
                    metadata = {}
            deleted_records.append({
                'id': row[0],
                'metadata': metadata or {}
            })

        return deleted_records

    def get_file_attachment(self, tenant_id: str, file_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve a file attachment scoped to the owning tenant."""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                SELECT id, file_name, original_name, file_size, mime_type,
                       encrypted_data, encryption_metadata, checksum, uploaded_at
                FROM file_attachments
                WHERE id = %s AND tenant_id = %s
            """, (file_id, tenant_db_id))

            result = cursor.fetchone()
            if not result:
                return None
            
            # Convert tuple to dictionary using column names
            columns = [desc[0] for desc in cursor.description]
            return dict(zip(columns, result))

    def wipe_tenant_data(self, tenant_id: str, keep_custom_categories: bool = True) -> Dict[str, int]:
        """
        Delete all tenant-scoped data so the user can start fresh.

        Args:
            tenant_id: external identifier (string) for the tenant.
            keep_custom_categories: when False, custom categories are removed as well.

        Returns:
            Dictionary summarizing the number of rows removed per table (best-effort).
        """
        tenant_db_id = self.set_tenant_context(tenant_id)
        deletion_counts: Dict[str, int] = {}

        tables_with_tenant_fk = [
            ('category_overrides', 'tenant_id'),
            ('prediction_dismissals', 'tenant_id'),
            ('transactions', 'tenant_id'),
            ('investment_transactions', 'tenant_id'),
            ('investment_holdings', 'tenant_id'),
            ('loans', 'tenant_id'),
            ('file_attachments', 'tenant_id'),
            ('accounts', 'tenant_id'),
            ('audit_log', 'tenant_id')
        ]

        with self.db.get_cursor() as cursor:
            for table_name, column in tables_with_tenant_fk:
                cursor.execute(f"DELETE FROM {table_name} WHERE {column} = %s", (tenant_db_id,))
                deletion_counts[table_name] = cursor.rowcount if cursor.rowcount is not None else 0

            if not keep_custom_categories:
                cursor.execute("DELETE FROM categories WHERE tenant_id = %s", (tenant_db_id,))
                deletion_counts['categories'] = cursor.rowcount if cursor.rowcount is not None else 0

        # Essential categories table uses textual tenant_id; ensure table exists before deleting.
        with self.db.get_cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS essential_categories (
                    tenant_id TEXT PRIMARY KEY,
                    categories TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("DELETE FROM essential_categories WHERE tenant_id = %s", (tenant_id,))
            deletion_counts['essential_categories'] = cursor.rowcount if cursor.rowcount is not None else 0

        return deletion_counts

    def log_audit_event(self, tenant_id: str, user_id: int, action: str,
                       resource_type: str = None, resource_id: int = None,
                       key_version: str = None, success: bool = True,
                       error_message: str = None):
        """Log an audit event"""
        try:
            tenant_db_id = self.set_tenant_context(tenant_id)

            with self.db.get_cursor() as cursor:
                cursor.execute("""
                    INSERT INTO audit_log (
                        tenant_id, user_id, action, resource_type, resource_id,
                        key_version, success, error_message
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    tenant_db_id, user_id, action, resource_type, resource_id,
                    key_version, success, error_message
                ))
        except Exception as e:
            # Don't let audit logging failures break the main operation
            logger.warning("Failed to log audit event: %s", e)

    def get_summary_data(self, tenant_id: str, months: int = 12) -> List[Dict[str, Any]]:
        """Get summary data for the specified number of months"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            # Get monthly summaries
            # Use make_interval() function to properly construct interval with parameter
            # Alternative: Use INTERVAL '1 month' * %s which also works with parameters
            cursor.execute("""
                SELECT
                    DATE_TRUNC('month', transaction_date) as month,
                    SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as income,
                    SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expenses,
                    COUNT(*) as transaction_count
                FROM transactions
                WHERE tenant_id = %s
                  AND transaction_date >= CURRENT_DATE - (INTERVAL '1 month' * %s)
                GROUP BY DATE_TRUNC('month', transaction_date)
                ORDER BY month DESC
            """, (tenant_db_id, months))

            summaries = []
            # Get column names from cursor description
            columns = [desc[0] for desc in cursor.description]
            for row in cursor.fetchall():
                # Convert tuple to dictionary using column names
                month_data = dict(zip(columns, row))
                month_data['savings'] = month_data['income'] - month_data['expenses']
                month_data['saving_rate'] = (
                    (month_data['savings'] / month_data['income'] * 100)
                    if month_data['income'] > 0 else 0
                )
                summaries.append(month_data)

            return summaries

    def get_essential_categories(self, tenant_id: str) -> List[str]:
        """Get user's essential categories preferences"""
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                
                # Check if table exists and create it if needed
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS essential_categories (
                        tenant_id TEXT PRIMARY KEY,
                        categories TEXT NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.commit()
                
                cursor.execute(
                    "SELECT categories FROM essential_categories WHERE tenant_id = %s",
                    (tenant_id,)
                )
                result = cursor.fetchone()
                
                if result:
                    # Parse JSON array from database
                    return json.loads(result[0])
                else:
                    # Return default essential categories
                    return ['Rent', 'Insurance', 'Groceries', 'Utilities']
        except Exception as e:
            logger.error("Error in get_essential_categories: %s", e, exc_info=True)
            # Return default on error
            return ['Rent', 'Insurance', 'Groceries', 'Utilities']

    def save_essential_categories(self, tenant_id: str, categories: List[str]) -> None:
        """Save user's essential categories preferences"""
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()

                # Check if table exists and create it if needed
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS essential_categories (
                        tenant_id TEXT PRIMARY KEY,
                        categories TEXT NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)

                # Upsert the categories payload
                cursor.execute("""
                    INSERT INTO essential_categories (tenant_id, categories, updated_at)
                    VALUES (%s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (tenant_id)
                    DO UPDATE SET categories = EXCLUDED.categories,
                                  updated_at = CURRENT_TIMESTAMP
                """, (tenant_id, json.dumps(categories)))

                conn.commit()
                logger.info("Essential categories saved for tenant")
        except Exception as e:
            logger.error("Error in save_essential_categories: %s", e, exc_info=True)
            raise

    def get_broker_valuation_cache(self, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get cached broker historical valuation data for a tenant, if available."""
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()

                # Ensure table exists
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS broker_valuation_cache (
                        tenant_id TEXT PRIMARY KEY,
                        data JSONB NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.commit()

                cursor.execute(
                    "SELECT data, updated_at FROM broker_valuation_cache WHERE tenant_id = %s",
                    (tenant_id,)
                )
                result = cursor.fetchone()

                if not result:
                    return None

                data, updated_at = result
                # data is already JSONB → mapped to dict by pg8000
                return {
                    "data": data,
                    "updated_at": updated_at
                }
        except Exception as e:
            logger.error("Error in get_broker_valuation_cache: %s", e, exc_info=True)
            return None

    def save_broker_valuation_cache(self, tenant_id: str, data: Dict[str, Any]) -> None:
        """Save broker historical valuation data for a tenant."""
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()

                # Ensure table exists
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS broker_valuation_cache (
                        tenant_id TEXT PRIMARY KEY,
                        data JSONB NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.commit()

                cursor.execute(
                    """
                    INSERT INTO broker_valuation_cache (tenant_id, data, updated_at)
                    VALUES (%s, %s::jsonb, CURRENT_TIMESTAMP)
                    ON CONFLICT (tenant_id)
                    DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
                    """,
                    (tenant_id, json.dumps(data))
                )
                conn.commit()
        except Exception as e:
            logger.error("Error in save_broker_valuation_cache: %s", e, exc_info=True)
            # Do not raise, caching is best-effort

    def update_file_attachment_metadata(self, tenant_id: str, file_id: int, 
                                       metadata_updates: Dict[str, Any]) -> bool:
        """Update metadata for a file attachment by merging new metadata into existing metadata."""
        tenant_db_id = self.set_tenant_context(tenant_id)
        
        with self.db.get_cursor() as cursor:
            # Get current metadata
            cursor.execute("""
                SELECT encryption_metadata
                FROM file_attachments
                WHERE tenant_id = %s AND id = %s
            """, (tenant_db_id, file_id))
            
            result = cursor.fetchone()
            if not result:
                return False
            
            # Parse existing metadata
            current_metadata = result[0]
            if isinstance(current_metadata, str):
                try:
                    current_metadata = json.loads(current_metadata)
                except json.JSONDecodeError:
                    current_metadata = {}
            elif current_metadata is None:
                current_metadata = {}
            
            # Merge updates into existing metadata
            # Deep merge: update nested dictionaries
            def deep_merge(base: Dict, updates: Dict) -> Dict:
                result = base.copy()
                for key, value in updates.items():
                    if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                        result[key] = deep_merge(result[key], value)
                    else:
                        result[key] = value
                return result
            
            updated_metadata = deep_merge(current_metadata, metadata_updates)
            
            # Update database
            cursor.execute("""
                UPDATE file_attachments
                SET encryption_metadata = %s::jsonb
                WHERE tenant_id = %s AND id = %s
            """, (json.dumps(updated_metadata), tenant_db_id, file_id))
            
            return True


# Global instance
_wealth_db = None

def get_wealth_database() -> WealthDatabase:
    """Get the global wealth database instance"""
    global _wealth_db
    if _wealth_db is None:
        _wealth_db = WealthDatabase()
    return _wealth_db
