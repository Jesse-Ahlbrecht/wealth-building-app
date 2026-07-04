"""
Predictions Routes

Handles recurring payment prediction dismissals, predictions generation, and average essential spending.
"""

import traceback
from datetime import datetime, timedelta
from flask import Blueprint, g, request, jsonify
from database import get_wealth_database
from middleware.auth_middleware import authenticate_request, require_auth
from utils.response_helpers import success_response, error_response
from prediction_service import RecurringPatternDetector, get_dismissed_predictions, get_overrides

predictions_bp = Blueprint('predictions', __name__, url_prefix='/api')
wealth_db = get_wealth_database()


def _transactions_for_detector(db_transactions):
    return [{
        'date': t['transaction_date'],
        'amount': float(t['amount']) if t['transaction_type'] == 'income' else -float(t['amount']),
        'currency': t['currency'],
        'type': t['transaction_type'],
        'recipient': t.get('recipient', ''),
        'description': t.get('description', ''),
        'category': t.get('category', 'Uncategorized')
    } for t in db_transactions]


@predictions_bp.route('/predictions/dismiss', methods=['POST'])
@authenticate_request
@require_auth
def dismiss_prediction():
    """
    Dismiss a prediction so it won't show up again
    """
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    
    try:
        data = request.get_json()
        prediction_key = data.get('prediction_key')
        recurrence_type = data.get('recurrence_type', 'monthly')
        scope = data.get('scope')
        month = data.get('month')

        if not prediction_key:
            return error_response('prediction_key is required', 400)

        current_date = datetime.now()

        if scope == 'month' and month:
            # Skip only this month's occurrence: expire at end of the given month
            year, mon = map(int, month.split('-'))
            first_next = datetime(year + 1, 1, 1) if mon == 12 else datetime(year, mon + 1, 1)
            expires_at = first_next - timedelta(days=1)
        elif recurrence_type == 'quarterly':
            # Expire after 4 months
            expires_at = current_date + timedelta(days=120)
        elif recurrence_type == 'yearly':
            # Expire after 14 months
            expires_at = current_date + timedelta(days=420)
        else:
            # Default (monthly): expire after 2 months
            expires_at = current_date + timedelta(days=60)

        # Store dismissal in database
        with wealth_db.db.get_cursor() as cursor:
            # Get tenant DB ID
            cursor.execute(
                "SELECT id FROM tenants WHERE tenant_id = %s",
                [tenant_id]
            )
            tenant_result = cursor.fetchone()
            if not tenant_result:
                return error_response('Tenant not found', 404)
            
            tenant_db_id = tenant_result[0]
            
            # Insert or update dismissal
            cursor.execute("""
                INSERT INTO prediction_dismissals 
                (tenant_id, prediction_key, expires_at)
                VALUES (%s, %s, %s)
                ON CONFLICT (prediction_key) 
                DO UPDATE SET dismissed_at = CURRENT_TIMESTAMP, expires_at = EXCLUDED.expires_at
            """, [tenant_db_id, prediction_key, expires_at.date()])
        
        return success_response(message='Prediction dismissed successfully')
        
    except Exception as e:
        print(f"Error dismissing prediction: {e}")
        traceback.print_exc()
        return error_response('Failed to dismiss prediction', 500)


@predictions_bp.route('/predictions/month/<month>', methods=['GET'])
@authenticate_request
@require_auth
def get_predictions_for_month(month):
    """
    Get predicted transactions for a specific month.
    
    Args:
        month: Month in format 'YYYY-MM'
    """
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    
    try:
        # Get all transactions from database
        db_transactions = wealth_db.get_transactions(tenant_id, limit=10000, offset=0)
        transactions = _transactions_for_detector(db_transactions)
        detector = RecurringPatternDetector()
        patterns = detector.detect_recurring_patterns(transactions)
        
        # Get dismissed predictions and user overrides
        with wealth_db.db.get_cursor() as cursor:
            dismissed = get_dismissed_predictions(cursor, tenant_id, month)
            overrides = get_overrides(cursor, tenant_id)

        same_month_actuals = [t for t in transactions if str(t['date'])[:7] == month]

        # Generate predictions for the target month, suppressing any (recipient, category, type)
        # that already has an actual transaction this month
        predictions = detector.generate_predictions_for_month(patterns, month, dismissed, same_month_actuals, overrides)

        return jsonify(predictions)
        
    except Exception as e:
        print(f"Error generating predictions: {e}")
        traceback.print_exc()
        return error_response('Failed to generate predictions', 500)


