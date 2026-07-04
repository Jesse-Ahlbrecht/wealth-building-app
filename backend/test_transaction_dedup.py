import unittest

from database import WealthDatabase


class TransactionNormalizationTests(unittest.TestCase):
    def setUp(self):
        self.db = WealthDatabase()

    def _hash(self, account_id, **fields):
        return self.db._calculate_transaction_hash(account_id, fields)

    def test_amazon_order_reference_produces_same_hash(self):
        base = {
            'date': '2026-04-21',
            'amount': 73.87,
            'type': 'expense',
            'description': 'Handel und Geschäfte - Sonstige (Handel und Geschäfte)',
        }
        self.assertEqual(
            self._hash(8, recipient='AMAZON', **base),
            self._hash(8, recipient='AMAZON NZ3890DC4', **base),
        )

    def test_paypal_reference_ids_produce_different_hashes(self):
        base = {
            'date': '2025-09-10',
            'amount': 3.63,
            'type': 'expense',
            'recipient': 'PayPal Europe S.a.r.l. et Cie S.C.A 22-24 Boulevard Royal, 2449 Luxembourg',
        }
        first = {
            **base,
            'description': '1044726069411/PP.1921.PP/. LogPay Financial Services GmbH, Ihr Einkauf bei LogPay Financial Services GmbH',
        }
        second = {
            **base,
            'description': '1044726577514/PP.1921.PP/. LogPay Financial Services GmbH, Ihr Einkauf bei LogPay Financial Services GmbH',
        }
        self.assertNotEqual(self._hash(5, **first), self._hash(5, **second))

    def test_dedup_key_matches_for_format_variants(self):
        old = {
            'date': '2025-11-17',
            'amount': 12.90,
            'currency': 'CHF',
            'type': 'expense',
            'recipient': '"Coop"',
            'description': '"Coop" "Basel, CH"',
        }
        new = {
            'date': '2025-11-17',
            'amount': 12.90,
            'currency': 'CHF',
            'type': 'expense',
            'recipient': 'Coop',
            'description': 'Coop Basel, CH',
        }
        self.assertEqual(
            self.db.get_transaction_dedup_key(3, old),
            self.db.get_transaction_dedup_key(3, new),
        )
        self.assertEqual(self._hash(3, **old), self._hash(3, **new))

    def test_dedup_key_differs_for_distinct_paypal_charges(self):
        base = {
            'date': '2025-09-10',
            'amount': 3.63,
            'currency': 'EUR',
            'type': 'expense',
            'recipient': 'PayPal Europe',
        }
        first = {**base, 'description': '1044726069411/PP.1921.PP/. LogPay'}
        second = {**base, 'description': '1044726577514/PP.1921.PP/. LogPay'}
        self.assertNotEqual(
            self.db.get_transaction_dedup_key(5, first),
            self.db.get_transaction_dedup_key(5, second),
        )


class TransactionDedupIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.db = WealthDatabase()

    def test_create_transaction_skips_format_variant_duplicate(self):
        tenant_row = self._get_tenant_row()
        if not tenant_row:
            self.skipTest('No tenant available for integration test')

        tenant_id, tenant_db_id = tenant_row
        account_id = None
        try:
            account_id = self._create_test_account(tenant_db_id)

            first = {
                'date': '2020-01-15',
                'amount': 42.50,
                'currency': 'EUR',
                'type': 'expense',
                'recipient': '"Test Merchant"',
                'description': '"Test Merchant" "Berlin, DE"',
                'category': 'Uncategorized',
            }
            second = {
                **first,
                'recipient': 'Test Merchant',
                'description': 'Test Merchant Berlin, DE',
            }

            created = self.db.create_transaction(tenant_id, account_id, first)
            self.assertIsNotNone(created)

            duplicate = self.db.create_transaction(tenant_id, account_id, second)
            self.assertIsNone(duplicate)
        finally:
            if account_id is not None:
                self._cleanup_test_transactions(tenant_db_id, account_id)

    def _get_tenant_row(self):
        with self.db.db.get_cursor() as cursor:
            cursor.execute("SELECT tenant_id, id FROM tenants WHERE active = TRUE LIMIT 1")
            row = cursor.fetchone()
            if not row:
                return None
            return row[0], row[1]

    def _create_test_account(self, tenant_db_id):
        with self.db.db.get_cursor() as cursor:
            cursor.execute("""
                INSERT INTO accounts (tenant_id, account_name, account_type, balance, currency, key_version)
                VALUES (%s, %s, 'checking', 0, 'EUR', 'v1')
                RETURNING id
            """, [tenant_db_id, f'dedup-test-{tenant_db_id}'])
            return cursor.fetchone()[0]

    def _cleanup_test_transactions(self, tenant_db_id, account_id):
        with self.db.db.get_cursor() as cursor:
            cursor.execute(
                "DELETE FROM transactions WHERE tenant_id = %s AND account_id = %s",
                [tenant_db_id, account_id],
            )
            cursor.execute(
                "DELETE FROM accounts WHERE tenant_id = %s AND id = %s",
                [tenant_db_id, account_id],
            )


if __name__ == '__main__':
    unittest.main()
