"""
Database connection and operations for Wealth Management App

Implements PostgreSQL with pgcrypto for encrypted data storage
"""

import os
import uuid
import hashlib
import secrets
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
                          exclude_hashes: set = None, source_document_id: int = None) -> Dict[str, Any]:
        """
        Create a new transaction record with encrypted sensitive data

        IMPORTANT ASSUMPTION: We do NOT check for duplicates within the same file.
        If a transaction appears twice in the same file, it is assumed to be intentional
        (e.g., a real double booking that should be visible to the user).
        We only check for duplicates across different files to prevent re-importing
        the same transaction from multiple bank statement files.

        Args:
            tenant_id: Tenant identifier
            account_id: Database account ID
            transaction_data: Transaction data dictionary
            exclude_hashes: Set of transaction hashes (deprecated - kept for API compatibility but not used)
            source_document_id: ID of the document this transaction was imported from

        Returns:
            Created transaction data, or None if duplicate found across different files
        """
        tenant_db_id = self.set_tenant_context(tenant_id)

        # Calculate transaction hash for duplicate detection
        transaction_hash = self._calculate_transaction_hash(account_id, transaction_data)

        # Check for duplicate in database (across different files only)
        # We do NOT check for duplicates within the same file - if a transaction appears
        # twice in the same file, it's assumed to be intentional (real double booking)
        existing = self.get_transaction_by_hash(tenant_id, transaction_hash)
        if existing:
            print(f"Duplicate found across files: {transaction_data.get('recipient', 'Unknown')} on {transaction_data.get('date')} - skipping")
            return None  # Return None to indicate it was skipped

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
                print(f"Duplicate transaction (race condition): {transaction_data.get('recipient', 'Unknown')} on {transaction_data.get('date')} - skipping")
                return None
            # Re-raise other errors
            raise

    def _calculate_transaction_hash(self, account_id: int, transaction_data: Dict[str, Any]) -> str:
        """Calculate transaction hash for duplicate detection"""
        import hashlib
        import re

        # Normalize recipient for better duplicate detection
        recipient = transaction_data.get('recipient', '').lower()
        
        # Common merchant name normalizations to catch duplicates
        merchant_mappings = {
            'amzn': 'amazon',
            'amznmktpde': 'amazon',
            'paypal': 'paypal',
            'pp': 'paypal',
        }
        
        # Apply merchant mappings
        for pattern, normalized in merchant_mappings.items():
            if pattern in recipient.replace('.', '').replace(' ', ''):
                recipient = normalized
                break
        
        # Remove special chars and extra spaces
        normalized_recipient = re.sub(r'[^\w\s]', '', recipient).strip()
        normalized_recipient = re.sub(r'\s+', ' ', normalized_recipient)
        
        # For very long recipients (likely transaction IDs), extract just the first meaningful word
        words = normalized_recipient.split()
        if len(normalized_recipient) > 30 and words:
            # Take first word if it's meaningful (>3 chars)
            if len(words[0]) > 3:
                normalized_recipient = words[0]

        # Create a unique string from key transaction fields
        hash_string = f"{account_id}|{transaction_data['date']}|{transaction_data['amount']}|{transaction_data.get('description', '')}|{normalized_recipient}"

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
            """
            
            if source_document_id:
                query = base_query + " WHERE t.source_document_id = %s ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT %s OFFSET %s"
                params = [tenant_db_id, tenant_db_id, tenant_db_id, source_document_id, limit, offset]
            else:
                query = base_query + " ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT %s OFFSET %s"
                params = [tenant_db_id, tenant_db_id, tenant_db_id, limit, offset]
            
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
                RETURNING id, encryption_metadata
                """,
                (tenant_db_id, file_id)
            )
            result = cursor.fetchone()
            if not result:
                return None

            metadata = result[1]
            if isinstance(metadata, str):
                try:
                    metadata = json.loads(metadata)
                except json.JSONDecodeError:
                    metadata = {}

            return {
                'id': result[0],
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
            print(f"Failed to log audit event: {e}")

    def get_summary_data(self, tenant_id: str, months: int = 12) -> List[Dict[str, Any]]:
        """Get summary data for the specified number of months"""
        self.set_tenant_context(tenant_id)

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
                WHERE transaction_date >= CURRENT_DATE - (INTERVAL '1 month' * %s)
                GROUP BY DATE_TRUNC('month', transaction_date)
                ORDER BY month DESC
            """, (months,))

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
                    import json
                    return json.loads(result[0])
                else:
                    # Return default essential categories
                    return ['Rent', 'Insurance', 'Groceries', 'Utilities']
        except Exception as e:
            print(f"Error in get_essential_categories: {e}")
            import traceback
            traceback.print_exc()
            # Return default on error
            return ['Rent', 'Insurance', 'Groceries', 'Utilities']

    def save_essential_categories(self, tenant_id: str, categories: List[str]) -> None:
        """Save user's essential categories preferences"""
        try:
            print(f"Saving essential categories for tenant {tenant_id}: {categories}")
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
                print("Table created/verified")
                
                # Convert list to JSON string for storage
                import json
                categories_json = json.dumps(categories)
                print(f"Categories JSON: {categories_json}")
                
                # Check if record exists
                cursor.execute(
                    "SELECT tenant_id FROM essential_categories WHERE tenant_id = %s",
                    (tenant_id,)
                )
                exists = cursor.fetchone()
                
                if exists:
                    print("Updating existing record")
                    cursor.execute("""
                        UPDATE essential_categories 
                        SET categories = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE tenant_id = %s
                    """, (categories_json, tenant_id))
                else:
                    print("Inserting new record")
                    cursor.execute("""
                        INSERT INTO essential_categories (tenant_id, categories, updated_at)
                        VALUES (%s, %s, CURRENT_TIMESTAMP)
                    """, (tenant_id, categories_json))
                
                conn.commit()
                print("✓ Essential categories saved successfully")
        except Exception as e:
            print(f"Error in save_essential_categories: {e}")
            import traceback
            traceback.print_exc()
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
            print(f"Error in get_broker_valuation_cache: {e}")
            import traceback
            traceback.print_exc()
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
            print(f"Error in save_broker_valuation_cache: {e}")
            import traceback
            traceback.print_exc()
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
