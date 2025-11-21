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

# Initialize services
encryption_service = get_encryption_service()
wealth_db = get_wealth_database()


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
    client_metadata = {}
    document_metadata = {}

    if isinstance(metadata, dict):
        file_info = metadata.get('file_info') or {}
        client_metadata = metadata.get('client_encryption', {}).get('fileMetadata') or {}
        document_metadata = (
            metadata.get('document_metadata')
            or metadata.get('user_metadata')
            or metadata.get('fileMetadata')
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
        'clientMetadata': client_metadata or {},
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
        print(f"🔍 Detecting document type for file: {file.filename}, size: {len(file_content)} bytes")
        detected_type = detect_document_type_from_content(file_content, file.filename)
        
        if detected_type:
            print(f"✅ Detected type: {detected_type} for {file.filename}")
        else:
            print(f"❌ Could not detect type for {file.filename}")
        
        return jsonify({
            'success': True,
            'documentType': detected_type,
            'filename': file.filename
        })
    except Exception as e:
        print(f"Error detecting document type: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to detect document type'}), 500


def upload_document():
    """Upload a new encrypted document for a specific document type."""
    try:
        if 'encryptedFile' not in request.files or 'encryptionMetadata' not in request.form:
            return jsonify({'error': 'Missing encrypted file or metadata'}), 400

        document_type = request.form.get('documentType')
        if not document_type:
            return jsonify({'error': 'documentType is required'}), 400

        document_type = document_type.strip()
        print(f"📄 Document upload - documentType received: {document_type}")
        document_config = DOCUMENT_TYPE_LOOKUP.get(document_type)
        if not document_config:
            return jsonify({'error': f'Unknown documentType: {document_type}'}), 400
        print(f"✓ Document config found: {document_config['label']}")

        encrypted_file = request.files['encryptedFile']
        metadata_raw = request.form['encryptionMetadata']
        try:
            metadata = json.loads(metadata_raw)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid encryption metadata'}), 400

        required_keys = ['originalName', 'originalSize', 'originalType']
        if not all(key in metadata for key in required_keys):
            return jsonify({'error': 'Invalid file metadata provided'}), 400

        original_name = metadata.get('originalName') or ''
        extension = os.path.splitext(original_name)[1].lower()
        allowed_extensions = document_config.get('extensions') or []
        if allowed_extensions and extension not in allowed_extensions:
            return jsonify({
                'error': f"Expected file with extension {', '.join(allowed_extensions)} for {document_config['label']}"
            }), 400

        document_metadata_raw = request.form.get('documentMetadata')
        document_metadata = None
        if document_metadata_raw:
            try:
                document_metadata = json.loads(document_metadata_raw)
            except json.JSONDecodeError:
                document_metadata = {'raw': document_metadata_raw}

        metadata.setdefault('fileMetadata', {})
        metadata['fileMetadata']['documentType'] = document_type

        file_data = encrypted_file.read()
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        uploaded_by = _get_authenticated_user_id()
        now_iso = datetime.now(timezone.utc).isoformat()

        # Check if client already encrypted the file
        client_algorithm = metadata.get('algorithm', 'none')
        is_client_encrypted = client_algorithm != 'none' and client_algorithm is not None
        
        if is_client_encrypted:
            # Client encrypted the file
            print(f"⚠️ Warning: Received client-encrypted file for {document_type}")
            server_encrypted_data = EncryptedData(
                ciphertext=file_data,
                nonce=b'',
                key_version=None,
                algorithm='none',
                encrypted_at=now_iso
            )
            server_metadata = {
                'client_encryption': metadata,
                'document_type': document_type,
                'server_encryption': {
                    'algorithm': 'none',
                    'encrypted_at': now_iso,
                    'key_version': None,
                    'nonce': None
                },
                'file_info': {
                    'original_name': metadata['originalName'],
                    'original_size': metadata['originalSize'],
                    'original_type': metadata['originalType'],
                    'uploaded_at': now_iso,
                    'document_type': document_type
                },
                'document_metadata': document_metadata
            }
        else:
            # File is plaintext - encrypt it on the server
            server_metadata = {
                'client_encryption': metadata,
                'document_type': document_type,
                'server_encryption': {
                    'algorithm': 'AES-256-GCM',
                    'encrypted_at': now_iso
                },
                'file_info': {
                    'original_name': metadata['originalName'],
                    'original_size': metadata['originalSize'],
                    'original_type': metadata['originalType'],
                    'uploaded_at': now_iso,
                    'document_type': document_type
                },
                'document_metadata': document_metadata
            }

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

        document_payload = _serialize_document_record(file_record, tenant_id)

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
    Upload and store encrypted bank statements.
    Implements dual-layer encryption.
    """
    try:
        if 'encryptedFile' not in request.files or 'encryptionMetadata' not in request.form:
            return jsonify({'error': 'Missing encrypted file or metadata'}), 400

        encrypted_file = request.files['encryptedFile']
        metadata_str = request.form['encryptionMetadata']

        try:
            metadata = json.loads(metadata_str)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid encryption metadata'}), 400

        document_type = (
            request.form.get('documentType')
            or metadata.get('fileMetadata', {}).get('documentType')
            or 'bank_statement_dkb'
        )

        document_metadata_raw = request.form.get('documentMetadata')
        document_metadata = None
        if document_metadata_raw:
            try:
                document_metadata = json.loads(document_metadata_raw)
            except json.JSONDecodeError:
                document_metadata = {'raw': document_metadata_raw}

        metadata.setdefault('fileMetadata', {})
        metadata['fileMetadata']['documentType'] = document_type

        client_ciphertext = encrypted_file.read()

        server_metadata = {
            'client_encryption': metadata,
            'server_encryption': {
                'algorithm': 'AES-256-GCM',
                'encrypted_at': datetime.now(timezone.utc).isoformat()
            },
            'file_info': {
                'original_name': metadata['originalName'],
                'original_size': metadata['originalSize'],
                'original_type': metadata['originalType'],
                'uploaded_at': datetime.now(timezone.utc).isoformat(),
                'document_type': document_type
            },
            'document_metadata': {
                **(document_metadata or {}),
                'processingStatus': 'complete' if document_type and not any(ext in document_type for ext in ['csv', 'CSV']) else 'pending'
            }
        }

        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        associated_data = json.dumps(server_metadata, sort_keys=True).encode()
        server_encrypted_data = encryption_service.encrypt_data(
            client_ciphertext,
            tenant_id,
            associated_data
        )

        file_record = wealth_db.store_encrypted_file(
            tenant_id=tenant_id,
            encrypted_data=server_encrypted_data.ciphertext,
            metadata=server_metadata,
            file_type=document_type,
            uploaded_by=_get_authenticated_user_id()
        )

        return jsonify({
            'success': True,
            'file_id': file_record['id'],
            'message': 'File uploaded and encrypted successfully'
        })
    except Exception as e:
        print(f"Error uploading statement: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to upload statement'}), 500


def get_upload_progress(upload_id):
    """Get upload progress."""
    return jsonify({'status': 'unknown', 'processed': 0, 'total': 0})


def download_statement(file_id):
    """
    Download and decrypt a previously uploaded statement.
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
        
        client_ciphertext = encryption_service.decrypt_data(
            server_encrypted,
            tenant_id,
            associated_data
        )
        
        return jsonify({
            'encryptedData': base64.b64encode(client_ciphertext).decode(),
            'metadata': encryption_metadata.get('client_encryption', {})
        })
    
    except Exception as e:
        print(f"Error downloading statement {file_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to retrieve file'}), 500


def wipe_tenant_data():
    """Wipe tenant data."""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    try:
        keep_custom_categories = request.json.get('keep_custom_categories', True) if request.json else True
        deletion_counts = wealth_db.wipe_tenant_data(tenant_id, keep_custom_categories=keep_custom_categories)
        return jsonify({'success': True, 'deletion_counts': deletion_counts})
    except Exception as e:
        print(f"Error wiping tenant data: {e}")
        return jsonify({'error': str(e)}), 500
