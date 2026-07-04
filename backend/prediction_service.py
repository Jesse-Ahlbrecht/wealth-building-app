"""
Recurring Payment Prediction Service

Analyzes historical transactions to detect recurring patterns and predict future payments.
Supports monthly, quarterly, and yearly recurrence patterns.
"""

from collections import defaultdict
from datetime import datetime, timedelta
from datetime import date as date_class
from typing import List, Dict, Any, Set, Tuple
import hashlib
import re
import statistics


class RecurringPatternDetector:
    """Detects recurring payment patterns from transaction history"""

    RECURRING_EXPENSE_CATEGORIES = frozenset({
        'Rent', 'Insurance', 'Subscriptions', 'Utilities',
        'Loan Payment', 'Investment Account Payment', 'Transport',
    })

    # Pattern detection windows (days tolerance)
    MONTHLY_WINDOW = 3
    YEARLY_WINDOW = 7

    # Minimum occurrences to establish a pattern
    MIN_OCCURRENCES_MONTHLY = 3
    MIN_OCCURRENCES_QUARTERLY = 3
    MIN_OCCURRENCES_YEARLY = 2

    # Variability threshold (std dev as % of mean)
    MAX_VARIABILITY = 0.15
    MAX_VARIABILITY_INCOME = 0.35

    # Monthly bills land on roughly the same day each month
    MAX_DAY_OF_MONTH_SPREAD = 7
    MAX_DAY_OF_MONTH_SPREAD_INCOME = 12

    MONTHLY_WINDOW_INCOME = 7

    STALE_GRACE_DAYS = 7

    RECIPIENT_PREFIXES = (
        'überweisung von ',
        'uberweisung von ',
        'twint von ',
    )
    
    def detect_recurring_patterns(self, transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Analyze transactions and detect recurring patterns.
        
        Args:
            transactions: List of transaction dictionaries with keys:
                - date, amount, category, recipient, currency, type
                
        Returns:
            List of detected patterns with metadata
        """
        # Filter out internal transfers
        filtered_transactions = [
            t for t in transactions 
            if t.get('category') != 'Internal Transfer'
        ]
        
        groups = self._group_transactions(filtered_transactions)
        
        patterns = []
        for group_key, group_transactions in groups.items():
            recipient, category, txn_type = group_key
            if txn_type == 'expense' and category not in self.RECURRING_EXPENSE_CATEGORIES:
                continue

            if len(group_transactions) < self.MIN_OCCURRENCES_MONTHLY:
                continue

            sorted_txns = sorted(group_transactions, key=lambda x: x['date'])
            sorted_txns = self._collapse_to_one_per_month(sorted_txns)
            if len(sorted_txns) < self.MIN_OCCURRENCES_MONTHLY:
                continue
            
            # Try to detect different pattern types
            monthly_pattern = self._detect_monthly_pattern(sorted_txns, group_key)
            if monthly_pattern:
                patterns.append(monthly_pattern)
                continue
                
            quarterly_pattern = self._detect_quarterly_pattern(sorted_txns, group_key)
            if quarterly_pattern:
                patterns.append(quarterly_pattern)
                continue
                
            yearly_pattern = self._detect_yearly_pattern(sorted_txns, group_key)
            if yearly_pattern:
                patterns.append(yearly_pattern)

        merged = self._merge_duplicate_patterns(patterns)
        return self._filter_active_patterns(merged)

    def _parse_last_date(self, last_date) -> datetime:
        if isinstance(last_date, str):
            return datetime.fromisoformat(last_date)
        if isinstance(last_date, date_class):
            return datetime.combine(last_date, datetime.min.time())
        return last_date

    def _next_expected_payment_date(self, last_date, recurrence_type: str) -> datetime:
        last_date = self._parse_last_date(last_date)

        if recurrence_type == 'monthly':
            if last_date.month == 12:
                expected_month, expected_year = 1, last_date.year + 1
            else:
                expected_month, expected_year = last_date.month + 1, last_date.year
        elif recurrence_type == 'quarterly':
            expected_month = last_date.month + 3
            expected_year = last_date.year
            while expected_month > 12:
                expected_month -= 12
                expected_year += 1
        elif recurrence_type == 'yearly':
            expected_month, expected_year = last_date.month, last_date.year + 1
        else:
            return last_date

        try:
            return datetime(expected_year, expected_month, last_date.day)
        except ValueError:
            if expected_month == 12:
                next_month, next_year = 1, expected_year + 1
            else:
                next_month, next_year = expected_month + 1, expected_year
            return datetime(next_year, next_month, 1) - timedelta(days=1)

    def is_pattern_active(self, pattern: Dict[str, Any], as_of: datetime = None) -> bool:
        as_of = as_of or datetime.now()
        expected = self._next_expected_payment_date(
            pattern['last_date'], pattern['recurrence_type']
        )
        return (as_of - expected).days <= self.STALE_GRACE_DAYS

    def _filter_active_patterns(self, patterns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        active = []
        for pattern in patterns:
            if self.is_pattern_active(pattern):
                active.append(pattern)
        return active

    def _match_key(self, recipient: str, category: str, txn_type: str) -> Tuple[str, str, str]:
        return (self._normalize_recipient(recipient), category, txn_type)

    def _as_date(self, value):
        if isinstance(value, datetime):
            return value.date()
        return value

    def _normalize_recipient(self, recipient: str) -> str:
        r = recipient.strip().strip('"\'')
        r = re.sub(r'\s+', ' ', r)
        lower = r.lower()
        for prefix in self.RECIPIENT_PREFIXES:
            if lower.startswith(prefix):
                r = r[len(prefix):].strip()
                break
        return r

    def _merge_duplicate_patterns(self, patterns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        merged: Dict[Tuple, Dict[str, Any]] = {}
        for pattern in patterns:
            key = (
                self._normalize_recipient(pattern['recipient']).lower(),
                pattern['type'],
                pattern['recurrence_type'],
            )
            if key not in merged:
                merged[key] = pattern
                continue

            existing = merged[key]
            by_date = {}
            for item in existing.get('historical_payments', []):
                by_date[item['date']] = item
            for item in pattern.get('historical_payments', []):
                prev = by_date.get(item['date'])
                if not prev or abs(item['amount']) > abs(prev['amount']):
                    by_date[item['date']] = item

            combined = sorted(by_date.values(), key=lambda x: x['date'])
            existing['historical_payments'] = combined
            existing['occurrences'] = len(combined)
            existing['last_date'] = combined[-1]['date']
            if pattern['occurrences'] > existing.get('_source_count', existing['occurrences']):
                existing['recipient'] = pattern['recipient']
            existing['_source_count'] = max(existing.get('_source_count', 0), pattern['occurrences'])

            amounts = [abs(float(h['amount'])) for h in combined]
            if pattern['recurrence_type'] == 'monthly' and len(amounts) >= 3:
                existing['average_amount'] = statistics.mean(amounts[-3:])
            else:
                existing['average_amount'] = statistics.mean(amounts)

            days = [
                self._as_date(datetime.fromisoformat(h['date']) if isinstance(h['date'], str) else h['date']).day
                for h in combined
            ]
            existing['typical_day'] = int(statistics.median(days))
            existing['prediction_key'] = self._generate_prediction_key(
                existing['recipient'], existing['category'], existing['recurrence_type']
            )

        for pattern in merged.values():
            pattern.pop('_source_count', None)

        return list(merged.values())
    
    def _group_transactions(self, transactions: List[Dict[str, Any]]) -> Dict[Tuple, List[Dict[str, Any]]]:
        """Group transactions by recipient, category, and type"""
        groups = defaultdict(list)
        
        for txn in transactions:
            # Parse date if string
            if isinstance(txn['date'], str):
                try:
                    date = datetime.fromisoformat(txn['date'].replace('Z', '+00:00'))
                except:
                    try:
                        date = datetime.strptime(txn['date'], '%Y-%m-%d')
                    except:
                        continue
            else:
                date = txn['date']
            
            # Create group key (normalized recipient merges quote/import variants)
            raw_recipient = txn.get('recipient', '').strip()
            if not raw_recipient:
                continue

            recipient = self._normalize_recipient(raw_recipient)
            category = txn.get('category', 'Uncategorized')
            txn_type = txn.get('type', 'expense')

            group_key = (recipient, category, txn_type)
            
            # Add transaction with parsed date
            txn_copy = txn.copy()
            txn_copy['date'] = date
            groups[group_key].append(txn_copy)
            
        return groups

    def _collapse_to_one_per_month(self, sorted_txns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Keep one transaction per calendar month (largest amount). Real bills appear once per month."""
        by_month = {}
        for txn in sorted_txns:
            d = txn['date']
            key = (d.year, d.month)
            if key not in by_month or abs(float(txn['amount'])) > abs(float(by_month[key]['amount'])):
                by_month[key] = txn
        return sorted(by_month.values(), key=lambda x: x['date'])

    def _detect_monthly_pattern(self, sorted_txns: List[Dict[str, Any]], group_key: Tuple) -> Dict[str, Any]:
        """Detect monthly recurring pattern (±3 days, wider for income)"""
        if len(sorted_txns) < self.MIN_OCCURRENCES_MONTHLY:
            return None

        _, _, txn_type = group_key
        window = self.MONTHLY_WINDOW_INCOME if txn_type == 'income' else self.MONTHLY_WINDOW
            
        # Check if transactions appear in consecutive or nearly consecutive months
        consecutive_count = 0
        last_date = None
        matching_transactions = []
        
        for txn in sorted_txns:
            date = self._as_date(txn['date'])
            
            if last_date is None:
                matching_transactions = [txn]
                last_date = date
                consecutive_count = 1
            else:
                # Calculate expected next month date
                if last_date.month == 12:
                    expected_month = 1
                    expected_year = last_date.year + 1
                else:
                    expected_month = last_date.month + 1
                    expected_year = last_date.year
                
                # Use same day-of-month, or last day if it doesn't exist
                try:
                    expected_date = date_class(expected_year, expected_month, last_date.day)
                except ValueError:
                    # Day doesn't exist in this month (e.g., Jan 31 -> Feb 31)
                    # Use last day of the month
                    if expected_month == 12:
                        next_month = 1
                        next_year = expected_year + 1
                    else:
                        next_month = expected_month + 1
                        next_year = expected_year
                    expected_date = (datetime(next_year, next_month, 1) - timedelta(days=1)).date()
                
                # Check if current transaction is within window of expected date
                days_diff = abs((date - expected_date).days)
                
                if days_diff <= window:
                    consecutive_count += 1
                    matching_transactions.append(txn)
                    last_date = date
                else:
                    # Check if enough months passed that this could be a continuation
                    months_diff = (date.year - last_date.year) * 12 + date.month - last_date.month
                    
                    if months_diff == 1:
                        # It's the next month but outside the window - reset
                        matching_transactions = [txn]
                        last_date = date
                        consecutive_count = 1
                    elif months_diff > 1:
                        # Gap in pattern, but could still match if we have enough already
                        if consecutive_count >= self.MIN_OCCURRENCES_MONTHLY:
                            break
                        # Reset and try again
                        matching_transactions = [txn]
                        last_date = date
                        consecutive_count = 1
        
        # If we found enough consecutive monthly transactions
        if consecutive_count >= self.MIN_OCCURRENCES_MONTHLY:
            return self._create_pattern_metadata(matching_transactions, group_key, 'monthly')
            
        return None
    
    def _detect_quarterly_pattern(self, sorted_txns: List[Dict[str, Any]], group_key: Tuple) -> Dict[str, Any]:
        """Detect quarterly recurring pattern (±5 days)"""
        if len(sorted_txns) < self.MIN_OCCURRENCES_QUARTERLY:
            return None
            
        matching_transactions = []
        
        # Check for ~3 month gaps between transactions
        for i in range(len(sorted_txns) - 1):
            current_date = sorted_txns[i]['date']
            next_date = sorted_txns[i + 1]['date']
            
            # Calculate months between
            months_diff = (next_date.year - current_date.year) * 12 + next_date.month - current_date.month
            
            # Check if approximately 3 months (must be exactly 3, allow ±0 for month calculation)
            # This is stricter - we want actual quarterly patterns
            if months_diff == 3:
                if not matching_transactions:
                    matching_transactions = [sorted_txns[i]]
                matching_transactions.append(sorted_txns[i + 1])
            elif matching_transactions and len(matching_transactions) >= self.MIN_OCCURRENCES_QUARTERLY:
                # Pattern broken, but we have enough
                break
            else:
                # Reset
                matching_transactions = []
        
        if len(matching_transactions) >= self.MIN_OCCURRENCES_QUARTERLY:
            return self._create_pattern_metadata(matching_transactions, group_key, 'quarterly')
            
        return None
    
    def _detect_yearly_pattern(self, sorted_txns: List[Dict[str, Any]], group_key: Tuple) -> Dict[str, Any]:
        """Detect yearly recurring pattern (±7 days)"""
        if len(sorted_txns) < self.MIN_OCCURRENCES_YEARLY:
            return None
            
        matching_transactions = []
        
        # Check for ~12 month gaps between transactions in the same month
        for i in range(len(sorted_txns) - 1):
            current_date = sorted_txns[i]['date']
            next_date = sorted_txns[i + 1]['date']
            
            # Calculate months between
            months_diff = (next_date.year - current_date.year) * 12 + next_date.month - current_date.month
            
            # Check if approximately 12 months (11-13 months range)
            if 11 <= months_diff <= 13:
                # Also check if days are similar (within window)
                days_diff = abs(next_date.day - current_date.day)
                if days_diff <= self.YEARLY_WINDOW:
                    if not matching_transactions:
                        matching_transactions = [sorted_txns[i]]
                    matching_transactions.append(sorted_txns[i + 1])
            elif matching_transactions and len(matching_transactions) >= self.MIN_OCCURRENCES_YEARLY:
                # Pattern broken, but we have enough
                break
            else:
                # Reset
                matching_transactions = []
        
        if len(matching_transactions) >= self.MIN_OCCURRENCES_YEARLY:
            return self._create_pattern_metadata(matching_transactions, group_key, 'yearly')
            
        return None
    
    def _create_pattern_metadata(self, transactions: List[Dict[str, Any]], 
                                  group_key: Tuple, recurrence_type: str) -> Dict[str, Any]:
        """Create pattern metadata from matching transactions"""
        recipient, category, txn_type = group_key
        is_income = txn_type == 'income'
        max_variability = self.MAX_VARIABILITY_INCOME if is_income else self.MAX_VARIABILITY
        max_day_spread = self.MAX_DAY_OF_MONTH_SPREAD_INCOME if is_income else self.MAX_DAY_OF_MONTH_SPREAD
        
        # For monthly patterns with lots of history, use rolling average of last 3 months
        # For other patterns, use all available data
        if recurrence_type == 'monthly' and len(transactions) >= 3:
            # Use last 3 transactions for more recent/accurate prediction
            recent_transactions = transactions[-3:]
            amounts = [abs(float(t['amount'])) for t in recent_transactions]
            avg_amount = statistics.mean(amounts)
        else:
            # Use all transactions for quarterly/yearly or when less than 3 data points
            amounts = [abs(float(t['amount'])) for t in transactions]
            avg_amount = statistics.mean(amounts)
        
        # Check variability using all amounts for consistency check
        all_amounts = [abs(float(t['amount'])) for t in transactions]
        if len(all_amounts) > 1:
            std_dev = statistics.stdev(all_amounts)
            variability = std_dev / statistics.mean(all_amounts) if statistics.mean(all_amounts) > 0 else 0
            
            # Skip if too variable
            if variability > max_variability:
                return None
        else:
            variability = 0
        
        days_of_month = [self._as_date(t['date']).day for t in transactions]
        if recurrence_type == 'monthly' and len(days_of_month) > 1:
            if max(days_of_month) - min(days_of_month) > max_day_spread:
                return None

        typical_day = int(statistics.median(days_of_month))

        # Calculate confidence based on consistency and number of occurrences
        confidence = self._calculate_confidence(transactions, variability)
        
        # Get currency from first transaction
        currency = transactions[0].get('currency', 'EUR')
        
        # Create prediction key
        prediction_key = self._generate_prediction_key(recipient, category, recurrence_type)
        
        # Build historical payment metadata (keep order oldest -> newest)
        historical_payments = [{
            'date': t['date'].isoformat(),
            'amount': float(t['amount']),
            'currency': t.get('currency', currency)
        } for t in transactions]
        
        return {
            'recipient': recipient,
            'category': category,
            'type': txn_type,
            'recurrence_type': recurrence_type,
            'average_amount': avg_amount,
            'typical_day': typical_day,
            'currency': currency,
            'confidence': confidence,
            'occurrences': len(transactions),
            'last_date': transactions[-1]['date'],
            'historical_payments': historical_payments,
            'prediction_key': prediction_key
        }
    
    def _calculate_confidence(self, transactions: List[Dict[str, Any]], variability: float) -> float:
        """Calculate confidence score for a pattern"""
        # Base confidence on number of occurrences
        occurrence_score = min(len(transactions) / 6, 1.0)  # Max out at 6 occurrences
        
        # Reduce confidence based on amount variability
        consistency_score = max(0, 1.0 - variability)
        
        # Combined confidence
        confidence = (occurrence_score * 0.6 + consistency_score * 0.4)
        
        return round(confidence, 2)
    
    def _generate_prediction_key(self, recipient: str, category: str, recurrence_type: str) -> str:
        """Generate unique prediction key"""
        key_string = f"{self._normalize_recipient(recipient).lower()}|{category}|{recurrence_type}"
        return hashlib.sha256(key_string.encode()).hexdigest()[:16]
    
    def generate_predictions_for_month(self, patterns: List[Dict[str, Any]],
                                       target_month: str,
                                       dismissed_predictions: Set[str],
                                       same_month_actuals: List[Dict[str, Any]] = None,
                                       overrides: Dict[str, Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        predictions = []
        overrides = overrides or {}

        try:
            target_year, target_month_num = map(int, target_month.split('-'))
        except:
            return predictions

        # Build (normalized recipient, category, type) set from transactions that already exist this month
        actual_keys = set()
        for t in (same_month_actuals or []):
            actual_keys.add(self._match_key(
                t.get('recipient') or '',
                t.get('category', ''),
                t.get('type', '')
            ))

        current_date = datetime.now()

        for pattern in patterns:
            # Skip dismissed predictions
            if pattern['prediction_key'] in dismissed_predictions:
                continue

            # Skip if an actual transaction with matching (recipient, category, type) exists this month
            pattern_key = self._match_key(pattern['recipient'], pattern['category'], pattern['type'])
            if pattern_key in actual_keys:
                continue

            override = overrides.get(pattern['prediction_key'])
            if override and override.get('enabled') is False:
                continue

            recurrence_type = (override.get('custom_recurrence_type') if override else None) or pattern['recurrence_type']

            # Check if pattern should predict for this month
            should_predict = False
            predicted_day = override['custom_day'] if override and override.get('custom_day') else pattern['typical_day']

            if recurrence_type == 'monthly':
                if not self.is_pattern_active(
                    {'last_date': pattern['last_date'], 'recurrence_type': recurrence_type},
                    current_date
                ):
                    continue

                should_predict = True

            elif recurrence_type == 'quarterly':
                last_date = self._parse_last_date(pattern['last_date'])

                if not self.is_pattern_active(
                    {'last_date': pattern['last_date'], 'recurrence_type': recurrence_type},
                    current_date
                ):
                    continue
                
                # Predict if ~3 months have passed and not overdue
                months_since = (target_year - last_date.year) * 12 + target_month_num - last_date.month
                if 2 <= months_since <= 4:
                    should_predict = True
                    
            elif recurrence_type == 'yearly':
                last_date = self._parse_last_date(pattern['last_date'])

                if not self.is_pattern_active(
                    {'last_date': pattern['last_date'], 'recurrence_type': recurrence_type},
                    current_date
                ):
                    continue
                
                # Predict if same month, year later, and not overdue
                years_since = target_year - last_date.year
                if target_month_num == last_date.month and years_since >= 1:
                    should_predict = True
            
            if should_predict:
                # Ensure day exists in target month
                try:
                    predicted_date = datetime(target_year, target_month_num, predicted_day)
                except ValueError:
                    # Day doesn't exist, use last day of month
                    if target_month_num == 12:
                        next_month = 1
                        next_year = target_year + 1
                    else:
                        next_month = target_month_num + 1
                        next_year = target_year
                    predicted_date = datetime(next_year, next_month, 1) - timedelta(days=1)
                
                # Create predicted transaction
                amount = override['custom_amount'] if override and override.get('custom_amount') is not None else pattern['average_amount']
                if pattern['type'] == 'expense':
                    amount = -abs(amount)
                else:
                    amount = abs(amount)

                # Create description based on pattern type
                if recurrence_type == 'monthly' and pattern['occurrences'] >= 3:
                    description = f"Predicted based on last 3 months (of {pattern['occurrences']} total payments)"
                else:
                    description = f"Predicted based on {pattern['occurrences']} past payments"
                if override:
                    description += " (customized)"

                prediction = {
                    'date': predicted_date.isoformat(),
                    'amount': amount,
                    'currency': pattern['currency'],
                    'type': pattern['type'],
                    'recipient': pattern['recipient'],
                    'description': description,
                    'category': pattern['category'],
                    'account': 'Predicted',
                    'is_predicted': True,
                    'prediction_key': pattern['prediction_key'],
                    'confidence': pattern['confidence'],
                    'recurrence_type': recurrence_type,
                    'based_on': pattern.get('historical_payments', [])
                }
                
                predictions.append(prediction)
        
        return predictions


def get_dismissed_predictions(db_cursor, tenant_id: str, target_month: str) -> Set[str]:
    """
    Get set of dismissed prediction keys for a given month.
    
    Args:
        db_cursor: Database cursor
        tenant_id: Tenant ID
        target_month: Target month in format 'YYYY-MM'
        
    Returns:
        Set of dismissed prediction keys
    """
    try:
        # Parse target month to get date
        target_year, target_month_num = map(int, target_month.split('-'))
        target_date = datetime(target_year, target_month_num, 1)
        
        # Query dismissed predictions that haven't expired yet
        query = """
            SELECT prediction_key 
            FROM prediction_dismissals 
            WHERE tenant_id = (SELECT id FROM tenants WHERE tenant_id = %s)
            AND (expires_at IS NULL OR expires_at >= %s)
        """
        
        db_cursor.execute(query, [tenant_id, target_date.date()])
        result = db_cursor.fetchall()
        
        return {row[0] for row in result}
    except Exception as e:
        print(f"Error fetching dismissed predictions: {e}")
        return set()


def get_overrides(db_cursor, tenant_id: str) -> Dict[str, Dict[str, Any]]:
    """
    Get user overrides for recurring payments, keyed by prediction_key.

    Returns:
        Dict mapping prediction_key to {enabled, custom_amount, custom_day, custom_recurrence_type}
    """
    try:
        db_cursor.execute("""
            SELECT prediction_key, enabled, custom_amount, custom_day, custom_recurrence_type
            FROM prediction_overrides
            WHERE tenant_id = (SELECT id FROM tenants WHERE tenant_id = %s)
        """, [tenant_id])
        overrides = {}
        for row in db_cursor.fetchall():
            overrides[row[0]] = {
                'enabled': row[1],
                'custom_amount': float(row[2]) if row[2] is not None else None,
                'custom_day': row[3],
                'custom_recurrence_type': row[4]
            }
        return overrides
    except Exception as e:
        print(f"Error fetching prediction overrides: {e}")
        return {}

