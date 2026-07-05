import unittest
from datetime import date

from services.ibkr_deposit_pairing import match_ibkr_deposits_to_bank_transfers


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

        pairs, unmatched_bank, unmatched_deposits = match_ibkr_deposits_to_bank_transfers(
            ibkr_transactions,
            bank_transactions,
        )
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0]['bank']['account'], 'YUH')
        self.assertIn('matched_bank_transfer', ibkr_transactions[0])
        self.assertEqual(len(unmatched_bank), 0)
        self.assertEqual(len(unmatched_deposits), 0)

    def test_one_to_one_matching(self):
        ibkr_transactions = [
            {'type': 'deposit', 'date': '2026-01-06', 'amount': 1000.0, 'currency': 'CHF', 'account': 'Interactive Brokers'},
            {'type': 'deposit', 'date': '2026-01-07', 'amount': 3500.0, 'currency': 'CHF', 'account': 'Interactive Brokers'},
        ]
        bank_transactions = [
            {
                'category': 'Internal Transfer',
                'recipient': 'Interactive Brokers LLC',
                'description': '',
                'transaction_date': date(2026, 1, 6),
                'amount': 1000.0,
                'currency': 'CHF',
                'account_name': 'YUH',
                'transaction_hash': 'bank-1',
            },
            {
                'category': 'Internal Transfer',
                'recipient': 'Interactive Brokers LLC',
                'description': '',
                'transaction_date': date(2026, 1, 7),
                'amount': 3500.0,
                'currency': 'CHF',
                'account_name': 'YUH',
                'transaction_hash': 'bank-2',
            },
        ]

        pairs, _, _ = match_ibkr_deposits_to_bank_transfers(ibkr_transactions, bank_transactions)
        self.assertEqual(len(pairs), 2)
        self.assertEqual({pair['bank']['transaction_hash'] for pair in pairs}, {'bank-1', 'bank-2'})

    def test_matches_eur_disbursement_to_dkb_income(self):
        ibkr_transactions = [{
            'type': 'deposit',
            'date': '2026-06-15',
            'amount': 7000.0,
            'currency': 'EUR',
            'account': 'Interactive Brokers',
            'security': 'DISBURSEMENT INITIATED BY Jesse Lennard Ahlbrecht',
        }]
        bank_transactions = [{
            'category': 'Internal Transfer',
            'recipient': 'Jesse Lennard Ahlbrecht',
            'description': 'EREF:IBCD IBKRUS33XXX',
            'transaction_date': date(2026, 6, 16),
            'amount': 7000.0,
            'currency': 'EUR',
            'account_name': 'DKB Girokonto',
            'transaction_hash': 'dkb-eur-7k',
        }]

        pairs, unmatched_bank, unmatched_deposits = match_ibkr_deposits_to_bank_transfers(
            ibkr_transactions,
            bank_transactions,
        )
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0]['bank']['account'], 'DKB Girokonto')
        self.assertEqual(len(unmatched_bank), 0)
        self.assertEqual(len(unmatched_deposits), 0)


if __name__ == '__main__':
    unittest.main()
