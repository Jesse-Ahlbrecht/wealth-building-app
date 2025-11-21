"""
Base Parser

Common functionality for all financial document parsers.
"""

import os
import json
from typing import Dict, List


def load_categories(filename: str) -> Dict:
    """Load category definitions from JSON file"""
    filepath = os.path.join(os.path.dirname(os.path.dirname(__file__)), filename)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Warning: {filename} not found. Using default categories.")
        return {}
    except json.JSONDecodeError as e:
        print(f"Error parsing {filename}: {e}. Using default categories.")
        return {}


class BaseParser:
    """Base class for all financial document parsers"""
    
    def __init__(self):
        self.transactions = []
        self.account_balances = {}
    
    def categorize_transaction(self, recipient: str, description: str, date: str = None, account: str = None) -> str:
        """
        Categorize transaction based on recipient and description.
        
        This is used during initial parsing of statements.
        Category overrides are stored in the database.
        """
        recipient = (recipient or '').strip()
        description = (description or '').strip()
        if date:
            date = date.split('T')[0] if 'T' in date else date
        else:
            date = ''
        account = account or ''
        text = f"{recipient} {description}".strip().lower()

        # Load categories
        spending_categories = load_categories('categories_spending.json')
        income_categories = load_categories('categories_income.json')
        internal_transfer_config = load_categories('categories_internal_transfer.json')

        # Check for initial setup transactions
        if internal_transfer_config and date and account:
            initial_setup_transactions = internal_transfer_config.get('initial_setup', [])
            for setup_transaction in initial_setup_transactions:
                if (setup_transaction.get('date') == date and
                    setup_transaction.get('account') == account and
                    setup_transaction.get('description', '').lower() in description.lower()):
                    return 'Internal Transfer'

        # Check for internal transfers
        if internal_transfer_config:
            transfer_keywords = internal_transfer_config.get('keywords', [])
            if any(keyword.lower() in text for keyword in transfer_keywords):
                return 'Internal Transfer'

            self_patterns = internal_transfer_config.get('self_transfer_patterns', [])
            if self_patterns:
                for pattern in self_patterns:
                    pattern_lower = pattern.lower()
                    recipient_lower = recipient.lower()
                    description_lower = description.lower() if description else ''

                    recipient_match = pattern_lower in recipient_lower
                    pattern_words = set(pattern_lower.split())
                    description_words = set(description_lower.split())
                    description_match = pattern_words.issubset(description_words) if description else False

                    if (recipient_match and description_match) or (recipient_match and (not description or len(description.strip()) < 10)):
                        return 'Internal Transfer'

        # Check spending categories
        for category, keywords in spending_categories.items():
            if any(keyword.lower() in text for keyword in keywords):
                return category

        # Check income categories
        for category, keywords in income_categories.items():
            if any(keyword.lower() in text for keyword in keywords):
                return category

        # Check for transfers
        transfer_keywords = ['überweisung', 'twint', 'paypal']
        exclude_keywords = ['apple'] + [kw.lower() for keywords in income_categories.values() for kw in keywords]

        if any(word in text for word in transfer_keywords) and not any(word in text for word in exclude_keywords):
            return 'Transfer'

        return 'Other'
