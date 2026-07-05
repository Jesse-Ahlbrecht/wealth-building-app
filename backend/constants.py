"""
Application Constants

Centralized constants for document types, categories, and other application-wide values.
"""

DOCUMENT_TYPES = [
    {
        'key': 'bank_statement_dkb',
        'label': 'DKB Bank Statement',
        'category': 'bank',
        'description': 'CSV exports from Deutsche Kreditbank (DKB) Girokonto or Tagesgeld accounts.',
        'extensions': ['.csv'],
        'parser': 'parse_dkb',
        'sample_data_path': 'data/bank_statements/dkb'
    },
    {
        'key': 'bank_statement_yuh',
        'label': 'YUH Activity Export',
        'category': 'bank',
        'description': 'Activity exports from the YUH app stored as CSV files.',
        'extensions': ['.csv'],
        'parser': 'parse_yuh',
        'sample_data_path': 'data/bank_statements/yuh'
    },
    {
        'key': 'bank_statement_swisscard',
        'label': 'Swisscard Credit Card Export',
        'category': 'bank',
        'description': 'CSV exports from Swisscard credit cards.',
        'extensions': ['.csv'],
        'parser': 'parse_swisscard',
        'sample_data_path': 'data/bank_statements/swisscard'
    },
    {
        'key': 'broker_ibkr_csv',
        'label': 'Interactive Brokers Activity Statement',
        'category': 'broker',
        'description': 'Activity Flex Query CSV exports from Interactive Brokers. Enable Trades and Cash Transactions sections only.',
        'extensions': ['.csv'],
        'parser': 'parse_ibkr',
        'sample_data_path': 'data/depot_transactions/ibkr'
    },
    {
        'key': 'loan_kfw_pdf',
        'label': 'KfW Loan Statement',
        'category': 'loan',
        'description': 'KfW student loan account statements as PDF files.',
        'extensions': ['.pdf'],
        'parser': 'parse_kfw',
        'sample_data_path': 'data/credits/kfw'
    }
]

DOCUMENT_TYPE_LOOKUP = {doc['key']: doc for doc in DOCUMENT_TYPES}
BROKER_FILE_TYPES = [doc['key'] for doc in DOCUMENT_TYPES if doc['category'] == 'broker']

TRANSACTION_QUERY_LIMIT = 50000
