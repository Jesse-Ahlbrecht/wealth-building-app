import unittest

from services.refund_pairing import allocate_refunds, merchant_refund_key


class RefundPairingTests(unittest.TestCase):
    def test_merchant_key_intimissimi(self):
        self.assertEqual(
            merchant_refund_key('S2P*Intimissimi', 'S2P*INTIMISSIMI, 0447554090'),
            'intimissimi',
        )

    def test_merchant_key_tavero_variants(self):
        self.assertEqual(merchant_refund_key('Tavero', 'TAVERO AG, BASEL'), 'tavero')
        self.assertEqual(merchant_refund_key('TAVERO AG', 'TAVERO AG, BASEL'), 'tavero')

    def test_tavero_partial_refund_same_day(self):
        transactions = [
            {
                'transaction_hash': 'exp-1',
                'transaction_date': '2026-06-18',
                'amount': 10.80,
                'currency': 'CHF',
                'transaction_type': 'expense',
                'category': 'Cafeteria',
                'recipient': 'Tavero',
                'description': 'TAVERO AG, BASEL',
            },
            {
                'transaction_hash': 'inc-1',
                'transaction_date': '2026-06-18',
                'amount': 3.00,
                'currency': 'CHF',
                'transaction_type': 'income',
                'category': 'Cafeteria',
                'recipient': 'TAVERO AG',
                'description': 'TAVERO AG, BASEL',
            },
        ]
        allocations, expense_refunded, income_refunded = allocate_refunds(transactions)
        self.assertEqual(len(allocations), 1)
        self.assertEqual(allocations[0]['amount'], 3.00)
        self.assertEqual(expense_refunded['exp-1'], 3.00)
        self.assertEqual(income_refunded['inc-1'], 3.00)

    def test_full_refund_match(self):
        transactions = [
            {
                'transaction_hash': 'exp-1',
                'transaction_date': '2026-06-15',
                'amount': 79.95,
                'currency': 'CHF',
                'transaction_type': 'expense',
                'category': 'Shopping',
                'recipient': 'Intimissimi',
            },
            {
                'transaction_hash': 'inc-1',
                'transaction_date': '2026-06-22',
                'amount': 79.95,
                'currency': 'CHF',
                'transaction_type': 'income',
                'category': 'Shopping',
                'recipient': 'S2P*Intimissimi',
            },
        ]
        allocations, expense_refunded, income_refunded = allocate_refunds(transactions)
        self.assertEqual(len(allocations), 1)
        self.assertEqual(allocations[0]['amount'], 79.95)
        self.assertEqual(expense_refunded['exp-1'], 79.95)
        self.assertEqual(income_refunded['inc-1'], 79.95)

    def test_partial_refund(self):
        transactions = [
            {
                'transaction_hash': 'exp-1',
                'transaction_date': '2026-06-01',
                'amount': 100.00,
                'currency': 'EUR',
                'transaction_type': 'expense',
                'category': 'Shopping',
                'recipient': 'Example Shop',
                'description': 'Example Shop order',
            },
            {
                'transaction_hash': 'inc-1',
                'transaction_date': '2026-06-10',
                'amount': 40.00,
                'currency': 'EUR',
                'transaction_type': 'income',
                'category': 'Shopping',
                'recipient': 'Example Shop',
                'description': 'Partial refund',
            },
        ]
        allocations, expense_refunded, income_refunded = allocate_refunds(transactions)
        self.assertEqual(len(allocations), 1)
        self.assertEqual(allocations[0]['amount'], 40.00)
        self.assertEqual(expense_refunded['exp-1'], 40.00)
        self.assertEqual(income_refunded['inc-1'], 40.00)

    def test_one_refund_covers_multiple_purchases_closest_first(self):
        transactions = [
            {
                'transaction_hash': 'exp-1',
                'transaction_date': '2026-06-01',
                'amount': 30.00,
                'currency': 'EUR',
                'transaction_type': 'expense',
                'category': 'Shopping',
                'recipient': 'Example Shop',
            },
            {
                'transaction_hash': 'exp-2',
                'transaction_date': '2026-06-05',
                'amount': 50.00,
                'currency': 'EUR',
                'transaction_type': 'expense',
                'category': 'Shopping',
                'recipient': 'Example Shop',
            },
            {
                'transaction_hash': 'inc-1',
                'transaction_date': '2026-06-12',
                'amount': 60.00,
                'currency': 'EUR',
                'transaction_type': 'income',
                'category': 'Shopping',
                'recipient': 'Example Shop',
            },
        ]
        allocations, expense_refunded, income_refunded = allocate_refunds(transactions)
        self.assertEqual(len(allocations), 2)
        self.assertEqual(expense_refunded['exp-2'], 50.00)
        self.assertEqual(expense_refunded['exp-1'], 10.00)
        self.assertEqual(income_refunded['inc-1'], 60.00)


if __name__ == '__main__':
    unittest.main()
