import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))

from services.broker_service import _match_ibkr_deposits_to_bank_transfers


class IBKRMatchingTests(unittest.TestCase):
    def test_matches_deposit_to_bank_outflow(self):
        ibkr_transactions = [{
            'type': 'deposit',
            'date': '2026-06-09',
            'amount': 5000.0,
            'currency': 'CHF',
            'account': 'Interactive Brokers',
        }]
        bank_transactions = [{
            'category': 'Internal Transfer',
            'recipient': 'Interactive Brokers LLC',
            'description': 'Überweisung an Interactive Brokers LLC',
            'transaction_date': date(2026, 6, 9),
            'amount': -5000.0,
            'currency': 'CHF',
            'account_name': 'YUH',
            'transaction_hash': 'abc123',
        }]

        _match_ibkr_deposits_to_bank_transfers(ibkr_transactions, bank_transactions)
        self.assertIn('matched_bank_transfer', ibkr_transactions[0])
        self.assertEqual(ibkr_transactions[0]['matched_bank_transfer']['account'], 'YUH')


if __name__ == '__main__':
    unittest.main()
