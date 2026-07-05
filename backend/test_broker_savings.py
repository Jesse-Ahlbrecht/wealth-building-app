import unittest

from services.broker_savings import build_broker_monthly_savings, merge_broker_savings_into_summary


class BrokerSavingsTest(unittest.TestCase):
    def test_builds_investment_and_cash_categories(self):
        transactions = [
            {
                'account': 'Interactive Brokers',
                'date': '2026-03-15',
                'type': 'buy',
                'amount': -500,
                'currency': 'EUR',
                'security': 'VWCE',
                'symbol': 'VWCE',
                'shares': 10,
            },
            {
                'account': 'Interactive Brokers',
                'date': '2026-03-10',
                'type': 'deposit',
                'amount': 1000,
                'currency': 'EUR',
                'security': 'Deposit',
                'category': 'Internal Transfer',
            },
        ]

        by_month = build_broker_monthly_savings(transactions)

        self.assertIn('2026-03', by_month)
        self.assertEqual(by_month['2026-03']['savings_categories']['Interactive Brokers Investments'], 500)
        self.assertNotIn('Interactive Brokers Cash', by_month['2026-03']['savings_categories'])

    def test_skips_internal_transfer_forex(self):
        transactions = [{
            'account': 'Interactive Brokers',
            'date': '2026-03-12',
            'type': 'forex',
            'amount': 100,
            'currency': 'CHF',
            'security': 'EUR.CHF',
            'category': 'Internal Transfer',
        }]
        by_month = build_broker_monthly_savings(transactions)
        self.assertEqual(by_month, {})

    def test_merge_into_summary(self):
        summary = [{
            'month': '2026-03',
            'savingsCategories': {},
            'savingsTransactions': {},
            'savingsMovementTotal': 0,
        }]
        transactions = [{
            'account': 'Interactive Brokers',
            'date': '2026-03-15',
            'type': 'buy',
            'amount': -200,
            'currency': 'EUR',
            'symbol': 'VWCE',
            'shares': 2,
        }]

        merged = merge_broker_savings_into_summary(summary, transactions)

        self.assertEqual(merged[0]['savingsCategories']['Interactive Brokers Investments'], 200)
        self.assertEqual(merged[0]['savingsMovementTotal'], 200)


if __name__ == '__main__':
    unittest.main()
