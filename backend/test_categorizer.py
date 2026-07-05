import unittest

from services.categorizer import TransactionCategorizer, clear_config_cache


class CategorizerTests(unittest.TestCase):
    def setUp(self):
        clear_config_cache()
        self.categorizer = TransactionCategorizer()

    def test_de_groceries(self):
        result = self.categorizer.categorize_with_details(
            recipient='REWE Markt GmbH',
            description='Lebensmitteleinkauf',
            transaction_type='expense',
        )
        self.assertEqual(result.category, 'Groceries')
        self.assertIn(result.stage, ('merchant_registry', 'keyword_rules'))

    def test_ch_groceries(self):
        result = self.categorizer.categorize_with_details(
            recipient='Coop',
            description='Basel, CH',
            transaction_type='expense',
        )
        self.assertEqual(result.category, 'Groceries')

    def test_dkb_bank_category(self):
        result = self.categorizer.categorize_with_details(
            recipient='Unknown Shop',
            description='Purchase',
            transaction_type='expense',
            bank_category='Lebensmittel',
            bank_source='dkb',
        )
        self.assertEqual(result.category, 'Groceries')
        self.assertEqual(result.stage, 'bank_category_map')

    def test_amazon_visa_bank_category(self):
        result = self.categorizer.categorize_with_details(
            recipient='Some Merchant',
            description='Handel und Geschäfte - Sonstige',
            transaction_type='expense',
            bank_category='Handel und Geschäfte',
            bank_subcategory='Sonstige',
            bank_source='amazon_visa',
        )
        self.assertEqual(result.category, 'Shopping')
        self.assertEqual(result.stage, 'bank_category_map')

    def test_internal_transfer(self):
        result = self.categorizer.categorize_with_details(
            recipient='Wise Payments Ltd',
            description='Transfer to savings',
            transaction_type='expense',
        )
        self.assertEqual(result.category, 'Internal Transfer')
        self.assertEqual(result.stage, 'internal_transfer')

    def test_income_scoping(self):
        result = self.categorizer.categorize_with_details(
            recipient='Employer GmbH',
            description='Gehalt November',
            transaction_type='income',
        )
        self.assertEqual(result.category, 'Salary')

    def test_expense_not_matched_by_income_keyword(self):
        result = self.categorizer.categorize_with_details(
            recipient='Random Store',
            description='gehaltshaftung artikel',
            transaction_type='expense',
        )
        self.assertNotEqual(result.category, 'Salary')

    def test_amazon_normalization(self):
        result = self.categorizer.categorize_with_details(
            recipient='AMZN Mktp DE*NZ3890DC4',
            description='Order',
            transaction_type='expense',
        )
        self.assertEqual(result.category, 'Shopping')

    def test_amazon_fresh_groceries(self):
        result = self.categorizer.categorize_with_details(
            recipient='Amazon Fresh',
            description='Grocery delivery',
            transaction_type='expense',
        )
        self.assertEqual(result.category, 'Groceries')

    def test_subscription(self):
        result = self.categorizer.categorize_with_details(
            recipient='Spotify AB',
            description='Premium subscription',
            transaction_type='expense',
        )
        self.assertEqual(result.category, 'Subscriptions')

    def test_vacation_booking(self):
        result = self.categorizer.categorize_with_details(
            recipient='Booking.com',
            description='Hotel Amsterdam',
            transaction_type='expense',
        )
        self.assertEqual(result.category, 'Vacation')
        self.assertEqual(result.stage, 'merchant_registry')

    def test_vacation_bank_category(self):
        result = self.categorizer.categorize_with_details(
            recipient='Hotel Example',
            description='Trip',
            transaction_type='expense',
            bank_category='Reisen',
            bank_source='dkb',
        )
        self.assertEqual(result.category, 'Vacation')
        self.assertEqual(result.stage, 'bank_category_map')

    def test_twint_unmatched_is_other(self):
        result = self.categorizer.categorize_with_details(
            recipient='John Doe',
            description='TWINT Zahlung',
            transaction_type='expense',
        )
        self.assertEqual(result.category, 'Other')

    def test_mullvad_subscription(self):
        result = self.categorizer.categorize_with_details(
            recipient='PAYPAL MULLVAD',
            description='Haus und Hausrat - Telefonie, Internet und Fernsehen',
            transaction_type='expense',
        )
        self.assertEqual(result.category, 'Subscriptions')

    def test_swisscard_internal_transfer_via_owned_accounts(self):
        owned_accounts = [
            {'account_name': 'YUH'},
            {'account_name': 'Swisscard 8711'},
        ]
        result = self.categorizer.categorize_with_details(
            recipient='Swisscard AECS GmbH',
            description='Überweisung an Swisscard AECS GmbH',
            account='YUH',
            transaction_type='expense',
            owned_accounts=owned_accounts,
        )
        self.assertEqual(result.category, 'Internal Transfer')
        self.assertEqual(result.stage, 'internal_transfer')

    def test_dkb_internal_transfer_via_owned_accounts(self):
        owned_accounts = [
            {'account_name': 'YUH'},
            {'account_name': 'DKB Girokonto'},
        ]
        result = self.categorizer.categorize_with_details(
            recipient='DKB AG',
            description='Überweisung an DKB',
            account='YUH',
            transaction_type='expense',
            owned_accounts=owned_accounts,
        )
        self.assertEqual(result.category, 'Internal Transfer')

    def test_unknown_is_other(self):
        result = self.categorizer.categorize_with_details(
            recipient='Obscure Vendor XYZ',
            description='Payment 12345',
            transaction_type='expense',
        )
        self.assertEqual(result.category, 'Other')
        self.assertEqual(result.stage, 'other')

    def test_salary_employer(self):
        result = self.categorizer.categorize_with_details(
            recipient='Datalynx AG',
            description='Payment',
            transaction_type='income',
        )
        self.assertEqual(result.category, 'Salary')


if __name__ == '__main__':
    unittest.main()
