"""
Database connection and operations for Wealth Management App

Implements PostgreSQL with pgcrypto for encrypted data storage
"""

import os
import pg8000
from contextlib import contextmanager
from typing import Dict, List, Any, Optional, Generator
from datetime import datetime, date
from decimal import Decimal
import json


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

            print("Database connection parameters initialized successfully")

        except Exception as e:
            print(f"Failed to initialize database connection parameters: {e}")
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

            return tenant_db_id

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

    def create_transaction(self, tenant_id: str, account_id: int, transaction_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new transaction record with encrypted sensitive data

        Args:
            tenant_id: Tenant identifier
            account_id: Database account ID
            transaction_data: Transaction data dictionary

        Returns:
            Created transaction data
        """
        tenant_db_id = self.set_tenant_context(tenant_id)

        # Calculate transaction hash for duplicate detection
        transaction_hash = self._calculate_transaction_hash(account_id, transaction_data)

        # Check for duplicate
        existing = self.get_transaction_by_hash(tenant_id, transaction_hash)
        if existing:
            return existing

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                INSERT INTO transactions (
                    tenant_id, account_id, transaction_date, amount, currency,
                    transaction_type, encrypted_description, encrypted_recipient,
                    encrypted_reference, category, subcategory, tags,
                    transaction_hash, key_version
                ) VALUES (
                    %s, %s, %s, %s, %s, %s,
                    encrypt_tenant_data(%s, %s), encrypt_tenant_data(%s, %s), encrypt_tenant_data(%s, %s),
                    %s, %s, %s, %s, 'v1'
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
                transaction_data.get('tags', []), transaction_hash
            ))

            result = cursor.fetchone()
            return {
                'id': result[0], 'transaction_date': result[1], 'amount': result[2],
                'currency': result[3], 'transaction_type': result[4], 'category': result[5],
                'subcategory': result[6], 'tags': result[7], 'transaction_hash': result[8],
                'created_at': result[9]
            }

    def _calculate_transaction_hash(self, account_id: int, transaction_data: Dict[str, Any]) -> str:
        """Calculate transaction hash for duplicate detection"""
        import hashlib

        # Create a unique string from key transaction fields
        hash_string = f"{account_id}|{transaction_data['date']}|{transaction_data['amount']}|{transaction_data.get('description', '')}|{transaction_data.get('recipient', '')}"

        return hashlib.sha256(hash_string.encode()).hexdigest()

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

    def get_transactions(self, tenant_id: str, limit: int = 1000, offset: int = 0) -> List[Dict[str, Any]]:
        """Get paginated transactions for a tenant"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                SELECT t.id, t.transaction_date, t.amount, t.currency, t.transaction_type,
                       decrypt_tenant_data(t.encrypted_description, %s) as description,
                       decrypt_tenant_data(t.encrypted_recipient, %s) as recipient,
                       decrypt_tenant_data(t.encrypted_reference, %s) as reference,
                       t.category, t.subcategory, t.tags, t.transaction_hash, t.created_at,
                       a.account_name, a.account_type
                FROM transactions t
                JOIN accounts a ON t.account_id = a.id
                ORDER BY t.transaction_date DESC, t.created_at DESC
                LIMIT %s OFFSET %s
            """, [tenant_db_id, tenant_db_id, tenant_db_id, limit, offset])

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
            print(f"Creating category for tenant_id={tenant_id}, tenant_db_id={tenant_db_id}")
        except Exception as e:
            print(f"Error getting tenant_db_id: {e}")
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
                print(f"Category created successfully: {result}")
                return {
                    'id': result[0],
                    'category_name': result[1], 
                    'category_type': result[2],
                    'created_at': result[3]
                }
            except Exception as e:
                print(f"Database error creating category: {e}")
                # Handle duplicate category gracefully
                if 'unique constraint' in str(e).lower():
                    raise ValueError(f"Category '{category_name}' already exists")
                raise

    def create_category_override(self, tenant_id: str, transaction_hash: str,
                               override_category: str, reason: str = None) -> Dict[str, Any]:
        """Create a category override for a transaction"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            # Get the current category first
            cursor.execute(
                "SELECT category FROM transactions WHERE transaction_hash = %s",
                (transaction_hash,)
            )
            current = cursor.fetchone()
            original_category = current[0] if current else None

            # Create override
            cursor.execute("""
                INSERT INTO category_overrides (
                    tenant_id, transaction_hash, original_category,
                    override_category, reason, active
                ) VALUES (%s, %s, %s, %s, %s, TRUE)
                RETURNING id, created_at
            """, (tenant_db_id, transaction_hash, original_category, override_category, reason))

            result = cursor.fetchone()

            # Update the transaction category
            cursor.execute(
                "UPDATE transactions SET category = %s WHERE transaction_hash = %s",
                (override_category, transaction_hash)
            )

            return {'id': result[0], 'created_at': result[1]}

    def create_file_attachment(self, tenant_id: str, file_data: Dict[str, Any],
                             encrypted_data: bytes, encryption_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Store an encrypted file attachment"""
        tenant_db_id = self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                INSERT INTO file_attachments (
                    tenant_id, file_name, original_name, file_size, mime_type,
                    encrypted_data, encryption_metadata, checksum, key_version,
                    file_type, account_id, uploaded_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'v1', %s, %s, CURRENT_TIMESTAMP)
                RETURNING id, file_name, uploaded_at
            """, (
                tenant_db_id,
                file_data['file_name'],
                file_data['original_name'],
                file_data['file_size'],
                file_data.get('mime_type'),
                encrypted_data,
                json.dumps(encryption_metadata),
                file_data.get('checksum'),
                file_data.get('file_type'),
                file_data.get('account_id')
            ))

            return dict(cursor.fetchone())

    def get_file_attachment(self, tenant_id: str, file_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve a file attachment"""
        self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            cursor.execute("""
                SELECT id, file_name, original_name, file_size, mime_type,
                       encrypted_data, encryption_metadata, checksum, uploaded_at
                FROM file_attachments
                WHERE id = %s
            """, (file_id,))

            result = cursor.fetchone()
            return dict(result) if result else None

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
            print(f"Failed to log audit event: {e}")

    def get_summary_data(self, tenant_id: str, months: int = 12) -> List[Dict[str, Any]]:
        """Get summary data for the specified number of months"""
        self.set_tenant_context(tenant_id)

        with self.db.get_cursor() as cursor:
            # Get monthly summaries
            cursor.execute("""
                SELECT
                    DATE_TRUNC('month', transaction_date) as month,
                    SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as income,
                    SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expenses,
                    COUNT(*) as transaction_count
                FROM transactions
                WHERE transaction_date >= CURRENT_DATE - INTERVAL '%s months'
                GROUP BY DATE_TRUNC('month', transaction_date)
                ORDER BY month DESC
            """, (months,))

            summaries = []
            for row in cursor.fetchall():
                month_data = dict(row)
                month_data['savings'] = month_data['income'] - month_data['expenses']
                month_data['saving_rate'] = (
                    (month_data['savings'] / month_data['income'] * 100)
                    if month_data['income'] > 0 else 0
                )
                summaries.append(month_data)

            return summaries


# Global instance
_wealth_db = None

def get_wealth_database() -> WealthDatabase:
    """Get the global wealth database instance"""
    global _wealth_db
    if _wealth_db is None:
        _wealth_db = WealthDatabase()
    return _wealth_db