@predictions_bp.route('/predictions/average-essential/<month>', methods=['GET'])
@authenticate_request
@require_auth
def get_average_essential_spending(month):
    """
    Get average essential spending for a month based on previous months.
    
    Args:
        month: Month in format 'YYYY-MM'
    """
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    
    try:
        # Get essential categories
        essential_categories = wealth_db.get_essential_categories(tenant_id)
        essential_category_set = set(cat.lower() for cat in essential_categories)
        
        # Get all transactions
        db_transactions = wealth_db.get_transactions(tenant_id, limit=10000, offset=0)
        
        # Group transactions by month
        monthly_expenses = {}
        for t in db_transactions:
            if t['transaction_type'] != 'income':
                txn_date = t['transaction_date']
                if isinstance(txn_date, str):
                    try:
                        txn_date = datetime.fromisoformat(txn_date.replace('Z', '+00:00'))
                    except:
                        try:
                            txn_date = datetime.strptime(txn_date, '%Y-%m-%d')
                        except:
                            continue
                
                month_key = txn_date.strftime('%Y-%m')
                
                # Check if this is a loan payment
                category = t.get('category', '')
                is_loan_payment = 'loan' in category.lower()
                
                # Check if category is essential
                is_essential = category.lower() in essential_category_set or is_loan_payment
                
                if is_essential:
                    if month_key not in monthly_expenses:
                        monthly_expenses[month_key] = []
                    monthly_expenses[month_key].append(abs(float(t['amount'])))
        
        # Sort months and find previous months relative to target month
        sorted_months = sorted(monthly_expenses.keys(), reverse=True)
        target_index = sorted_months.index(month) if month in sorted_months else -1
        
        if target_index < 0:
            # Target month not found, use all available months before it
            previous_months = [m for m in sorted_months if m < month]
        else:
            # Get the 3 months after the target month (more recent)
            previous_months = sorted_months[target_index + 1:target_index + 4]
        
        if not previous_months:
            return jsonify({'average': 0, 'months_used': []})
        
        # Calculate average from previous months
        totals = []
        for prev_month in previous_months:
            if prev_month in monthly_expenses:
                total = sum(monthly_expenses[prev_month])
                totals.append(total)
        
        average = sum(totals) / len(totals) if totals else 0
        
        return jsonify({
            'average': average,
            'months_used': previous_months[:len(totals)],
            'month_count': len(totals)
        })
        
    except Exception as e:
        print(f"Error calculating average essential spending: {e}")
        traceback.print_exc()
        return error_response('Failed to calculate average essential spending', 500)


@predictions_bp.route('/predictions/recurring', methods=['GET'])
@authenticate_request
@require_auth
def get_recurring_payments():
    """
    List active recurring payments with override state for the management page.
    """
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'

    try:
        db_transactions = wealth_db.get_transactions(tenant_id, limit=10000, offset=0)
        transactions = _transactions_for_detector(db_transactions)

        detector = RecurringPatternDetector()
        patterns = detector.detect_recurring_patterns(transactions)

        with wealth_db.db.get_cursor() as cursor:
            overrides = get_overrides(cursor, tenant_id)

        result = []
        for pattern in patterns:
            override = overrides.get(pattern['prediction_key'])
            enabled = override['enabled'] if override else True
            has_custom = bool(override and (
                override.get('custom_amount') is not None
                or override.get('custom_day') is not None
                or override.get('custom_recurrence_type')
            ))
            status = 'disabled' if not enabled else ('customized' if has_custom else 'active')

            last_date = pattern['last_date']
            last_date = last_date.isoformat() if hasattr(last_date, 'isoformat') else str(last_date)

            result.append({
                'prediction_key': pattern['prediction_key'],
                'recipient': pattern['recipient'],
                'category': pattern['category'],
                'type': pattern['type'],
                'recurrence_type': (override.get('custom_recurrence_type') if override else None) or pattern['recurrence_type'],
                'detected_recurrence_type': pattern['recurrence_type'],
                'average_amount': pattern['average_amount'],
                'amount': override['custom_amount'] if override and override.get('custom_amount') is not None else pattern['average_amount'],
                'typical_day': pattern['typical_day'],
                'day': override['custom_day'] if override and override.get('custom_day') else pattern['typical_day'],
                'currency': pattern['currency'],
                'confidence': pattern['confidence'],
                'occurrences': pattern['occurrences'],
                'last_date': last_date,
                'enabled': enabled,
                'custom_amount': override.get('custom_amount') if override else None,
                'custom_day': override.get('custom_day') if override else None,
                'custom_recurrence_type': override.get('custom_recurrence_type') if override else None,
                'status': status,
                'based_on': pattern.get('historical_payments', [])
            })

        return jsonify(result)

    except Exception as e:
        print(f"Error listing recurring payments: {e}")
        traceback.print_exc()
        return error_response('Failed to list recurring payments', 500)


@predictions_bp.route('/predictions/recurring/<prediction_key>', methods=['PUT'])
@authenticate_request
@require_auth
def update_recurring_payment(prediction_key):
    """
    Upsert a user override for a recurring payment. Used for disable (delete),
    customize (amount/day/frequency), and restore (enable + clear customizations).
    """
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'

    try:
        data = request.get_json() or {}
        enabled = data.get('enabled', True)
        custom_amount = data.get('custom_amount')
        custom_day = data.get('custom_day')
        custom_recurrence_type = data.get('custom_recurrence_type')
        recipient = data.get('recipient')
        category = data.get('category')

        with wealth_db.db.get_cursor() as cursor:
            cursor.execute("SELECT id FROM tenants WHERE tenant_id = %s", [tenant_id])
            tenant_result = cursor.fetchone()
            if not tenant_result:
                return error_response('Tenant not found', 404)
            tenant_db_id = tenant_result[0]

            cursor.execute("""
                INSERT INTO prediction_overrides
                (tenant_id, prediction_key, recipient, category, enabled, custom_amount, custom_day, custom_recurrence_type, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (prediction_key)
                DO UPDATE SET enabled = EXCLUDED.enabled,
                              custom_amount = EXCLUDED.custom_amount,
                              custom_day = EXCLUDED.custom_day,
                              custom_recurrence_type = EXCLUDED.custom_recurrence_type,
                              recipient = COALESCE(EXCLUDED.recipient, prediction_overrides.recipient),
                              category = COALESCE(EXCLUDED.category, prediction_overrides.category),
                              updated_at = CURRENT_TIMESTAMP
            """, [tenant_db_id, prediction_key, recipient, category, enabled,
                  custom_amount, custom_day, custom_recurrence_type])

        return success_response(message='Recurring payment updated successfully')

    except Exception as e:
        print(f"Error updating recurring payment: {e}")
        traceback.print_exc()
        return error_response('Failed to update recurring payment', 500)

