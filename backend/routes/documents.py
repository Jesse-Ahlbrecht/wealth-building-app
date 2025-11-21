"""
Documents Routes

Handles document upload, download, listing, and deletion.
"""

from flask import Blueprint
from middleware.auth_middleware import authenticate_request, require_auth
from services import document_service

documents_bp = Blueprint('documents', __name__, url_prefix='/api')


@documents_bp.route('/documents', methods=['GET'])
@authenticate_request
@require_auth
def get_documents():
    """List all documents"""
    return document_service.get_documents()


@documents_bp.route('/documents/detect-type', methods=['POST'])
@authenticate_request
@require_auth
def detect_document_type():
    """Detect document type from uploaded file"""
    return document_service.detect_document_type_endpoint()


@documents_bp.route('/documents/upload', methods=['POST'])
@authenticate_request
@require_auth
def upload_document():
    """Upload a new encrypted document"""
    return document_service.upload_document()


@documents_bp.route('/documents/<int:document_id>', methods=['DELETE'])
@authenticate_request
@require_auth
def delete_document(document_id: int):
    """Delete a previously uploaded document"""
    return document_service.delete_document(document_id)


@documents_bp.route('/documents/by-type/<string:document_type>', methods=['DELETE'])
@authenticate_request
@require_auth
def delete_documents_by_type(document_type: str):
    """Delete all documents of a specific type"""
    return document_service.delete_documents_by_type(document_type)


@documents_bp.route('/upload-statement', methods=['POST'])
@authenticate_request
@require_auth
def upload_statement():
    """Upload and store encrypted bank statements"""
    return document_service.upload_statement()


@documents_bp.route('/upload-progress/<upload_id>', methods=['GET'])
@authenticate_request
@require_auth
def get_upload_progress(upload_id: str):
    """Get upload progress for a specific upload"""
    return document_service.get_upload_progress(upload_id)


@documents_bp.route('/download-statement/<file_id>', methods=['GET'])
@authenticate_request
@require_auth
def download_statement(file_id: str):
    """Download and decrypt a previously uploaded statement"""
    return document_service.download_statement(file_id)


@documents_bp.route('/wipe-data', methods=['POST'])
@authenticate_request
@require_auth
def wipe_data():
    """Wipe all tenant data"""
    return document_service.wipe_tenant_data()


@documents_bp.route('/essential-categories', methods=['GET'])
@authenticate_request
def get_essential_categories():
    """Get user's essential categories preferences"""
    from flask import g, jsonify
    from database import get_wealth_database
    
    try:
        tenant_id = g.session_claims.get('tenant')
        if not tenant_id:
            return jsonify({'error': 'Tenant ID not found'}), 400
        
        wealth_db = get_wealth_database()
        categories = wealth_db.get_essential_categories(tenant_id)
        return jsonify({'categories': categories}), 200
    except Exception as e:
        print(f"Error fetching essential categories: {e}")
        return jsonify({'error': 'Failed to fetch essential categories'}), 500


@documents_bp.route('/essential-categories', methods=['POST'])
@authenticate_request
def save_essential_categories():
    """Save user's essential categories preferences"""
    from flask import g, request, jsonify
    from database import get_wealth_database
    
    try:
        tenant_id = g.session_claims.get('tenant')
        if not tenant_id:
            return jsonify({'error': 'Tenant ID not found'}), 400
        
        data = request.get_json()
        categories = data.get('categories', [])
        
        wealth_db = get_wealth_database()
        wealth_db.save_essential_categories(tenant_id, categories)
        return jsonify({'success': True}), 200
    except Exception as e:
        print(f"Error saving essential categories: {e}")
        return jsonify({'error': 'Failed to save essential categories'}), 500
