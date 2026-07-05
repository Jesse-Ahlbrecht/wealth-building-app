"""
Category Routes

Handles category retrieval, creation, and transaction category updates.
"""

import traceback
from flask import Blueprint, g, request, jsonify
from database import get_wealth_database
from middleware.auth_middleware import authenticate_request, require_auth
from category_config import get_savings_category_names
from services.categorizer import get_categorizer, _load_json
from utils.response_helpers import success_response, error_response

categories_bp = Blueprint('categories', __name__, url_prefix='/api')
wealth_db = get_wealth_database()


def _load_categories(filename):
    return _load_json(filename)


@categories_bp.route('/categories', methods=['GET'])
@authenticate_request
@require_auth
def get_categories():
    """Get all available categories including custom ones"""
    try:
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        
        # Load default categories from JSON files
        spending_categories = _load_categories('categories_spending.json')
        income_categories = _load_categories('categories_income.json')
        
        # Get tenant-specific custom categories from database
        db_categories = wealth_db.get_categories(tenant_id)
        
        savings_categories = get_savings_category_names()
        spending_names = list(spending_categories.keys())
        savings_only = [name for name in savings_categories if name not in spending_categories]

        all_categories = {
            'income': (
                [{'name': name, 'source': 'system'} for name in income_categories.keys()]
                + [{'name': c['category_name'], 'source': 'custom'} for c in db_categories.get('income', [])]
            ),
            'expense': (
                [{'name': name, 'source': 'system'} for name in spending_names]
                + [{'name': name, 'source': 'system'} for name in savings_only]
                + [{'name': c['category_name'], 'source': 'custom'} for c in db_categories.get('expense', [])]
            ),
        }
        
        return jsonify(all_categories)
    except Exception as e:
        print(f"Error getting categories: {e}")
        traceback.print_exc()
        return jsonify({'income': [], 'expense': []})


@categories_bp.route('/categories', methods=['POST'])
@authenticate_request
@require_auth
def create_custom_category():
    """Create a new custom category"""
    try:
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        data = request.get_json()
        category_name = data.get('name', '').strip()
        category_type = data.get('type', 'expense')
        
        print(f"Creating custom category for tenant {tenant_id}: {category_name} ({category_type})")
        
        if not category_name:
            return error_response('Category name is required', 400)
        
        if category_type not in ['income', 'expense']:
            return error_response('Category type must be income or expense', 400)
        
        # Check if category already exists in default categories
        if category_type == 'expense':
            default_categories = _load_categories('categories_spending.json')
        else:
            default_categories = _load_categories('categories_income.json')
        
        if category_name in default_categories or category_name in get_savings_category_names():
            return error_response('Category already exists as a default category', 400)
        
        # Create category in database
        try:
            wealth_db.create_custom_category(tenant_id, category_name, category_type)
            print(f"✓ Custom category created successfully")
            return success_response(message='Custom category created successfully')
        except ValueError as e:
            # Duplicate category
            print(f"Category already exists: {e}")
            return error_response(str(e), 400)
        
    except Exception as e:
        print(f"Error creating custom category: {e}")
        traceback.print_exc()
        return error_response('Failed to create custom category', 500)


@categories_bp.route('/update-category', methods=['POST'])
@authenticate_request
@require_auth
def update_category():
    """Update the category of a specific transaction"""
    try:
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        data = request.get_json()
        transaction = data.get('transaction') or {}
        new_category = data.get('newCategory')

        print(f"=== UPDATE CATEGORY ===")
        print(f"Tenant: {tenant_id}, New category: {new_category}")
        print(f"Transaction data: {transaction}")

        if not transaction:
            print("ERROR: No transaction data provided")
            return error_response('Missing transaction data', 400)
            
        if not new_category:
            print("ERROR: No new category provided")
            return error_response('Missing newCategory', 400)

        # Get the transaction hash (should be included in transaction object)
        transaction_hash = transaction.get('transaction_hash')
        
        if not transaction_hash:
            print(f"ERROR: Missing transaction_hash in transaction object. Keys available: {list(transaction.keys())}")
            return error_response('Missing transaction_hash - please refresh the page', 400)

        print(f"Updating transaction {transaction_hash} to category: {new_category}")

        # Update the category in the database
        result = wealth_db.create_category_override(
            tenant_id=tenant_id,
            transaction_hash=transaction_hash,
            override_category=new_category,
            reason='Manual user override'
        )

        updated_count = result.get('updated_transactions', 1) if isinstance(result, dict) else 1
        print(f"✓ Category updated successfully ({updated_count} transaction(s))")
        return success_response(
            data={'updatedTransactions': updated_count},
            message='Category updated successfully'
        )

    except Exception as e:
        print(f"Error updating category: {e}")
        traceback.print_exc()
        return error_response(f'Failed to update category: {str(e)}', 500)


@categories_bp.route('/suggest-category', methods=['POST'])
@authenticate_request
@require_auth
def suggest_category():
    try:
        data = request.get_json() or {}
        transaction = data.get('transaction') or {}
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        owned_accounts = wealth_db.get_accounts(tenant_id)
        result = get_categorizer().categorize_from_transaction(transaction, owned_accounts=owned_accounts)
        if result.category == 'Other':
            return jsonify({'suggested': None, 'stage': result.stage})
        return jsonify({'suggested': result.category, 'stage': result.stage})
    except Exception as e:
        print(f"Error suggesting category: {e}")
        traceback.print_exc()
        return error_response('Failed to suggest category', 500)


@categories_bp.route('/essential-categories', methods=['GET'])
@authenticate_request
def get_essential_categories():
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    categories = wealth_db.get_essential_categories(tenant_id)
    return jsonify(categories)


@categories_bp.route('/essential-categories', methods=['POST'])
@authenticate_request
def save_essential_categories():
    try:
        tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
        data = request.get_json()
        categories = data.get('categories', [])
        
        print(f"Saving essential categories for tenant {tenant_id}: {categories}")
        wealth_db.save_essential_categories(tenant_id, categories)
        
        return success_response(message='Essential categories saved successfully')
    except Exception as e:
        print(f"Error saving essential categories: {e}")
        traceback.print_exc()
        return error_response('Failed to save essential categories', 500)
