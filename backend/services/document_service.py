"""
Document Service

Business logic for document management, upload, download, and processing.
"""

from flask import g, request, jsonify
from typing import Dict, Any, Optional
import json
import base64
import os
from datetime import datetime, timezone

from encryption import get_encryption_service, EncryptedData
from database import get_wealth_database
from constants import DOCUMENT_TYPE_LOOKUP
import tempfile
import threading
from datetime import datetime, timezone

# Initialize services
encryption_service = get_encryption_service()
wealth_db = get_wealth_database()

# In-memory progress tracking (in production, use Redis or database)
_document_progress = {}
_progress_lock = threading.Lock()


def _get_authenticated_user_id() -> Optional[int]:
    """Extract the authenticated user's integer ID from session claims."""
    if not getattr(g, 'session_claims', None):
        return None

    sub = g.session_claims.get('sub')
    if sub is None:
        return None

    try:
        return int(sub)
    except (TypeError, ValueError):
        return None


def _serialize_document_record(record: Dict[str, Any], tenant_id: str = None) -> Dict[str, Any]:
    """
    Convert a raw attachment record into the API response shape.
    Optionally calculates statementSummary from transactions if missing.
    """
    uploaded_at = record.get('uploaded_at')
    if hasattr(uploaded_at, 'isoformat'):
        uploaded_at = uploaded_at.isoformat()

    metadata = record.get('metadata') or {}
    file_info = {}
    document_metadata = {}

    if isinstance(metadata, dict):
        file_info = metadata.get('file_info') or {}
        document_metadata = (
            metadata.get('document_metadata')
            or metadata.get('user_metadata')
            or {}
        )

    # If statementSummary is missing, try to calculate it from transactions
    document_id = record.get('id')
    if document_id and tenant_id and not document_metadata.get('statementSummary'):
        try:
            # Get transactions for this document
            transactions = wealth_db.get_transactions(tenant_id, source_document_id=document_id, limit=10000)
            if transactions:
                dates = []
                for txn in transactions:
                    # Transactions are decrypted, so date should be accessible
                    txn_date = txn.get('date') or txn.get('transaction_date')
                    if txn_date:
                        try:
                            from datetime import date
                            if isinstance(txn_date, date):
                                dates.append(txn_date)
                            elif isinstance(txn_date, datetime):
                                dates.append(txn_date.date())
                            elif isinstance(txn_date, str):
                                # Parse ISO format date string
                                try:
                                    date_obj = datetime.fromisoformat(txn_date.replace('Z', '+00:00'))
                                    dates.append(date_obj.date())
                                except ValueError:
                                    # Try other formats
                                    try:
                                        date_obj = datetime.strptime(txn_date, '%Y-%m-%d')
                                        dates.append(date_obj.date())
                                    except ValueError:
                                        pass
                        except Exception:
                            pass
                
                if dates:
                    min_date = min(dates)
                    max_date = max(dates)
                    document_metadata['statementSummary'] = {
                        'startDate': min_date.isoformat(),
                        'endDate': max_date.isoformat(),
                        'imported': len(transactions),
                        'skipped': 0
                    }
                    if 'processingStatus' not in document_metadata:
                        document_metadata['processingStatus'] = 'complete'
        except Exception as e:
            print(f"Warning: Could not calculate coverage for document {document_id}: {e}")

    return {
        'id': document_id,
        'documentType': record.get('file_type'),
        'originalName': record.get('original_name'),
        'fileSize': record.get('file_size'),
        'mimeType': record.get('mime_type'),
        'uploadedAt': uploaded_at,
        'uploadedBy': record.get('uploaded_by'),
        'checksum': record.get('checksum'),
        'fileInfo': file_info or {},
        'documentMetadata': document_metadata or {}
    }


