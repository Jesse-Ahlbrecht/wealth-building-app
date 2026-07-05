#!/usr/bin/env python3
import argparse
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from database import get_wealth_database
from services.categorizer import TransactionCategorizer, clear_config_cache


def _parse_bank_fields(description: str):
    if not description or ' - ' not in description:
        return '', '', ''
    parts = description.split(' - ', 1)
    if len(parts) != 2:
        return '', '', ''
    bank_category, bank_subcategory = parts[0].strip(), parts[1].strip()
    return bank_category, bank_subcategory, 'amazon_visa'


def main():
    parser = argparse.ArgumentParser(description='Recategorize transactions labeled Other or Transfer')
    parser.add_argument('--tenant', default=os.environ.get('WEALTH_TENANT_ID', 'default'))
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    db = get_wealth_database()
    clear_config_cache()
    categorizer = TransactionCategorizer()
    tenant_db_id = db.set_tenant_context(args.tenant)
    owned_accounts = db.get_accounts(args.tenant)

    updated = 0
    still_other = 0
    skipped_override = 0
    unchanged = 0
    unmatched_counterparties = Counter()

    with db.db.get_cursor() as cursor:
        cursor.execute("""
            SELECT transaction_hash FROM category_overrides
            WHERE tenant_id = %s AND active = TRUE
        """, (tenant_db_id,))
        override_hashes = {row[0] for row in cursor.fetchall()}

        cursor.execute("""
            SELECT t.transaction_hash, t.category, t.transaction_type,
                   a.account_name,
                   decrypt_tenant_data(t.encrypted_recipient, %s) as recipient,
                   decrypt_tenant_data(t.encrypted_description, %s) as description
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id AND a.tenant_id = t.tenant_id
            WHERE t.tenant_id = %s AND t.category IN ('Other', 'Transfer')
            ORDER BY t.transaction_date DESC
        """, (tenant_db_id, tenant_db_id, tenant_db_id))
        rows = cursor.fetchall()

        for row in rows:
            transaction_hash, category, transaction_type, account_name, recipient, description = row
            if transaction_hash in override_hashes:
                skipped_override += 1
                continue

            bank_category, bank_subcategory, bank_source = _parse_bank_fields(description)
            result = categorizer.categorize_with_details(
                recipient=recipient or '',
                description=description or '',
                transaction_type=transaction_type or '',
                account=account_name or '',
                bank_category=bank_category,
                bank_subcategory=bank_subcategory,
                bank_source=bank_source,
                owned_accounts=owned_accounts,
            )

            if result.category == category:
                unchanged += 1
                if category == 'Other':
                    still_other += 1
                    label = (recipient or description or 'unknown').strip()
                    if label:
                        unmatched_counterparties[label[:80]] += 1
                continue

            if not args.dry_run:
                cursor.execute(
                    "UPDATE transactions SET category = %s WHERE tenant_id = %s AND transaction_hash = %s",
                    (result.category, tenant_db_id, transaction_hash),
                )
            updated += 1

    print({
        'updated': updated,
        'still_other': still_other,
        'unchanged': unchanged,
        'skipped_override': skipped_override,
        'dry_run': args.dry_run,
    })

    if unmatched_counterparties:
        print('\nTop unmatched counterparties:')
        for label, count in unmatched_counterparties.most_common(50):
            print(f'  {count:4d}  {label}')


if __name__ == '__main__':
    main()
