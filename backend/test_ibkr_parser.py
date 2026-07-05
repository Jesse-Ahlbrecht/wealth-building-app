import os
import unittest
from collections import Counter

from parsers.broker_parser import IBKRParser
from parsers.document_detector import detect_document_type, detect_document_type_from_content


class IBKRParserTests(unittest.TestCase):
    def setUp(self):
        self.fixture_path = os.path.join(
            os.path.dirname(__file__),
            'test_data',
            'ibkr_activity_sample.csv',
        )
        self.parser = IBKRParser()

    def test_parse_trades_deposits_and_forex(self):
        result = self.parser.parse(self.fixture_path)
        transactions = result['transactions']
        holdings = result['holdings']
        activity = Counter(t['activity_type'] for t in transactions)

        self.assertEqual(activity['trade'], 11)
        self.assertEqual(activity['forex'], 41)
        self.assertEqual(activity['cash'], 10)
        self.assertGreaterEqual(len(holdings), 1)

        deposit = next(t for t in transactions if t['type'] == 'deposit')
        self.assertEqual(deposit['amount'], 1000.0)
        self.assertEqual(deposit['currency'], 'CHF')
        self.assertEqual(deposit['category'], 'Internal Transfer')

        disbursement = next(
            t for t in transactions
            if t.get('amount') == 7000.0 and 'disbursement initiated by' in (t.get('security') or '').lower()
        )
        self.assertEqual(disbursement['type'], 'deposit')
        self.assertEqual(disbursement['currency'], 'EUR')

        goog = next(h for h in holdings if h['symbol'] == 'GOOG')
        self.assertGreater(goog['shares'], 0)

    def test_detect_document_type_from_content(self):
        with open(self.fixture_path, 'rb') as handle:
            content = handle.read()
        detected = detect_document_type_from_content(content, 'Wealth_App_Activity-3.csv')
        self.assertEqual(detected, 'broker_ibkr_csv')

    def test_detect_document_type_from_filename(self):
        detected = detect_document_type('Wealth_App_Activity-3.csv')
        self.assertEqual(detected, 'broker_ibkr_csv')


if __name__ == '__main__':
    unittest.main()
