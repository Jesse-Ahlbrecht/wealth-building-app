"""
Bank Statement Parser - Compatibility Wrapper

This module provides a unified BankStatementParser class for backward compatibility.
It delegates to the specialized parser classes (DKBParser, YUHParser, etc.).

For new code, prefer importing the specific parsers directly:
    from parsers.bank_parser import DKBParser, YUHParser
    from parsers.broker_parser import VIACParser, INGDiBaParser
    from parsers.loan_parser import KfWParser
"""

from parsers.base_parser import BaseParser
from parsers.bank_parser import DKBParser, YUHParser
from parsers.broker_parser import VIACParser, INGDiBaParser
from parsers.loan_parser import KfWParser


class BankStatementParser(BaseParser):
    """
    Unified parser for backward compatibility.
    
    This class delegates to specialized parsers while maintaining the original API.
    """
    
    def parse_dkb(self, filepath, account_name=None):
        """Parse DKB German bank statements"""
        parser = DKBParser()
        transactions = parser.parse(filepath, account_name)
        # Copy account balances to this instance
        self.account_balances.update(parser.account_balances)
        return transactions
    
    def parse_yuh(self, filepath):
        """Parse YUH Swiss bank statements"""
        parser = YUHParser()
        transactions = parser.parse(filepath)
        # Copy account balances to this instance
        self.account_balances.update(parser.account_balances)
        return transactions
    
    def parse_viac(self, filepath):
        """Parse VIAC broker statements"""
        parser = VIACParser()
        return parser.parse(filepath)
    
    def parse_ing_diba(self, filepath):
        """Parse ING DiBa broker depot overview"""
        parser = INGDiBaParser()
        return parser.parse(filepath)
    
    def parse_kfw(self, filepath):
        """Parse KfW student loan statements"""
        parser = KfWParser()
        return parser.parse(filepath)
    
    def _categorize_transaction(self, recipient, description, date=None, account=None):
        """
        Backward compatibility wrapper for categorize_transaction.
        Delegates to the base class method.
        """
        return self.categorize_transaction(recipient, description, date, account)