def get_documents():
    """Get documents list."""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    try:
        documents = wealth_db.list_file_attachments(tenant_id)
        serialized_docs = [_serialize_document_record(doc, tenant_id) for doc in documents]
        return jsonify({'success': True, 'documents': serialized_docs})
    except Exception as e:
        print(f"Error getting documents: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def detect_document_type_endpoint():
    """Detect document type from file content structure."""
    from parsers.document_detector import detect_document_type_from_content
    
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Read file content
        file_content = file.read()
        if not file_content:
            print(f"⚠️ Empty file: {file.filename}")
            return jsonify({
                'success': True,
                'documentType': None,
                'filename': file.filename,
                'error': 'File is empty'
            })
        
        print(f"🔍 Detecting document type for file: {file.filename}, size: {len(file_content)} bytes")
        detected_type = detect_document_type_from_content(file_content, file.filename)
        
        if detected_type:
            print(f"✅ Detected type: {detected_type} for {file.filename}")
        else:
            print(f"❌ Could not detect type for {file.filename} - trying filename-based detection")
            # Fallback to filename-based detection
            from parsers.document_detector import detect_document_type
            detected_type = detect_document_type(file.filename)
            if detected_type:
                print(f"✅ Detected type from filename: {detected_type} for {file.filename}")
        
        return jsonify({
            'success': True,
            'documentType': detected_type,
            'filename': file.filename
        })
    except Exception as e:
        print(f"Error detecting document type: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to detect document type: {str(e)}'}), 500


def upload_document():
    """Upload a raw document file. Server encrypts it for storage."""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        document_type = request.form.get('documentType')
        if not document_type:
            return jsonify({'error': 'documentType is required'}), 400

        document_type = document_type.strip()
        print(f"📄 Document upload - documentType received: {document_type}")
        document_config = DOCUMENT_TYPE_LOOKUP.get(document_type)
        if not document_config:
            return jsonify({'error': f'Unknown documentType: {document_type}'}), 400
        print(f"✓ Document config found: {document_config['label']}")

        raw_file = request.files['file']
        if raw_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        file_data = raw_file.read()
        original_name = raw_file.filename
        original_size = len(file_data)
        original_type = raw_file.content_type or 'application/octet-stream'
        
        # Validate file extension
        extension = os.path.splitext(original_name)[1].lower()
        allowed_extensions = document_config.get('extensions') or []
        if allowed_extensions and extension not in allowed_extensions:
            return jsonify({
                'error': f"Expected file with extension {', '.join(allowed_extensions)} for {document_config['label']}"
            }), 400
        
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        uploaded_by = _get_authenticated_user_id()
        now_iso = datetime.now(timezone.utc).isoformat()
        
        # Create metadata structure
        server_metadata = {
            'document_type': document_type,
            'server_encryption': {
                'algorithm': 'AES-256-GCM',
                'encrypted_at': now_iso
            },
            'file_info': {
                'original_name': original_name,
                'original_size': original_size,
                'original_type': original_type,
                'uploaded_at': now_iso,
                'document_type': document_type
            },
            'document_metadata': {}
        }
        
        # Encrypt file data on server side
        associated_data = json.dumps(server_metadata, sort_keys=True).encode()
        server_encrypted_data = encryption_service.encrypt_data(
            file_data,
            tenant_id,
            associated_data
        )
        
        # Include server encryption metadata
        server_metadata['server_encryption'].update({
            'key_version': server_encrypted_data.key_version,
            'nonce': base64.b64encode(server_encrypted_data.nonce).decode('ascii')
        })
        
        file_record = wealth_db.store_encrypted_file(
            tenant_id=tenant_id,
            encrypted_data=server_encrypted_data.ciphertext,
            metadata=server_metadata,
            file_type=document_type,
            uploaded_by=uploaded_by
        )
        
        document_id = file_record.get('id')
        document_payload = _serialize_document_record(file_record, tenant_id)
        
        # Initialize progress tracking immediately
        _update_progress(document_id, 0, 'Upload complete, starting processing...', processed=None, total=None)
        
        # Process document to extract transactions (async, don't wait)
        try:
            _process_document_async(document_id, document_type, file_data, tenant_id)
        except Exception as e:
            print(f"Warning: Failed to process document {document_id}: {e}")
            _update_progress(document_id, 100, f'Processing failed: {str(e)}')
            # Don't fail the upload if processing fails
        
        return jsonify({
            'success': True,
            'document': document_payload
        }), 201
    except Exception as e:
        print(f"Error uploading document: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to upload document'}), 500


def delete_document(document_id):
    """Delete document."""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    try:
        deleted = wealth_db.delete_file_attachment(tenant_id, document_id)
        if not deleted:
            return jsonify({'error': 'Document not found'}), 404
        return jsonify({'success': True, 'message': 'Document deleted successfully'})
    except Exception as e:
        print(f"Error deleting document: {e}")
        return jsonify({'error': str(e)}), 500


def delete_documents_by_type(document_type):
    """Delete documents by type."""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    try:
        deleted = wealth_db.delete_file_attachments_by_type(tenant_id, document_type)
        return jsonify({'success': True, 'deleted_count': len(deleted)})
    except Exception as e:
        print(f"Error deleting documents by type: {e}")
        return jsonify({'error': str(e)}), 500


def upload_statement():
    """
    Upload and store bank statements (raw file, server encrypts).
    This endpoint is kept for backward compatibility but delegates to upload_document.
    """
    return upload_document()


def _update_progress(document_id, progress, message, processed=None, total=None):
    """Update progress for a document"""
    with _progress_lock:
        _document_progress[document_id] = {
            'progress': progress,
            'message': message,
            'processed': processed,
            'total': total,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }

def _get_progress(document_id):
    """Get progress for a document"""
    with _progress_lock:
        return _document_progress.get(document_id, {
            'progress': 0,
            'message': 'Waiting to start...',
            'processed': None,
            'total': None,
            'updated_at': None
        })

def get_upload_progress(upload_id):
    """Get upload progress for a specific upload"""
    # upload_id is actually document_id
    try:
        # Try to convert to int if it's a string
        document_id = int(upload_id) if isinstance(upload_id, str) and upload_id.isdigit() else upload_id
    except (ValueError, TypeError):
        document_id = upload_id
    
    progress = _get_progress(document_id)
    
    # Ensure we return proper types (None instead of null for JSON)
    return jsonify({
        'status': 'processing' if progress['progress'] < 100 else 'complete',
        'progress': progress['progress'],
        'message': progress['message'] or 'Processing...',
        'processed': progress['processed'] if progress['processed'] is not None else None,
        'total': progress['total'] if progress['total'] is not None else None
    })


def download_statement(file_id):
    """
    Download and decrypt a previously uploaded statement.
    Returns the raw decrypted file data.
    """
    try:
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        
        document = wealth_db.get_file_attachment(tenant_id, file_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        encryption_metadata = document.get('encryption_metadata') or document.get('metadata') or {}
        if isinstance(encryption_metadata, str):
            try:
                encryption_metadata = json.loads(encryption_metadata)
            except json.JSONDecodeError:
                return jsonify({'error': 'Invalid encryption metadata'}), 500
        
        server_encryption = encryption_metadata.get('server_encryption', {})
        nonce_b64 = server_encryption.get('nonce')
        key_version = server_encryption.get('key_version')
        
        if not nonce_b64 or not key_version:
            return jsonify({'error': 'Missing encryption information'}), 500
        
        try:
            nonce = base64.b64decode(nonce_b64)
        except Exception as e:
            print(f"Error decoding nonce: {e}")
            return jsonify({'error': 'Invalid encryption data'}), 500
        
        associated_data = json.dumps(encryption_metadata, sort_keys=True).encode()
        server_encrypted = EncryptedData(
            ciphertext=document['encrypted_data'],
            nonce=nonce,
            key_version=key_version,
            algorithm='AES-256-GCM',
            encrypted_at=server_encryption.get('encrypted_at', '')
        )
        
        # Decrypt file data
        file_data = encryption_service.decrypt_data(
            server_encrypted,
            tenant_id,
            associated_data
        )
        
        # Get file info
        file_info = encryption_metadata.get('file_info', {})
        original_name = file_info.get('original_name', 'document')
        original_type = file_info.get('original_type', 'application/octet-stream')
        
        # Return as base64 encoded data for JSON response
        return jsonify({
            'success': True,
            'fileData': base64.b64encode(file_data).decode(),
            'fileName': original_name,
            'fileType': original_type
        })
    
    except Exception as e:
        print(f"Error downloading statement {file_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to retrieve file'}), 500


def _process_document_async(document_id, document_type, file_data, tenant_id):
    """Process uploaded document to extract transactions (runs in background thread)"""
    def process():
        try:
            _update_progress(document_id, 5, 'Starting processing...')
            print(f"🔄 Processing document {document_id} of type {document_type} for tenant {tenant_id}")
            
            # Save to temp file
            _update_progress(document_id, 10, 'Preparing file...')
            extension = os.path.splitext(document_type)[1] if '.' in document_type else '.csv'
            if 'pdf' in document_type.lower():
                extension = '.pdf'
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as tmp_file:
                tmp_path = tmp_file.name
                tmp_file.write(file_data)
            
            try:
                # Parse based on document type
                _update_progress(document_id, 20, 'Parsing document...')
                from parsers.bank_statement_parser import BankStatementParser
                parser = BankStatementParser()
                
                transactions = []
                if document_type == 'bank_statement_dkb':
                    transactions = parser.parse_dkb(tmp_path)
                elif document_type == 'bank_statement_yuh':
                    transactions = parser.parse_yuh(tmp_path)
                elif document_type == 'loan_kfw_pdf':
                    loans = parser.parse_kfw(tmp_path)
                    # Loans are handled separately, not as transactions
                    print(f"📋 Extracted {len(loans)} loan records from KfW document")
                    
                    _update_progress(document_id, 50, f'Storing {len(loans)} loan record(s)...')
                    # Store loans in database
                    stored_loans = 0
                    for loan in loans:
                        try:
                            # Map parser fields to database fields
                            loan_data = {
                                'account_number': loan.get('account_number', ''),
                                'program': loan.get('program', ''),
                                'loan_name': loan.get('program', 'KfW Loan'),
                                'current_balance': loan.get('current_balance', 0),
                                'interest_rate': loan.get('interest_rate', 0),
                                'monthly_payment': loan.get('monthly_payment', 0),
                                'currency': 'EUR',  # KfW loans are typically in EUR
                                'loan_type': 'student',
                                'contract_date': loan.get('contract_date'),
                                'lender': 'KfW'
                            }
                            
                            result = wealth_db.create_loan(
                                tenant_id=tenant_id,
                                loan_data=loan_data,
                                source_document_id=document_id
                            )
                            if result:
                                stored_loans += 1
                                print(f"✅ Stored loan: {loan_data['loan_name']} - Balance: {loan_data['current_balance']} EUR")
                        except Exception as e:
                            print(f"❌ Error storing loan: {e}")
                            import traceback
                            traceback.print_exc()
                    
                    _update_progress(document_id, 100, f'Successfully stored {stored_loans} loan record(s)')
                    print(f"✅ Stored {stored_loans} loans in database")
                elif document_type in ['broker_viac_pdf', 'broker_ing_diba_csv']:
                    # Broker documents are processed on-demand when broker data is requested
                    # They don't need to be processed here, just acknowledge the upload
                    _update_progress(document_id, 100, 'Broker document ready (will be processed on-demand)')
                    print(f"✅ Broker document uploaded: {document_type} (will be processed when broker data is requested)")
                    return
                else:
                    _update_progress(document_id, 100, 'No processing required for this document type')
                    print(f"⚠️ No parser available for document type: {document_type}")
                    return
                
                if transactions:
                    print(f"✅ Extracted {len(transactions)} transactions from document {document_id}")
                    _update_progress(document_id, 40, f'Extracted {len(transactions)} transaction(s), preparing to store...')
                    
                    # Get or create accounts for transactions
                    account_cache = {}  # Cache account IDs by name
                    
                    def get_or_create_account(account_name, currency='EUR'):
                        """Get or create an account and return its ID"""
                        if account_name in account_cache:
                            return account_cache[account_name]
                        
                        # Try to find existing account
                        accounts = wealth_db.get_accounts(tenant_id)
                        for acc in accounts:
                            if acc['account_name'] == account_name:
                                account_cache[account_name] = acc['id']
                                return acc['id']
                        
                        # Create new account if not found
                        account_data = {
                            'name': account_name,
                            'type': 'checking' if 'girokonto' in account_name.lower() else 'savings',
                            'balance': 0,
                            'currency': currency
                        }
                        new_account = wealth_db.create_account(tenant_id, account_data)
                        account_cache[account_name] = new_account['id']
                        return new_account['id']
                    
                    # Store transactions in database
                    stored_count = 0
                    skipped_count = 0
                    total_transactions = len(transactions)
                    for idx, txn in enumerate(transactions):
                        # Update progress every 10 transactions or at milestones
                        if idx % 10 == 0 or idx == total_transactions - 1:
                            progress = 40 + int((idx + 1) / total_transactions * 50)  # 40-90% for transaction storage
                            _update_progress(document_id, progress, 
                                           f'Storing transactions... ({idx + 1}/{total_transactions})',
                                           processed=idx + 1, total=total_transactions)
                        
                        try:
                            account_name = txn.get('account', 'Unknown')
                            currency = txn.get('currency', 'EUR')
                            account_id = get_or_create_account(account_name, currency)
                            
                            transaction_data = {
                                'date': txn['date'],
                                'amount': txn['amount'],
                                'currency': currency,
                                'type': txn['type'],
                                'recipient': txn.get('recipient', ''),
                                'description': txn.get('description', ''),
                                'category': txn.get('category', 'Uncategorized')
                            }
                            
                            result = wealth_db.create_transaction(
                                tenant_id=tenant_id,
                                account_id=account_id,
                                transaction_data=transaction_data,
                                source_document_id=document_id
                            )
                            
                            if result:  # None means duplicate was skipped
                                stored_count += 1
                            else:
                                skipped_count += 1
                        except Exception as e:
                            # Handle duplicate key errors gracefully (race condition)
                            error_str = str(e)
                            if 'duplicate key' in error_str.lower() or '23505' in error_str:
                                skipped_count += 1
                                # This is expected - transaction already exists
                                continue
                            else:
                                # Re-raise unexpected errors
                                print(f"Unexpected error storing transaction: {e}")
                                raise
                    
                    _update_progress(document_id, 90, f'Stored {stored_count} transaction(s) ({skipped_count} duplicates skipped)')
                    print(f"✅ Stored {stored_count} transactions in database ({skipped_count} duplicates skipped)")
                    
                    # Update account balances if available
                    if hasattr(parser, 'account_balances') and parser.account_balances:
                        _update_progress(document_id, 95, 'Updating account balances...')
                        for account_name, balance_info in parser.account_balances.items():
                            # Ensure account exists and update balance
                            currency = balance_info.get('currency', 'EUR')
                            account_id = get_or_create_account(account_name, currency)
                            
                            # Update balance directly in database
                            tenant_db_id = wealth_db.set_tenant_context(tenant_id)
                            with wealth_db.db.get_cursor() as cursor:
                                cursor.execute("""
                                    UPDATE accounts 
                                    SET balance = %s, currency = %s, updated_at = CURRENT_TIMESTAMP
                                    WHERE id = %s AND tenant_id = %s
                                """, [balance_info['balance'], currency, account_id, tenant_db_id])
                                print(f"✅ Updated balance for account {account_name}: {balance_info['balance']} {currency}")
                    
                    _update_progress(document_id, 100, 'Processing complete!')
            
            finally:
                # Clean up temp file
                try:
                    os.remove(tmp_path)
                except Exception as e:
                    print(f"Warning: Could not delete temp file {tmp_path}: {e}")
                    
        except Exception as e:
            _update_progress(document_id, 100, f'Processing failed: {str(e)}')
            print(f"❌ Error processing document {document_id}: {e}")
            import traceback
            traceback.print_exc()
    
    # Run in background thread
    thread = threading.Thread(target=process)
    thread.daemon = True
    thread.start()


def wipe_tenant_data():
    """Wipe tenant data."""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    print(f"🔍 wipe_tenant_data called for tenant: {tenant_id}")
    print(f"🔍 Request JSON: {request.json}")
    try:
        keep_custom_categories = request.json.get('keep_custom_categories', True) if request.json else True
        print(f"🔍 keep_custom_categories: {keep_custom_categories}")
        deletion_counts = wealth_db.wipe_tenant_data(tenant_id, keep_custom_categories=keep_custom_categories)
        print(f"✅ Deletion counts: {deletion_counts}")
        return jsonify({'success': True, 'deletion_counts': deletion_counts})
    except Exception as e:
        print(f"❌ Error wiping tenant data: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
