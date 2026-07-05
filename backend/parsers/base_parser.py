"""
Base Parser

Common functionality for all financial document parsers.
"""


class BaseParser:
    """Base class for all financial document parsers"""

    def __init__(self):
        self.transactions = []
        self.account_balances = {}
        self._categorizer = None

    def _get_categorizer(self):
        if self._categorizer is None:
            from services.categorizer import get_categorizer
            self._categorizer = get_categorizer()
        return self._categorizer

    def categorize_transaction(
        self,
        recipient: str,
        description: str,
        date: str = None,
        account: str = None,
        transaction_type: str = '',
        bank_category: str = '',
        bank_subcategory: str = '',
        bank_source: str = '',
    ) -> str:
        return self._get_categorizer().categorize_transaction(
            recipient=recipient,
            description=description,
            date=date,
            account=account,
            transaction_type=transaction_type,
            bank_category=bank_category,
            bank_subcategory=bank_subcategory,
            bank_source=bank_source,
        )
