import unittest

from services.transfer_pairing import build_transfer_pair_details, find_transfer_pairs


class TransferPairingTests(unittest.TestCase):
    def test_pairs_expense_and_income_on_different_accounts(self):
        transactions = [
            {
                'transaction_hash': 'exp-1',
                'transaction_date': '2026-06-12',
                'amount': 1713.50,
                'currency': 'CHF',
                'transaction_type': 'expense',
                'account_name': 'YUH',
                'category': 'Other',
            },
            {
                'transaction_hash': 'inc-1',
                'transaction_date': '2026-06-12',
                'amount': 1713.50,
                'currency': 'CHF',
                'transaction_type': 'income',
                'account_name': 'Swisscard 9373',
                'category': 'Other',
            },
        ]
        pairs = find_transfer_pairs(transactions)
        self.assertEqual(pairs, [('exp-1', 'inc-1')])

    def test_ignores_same_account(self):
        transactions = [
            {
                'transaction_hash': 'exp-1',
                'transaction_date': '2026-06-12',
                'amount': 100,
                'currency': 'EUR',
                'transaction_type': 'expense',
                'account_name': 'YUH',
                'category': 'Other',
            },
            {
                'transaction_hash': 'inc-1',
                'transaction_date': '2026-06-12',
                'amount': 100,
                'currency': 'EUR',
                'transaction_type': 'income',
                'account_name': 'YUH',
                'category': 'Other',
            },
        ]
        self.assertEqual(find_transfer_pairs(transactions), [])

    def test_allows_nearby_dates(self):
        transactions = [
            {
                'transaction_hash': 'exp-1',
                'transaction_date': '2026-05-29',
                'amount': 2203.32,
                'currency': 'EUR',
                'transaction_type': 'expense',
                'account_name': 'DKB Girokonto',
                'category': 'Shopping',
            },
            {
                'transaction_hash': 'inc-1',
                'transaction_date': '2026-05-31',
                'amount': 2203.32,
                'currency': 'EUR',
                'transaction_type': 'income',
                'account_name': 'Amazon Visa 0494',
                'category': 'Other',
            },
        ]
        pairs = find_transfer_pairs(transactions, window_days=5)
        self.assertEqual(pairs, [('exp-1', 'inc-1')])

    def test_skips_overridden_hashes(self):
        transactions = [
            {
                'transaction_hash': 'exp-1',
                'transaction_date': '2026-06-12',
                'amount': 50,
                'currency': 'EUR',
                'transaction_type': 'expense',
                'account_name': 'YUH',
                'category': 'Other',
            },
            {
                'transaction_hash': 'inc-1',
                'transaction_date': '2026-06-12',
                'amount': 50,
                'currency': 'EUR',
                'transaction_type': 'income',
                'account_name': 'DKB Girokonto',
                'category': 'Other',
            },
        ]
        self.assertEqual(find_transfer_pairs(transactions, skip_hashes={'exp-1'}), [])


    def test_build_transfer_pair_details(self):
        transactions = [
            {
                'transaction_hash': 'exp-1',
                'transaction_date': '2026-06-12',
                'amount': 1713.50,
                'currency': 'CHF',
                'transaction_type': 'expense',
                'account_name': 'YUH',
                'category': 'Internal Transfer',
                'recipient': 'Swisscard AECS GmbH',
            },
            {
                'transaction_hash': 'inc-1',
                'transaction_date': '2026-06-12',
                'amount': 1713.50,
                'currency': 'CHF',
                'transaction_type': 'income',
                'account_name': 'Swisscard 9373',
                'category': 'Internal Transfer',
                'recipient': 'IHRE ZAHLUNG',
            },
        ]
        pairs = build_transfer_pair_details(transactions)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0]['outflow']['account'], 'YUH')
        self.assertEqual(pairs[0]['inflow']['account'], 'Swisscard 9373')
        self.assertEqual(pairs[0]['dayDiff'], 0)


if __name__ == '__main__':
    unittest.main()
