"""
Parsers Package

Financial document parsers for bank statements, broker reports, and loan documents.
"""

from parsers.base_parser import BaseParser, load_categories
from parsers.bank_parser import DKBParser, YUHParser
from parsers.broker_parser import VIACParser, INGDiBaParser
from parsers.loan_parser import KfWParser
from parsers.document_detector import detect_document_type_from_content, detect_document_type

# Legacy compatibility: BankStatementParser wrapper
from parsers.bank_statement_parser import BankStatementParser

__all__ = [
    'BaseParser',
    'load_categories',
    'DKBParser',
    'YUHParser',
    'VIACParser',
    'INGDiBaParser',
    'KfWParser',
    'detect_document_type_from_content',
    'detect_document_type',
    'BankStatementParser',  # For backward compatibility
]
