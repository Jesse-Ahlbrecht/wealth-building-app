"""
Recurring Payment Prediction Service

Analyzes historical transactions to detect recurring patterns and predict future payments.
Supports monthly, quarterly, and yearly recurrence patterns.
"""

from collections import defaultdict
from datetime import datetime, timedelta
from typing import List, Dict, Any, Set, Tuple
import hashlib
import statistics


class RecurringPatternDetector:
    """Detects recurring payment patterns from transaction history"""
    
    # Pattern detection windows (days tolerance)
    MONTHLY_WINDOW = 3
    QUARTERLY_WINDOW = 5
    YEARLY_WINDOW = 7
    
    # Minimum occurrences to establish a pattern
    MIN_OCCURRENCES_MONTHLY = 2
    MIN_OCCURRENCES_QUARTERLY = 3  # Need more data for quarterly
    MIN_OCCURRENCES_YEARLY = 2
    
    # Variability threshold (std dev as % of mean)
    MAX_VARIABILITY = 0.30
    
    def __init__(self):
        self.patterns = []
        
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
        
        print(f"🔍 Pattern detection: Analyzing {len(filtered_transactions)} transactions")
        
        # Group transactions by (recipient, category, type)
        groups = self._group_transactions(filtered_transactions)
        
        print(f"🔍 Found {len(groups)} unique transaction groups")
        
        patterns = []
        for group_key, group_transactions in groups.items():
            # Need at least minimum occurrences to detect a pattern
            if len(group_transactions) < self.MIN_OCCURRENCES_MONTHLY:
                continue
                
            # Sort by date
            sorted_txns = sorted(group_transactions, key=lambda x: x['date'])
            
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
                
        return patterns
    
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
            
            # Create group key
            recipient = txn.get('recipient', '').strip()
            category = txn.get('category', 'Uncategorized')
            txn_type = txn.get('type', 'expense')
            
            # Skip empty recipients
            if not recipient:
                continue
                
            group_key = (recipient, category, txn_type)
            
            # Add transaction with parsed date
            txn_copy = txn.copy()
            txn_copy['date'] = date
            groups[group_key].append(txn_copy)
            
        return groups
    
    def _detect_monthly_pattern(self, sorted_txns: List[Dict[str, Any]], group_key: Tuple) -> Dict[str, Any]:
        """Detect monthly recurring pattern (±3 days)"""
        if len(sorted_txns) < self.MIN_OCCURRENCES_MONTHLY:
            return None
            
        # Check if transactions appear in consecutive or nearly consecutive months
        consecutive_count = 0
        last_date = None
        matching_transactions = []
        
        for txn in sorted_txns:
            date = txn['date']
            
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
                    expected_date = datetime(expected_year, expected_month, last_date.day)
                except ValueError:
                    # Day doesn't exist in this month (e.g., Jan 31 -> Feb 31)
                    # Use last day of the month
                    if expected_month == 12:
                        next_month = 1
                        next_year = expected_year + 1
                    else:
                        next_month = expected_month + 1
                        next_year = expected_year
                    expected_date = datetime(next_year, next_month, 1) - timedelta(days=1)
                
                # Check if current transaction is within window of expected date
                days_diff = abs((date - expected_date).days)
                
                if days_diff <= self.MONTHLY_WINDOW:
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
        
        # For monthly patterns with lots of history, use rolling average of last 3 months
        # For other patterns, use all available data
        if recurrence_type == 'monthly' and len(transactions) >= 3:
            # Use last 3 transactions for more recent/accurate prediction
            recent_transactions = transactions[-3:]
            amounts = [abs(float(t['amount'])) for t in recent_transactions]
            avg_amount = statistics.mean(amounts)
            print(f"  📊 Monthly pattern for {recipient}: Using last 3 months average: {avg_amount:.2f}")
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
            if variability > self.MAX_VARIABILITY:
                return None
        else:
            variability = 0
        
        # Calculate typical day of month
        days_of_month = [t['date'].day for t in transactions]
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
            'historical_dates': [t['date'].isoformat() for t in transactions],
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
        key_string = f"{recipient}|{category}|{recurrence_type}"
        return hashlib.sha256(key_string.encode()).hexdigest()[:16]
    
    def generate_predictions_for_month(self, patterns: List[Dict[str, Any]], 
                                       target_month: str,
                                       dismissed_predictions: Set[str]) -> List[Dict[str, Any]]:
        """
        Generate predicted transactions for a specific month.
        
        Args:
            patterns: List of detected patterns
            target_month: Month in format 'YYYY-MM'
            dismissed_predictions: Set of prediction_keys that have been dismissed
            
        Returns:
            List of predicted transactions
        """
        predictions = []
        
        # Parse target month
        try:
            target_year, target_month_num = map(int, target_month.split('-'))
            target_date = datetime(target_year, target_month_num, 1)
        except:
            return predictions
        
        # Get current date for checking if patterns have stopped
        current_date = datetime.now()
        
        for pattern in patterns:
            # Skip dismissed predictions
            if pattern['prediction_key'] in dismissed_predictions:
                continue
            
            # Check if pattern should predict for this month
            should_predict = False
            predicted_day = pattern['typical_day']
            
            if pattern['recurrence_type'] == 'monthly':
                # Check if the pattern has stopped (missed last expected payment)
                last_date = pattern['last_date']
                if isinstance(last_date, str):
                    last_date = datetime.fromisoformat(last_date)
                
                # Calculate expected next payment date (one month after last payment)
                if last_date.month == 12:
                    expected_month = 1
                    expected_year = last_date.year + 1
                else:
                    expected_month = last_date.month + 1
                    expected_year = last_date.year
                
                # Use same day-of-month, or last day if it doesn't exist
                try:
                    expected_date = datetime(expected_year, expected_month, last_date.day)
                except ValueError:
                    # Day doesn't exist in this month (e.g., Jan 31 -> Feb 31)
                    if expected_month == 12:
                        next_month = 1
                        next_year = expected_year + 1
                    else:
                        next_month = expected_month + 1
                        next_year = expected_year
                    expected_date = datetime(next_year, next_month, 1) - timedelta(days=1)
                
                # Check if we're more than 1 week past the expected date
                days_overdue = (current_date - expected_date).days
                
                if days_overdue > 7:
                    # Payment is more than a week overdue - pattern has likely stopped
                    print(f"  ⏸️  Skipping prediction for {pattern['recipient']}: Payment is {days_overdue} days overdue (expected {expected_date.strftime('%Y-%m-%d')})")
                    continue
                
                # Only predict if we haven't passed the expected date by more than a week
                should_predict = True
                
            elif pattern['recurrence_type'] == 'quarterly':
                # Check if this month is ~3 months after last occurrence
                last_date = pattern['last_date']
                if isinstance(last_date, str):
                    last_date = datetime.fromisoformat(last_date)
                
                # Calculate expected next payment date (3 months after last payment)
                expected_month = last_date.month + 3
                expected_year = last_date.year
                while expected_month > 12:
                    expected_month -= 12
                    expected_year += 1
                
                # Use same day-of-month, or last day if it doesn't exist
                try:
                    expected_date = datetime(expected_year, expected_month, last_date.day)
                except ValueError:
                    # Day doesn't exist in this month
                    if expected_month == 12:
                        next_month = 1
                        next_year = expected_year + 1
                    else:
                        next_month = expected_month + 1
                        next_year = expected_year
                    expected_date = datetime(next_year, next_month, 1) - timedelta(days=1)
                
                # Check if we're more than 1 week past the expected date
                days_overdue = (current_date - expected_date).days
                
                if days_overdue > 7:
                    # Payment is more than a week overdue - pattern has likely stopped
                    print(f"  ⏸️  Skipping quarterly prediction for {pattern['recipient']}: Payment is {days_overdue} days overdue (expected {expected_date.strftime('%Y-%m-%d')})")
                    continue
                
                # Predict if ~3 months have passed and not overdue
                months_since = (target_year - last_date.year) * 12 + target_month_num - last_date.month
                if 2 <= months_since <= 4:
                    should_predict = True
                    
            elif pattern['recurrence_type'] == 'yearly':
                # Check if this month matches the historical month
                last_date = pattern['last_date']
                if isinstance(last_date, str):
                    last_date = datetime.fromisoformat(last_date)
                
                # Calculate expected next payment date (1 year after last payment)
                expected_year = last_date.year + 1
                expected_month = last_date.month
                
                # Use same day-of-month, or last day if it doesn't exist (Feb 29 edge case)
                try:
                    expected_date = datetime(expected_year, expected_month, last_date.day)
                except ValueError:
                    # Day doesn't exist (e.g., Feb 29 in non-leap year)
                    expected_date = datetime(expected_year, expected_month, 28)
                
                # Check if we're more than 1 week past the expected date
                days_overdue = (current_date - expected_date).days
                
                if days_overdue > 7:
                    # Payment is more than a week overdue - pattern has likely stopped
                    print(f"  ⏸️  Skipping yearly prediction for {pattern['recipient']}: Payment is {days_overdue} days overdue (expected {expected_date.strftime('%Y-%m-%d')})")
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
                amount = pattern['average_amount']
                if pattern['type'] == 'expense':
                    amount = -abs(amount)
                else:
                    amount = abs(amount)
                
                # Create description based on pattern type
                if pattern['recurrence_type'] == 'monthly' and pattern['occurrences'] >= 3:
                    description = f"Predicted based on last 3 months (of {pattern['occurrences']} total payments)"
                else:
                    description = f"Predicted based on {pattern['occurrences']} past payments"
                
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
                    'recurrence_type': pattern['recurrence_type'],
                    'based_on': pattern.get('historical_payments', [
                        {'date': dt, 'amount': None, 'currency': pattern['currency']}
                        for dt in pattern.get('historical_dates', [])
                    ])
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

