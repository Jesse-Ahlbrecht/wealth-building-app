#!/usr/bin/env python3
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from database import get_wealth_database


def main():
    tenant_id = os.environ.get('WEALTH_TENANT_ID', 'default')
    db = get_wealth_database()
    result = db.recategorize_by_counterparty_keywords(
        tenant_id=tenant_id,
        keywords=['interactive brokers', 'ibkr'],
        from_category='Investment Account Payment',
        to_category='Internal Transfer',
        remove_learned_rules=True,
    )
    print(f"Recategorized {result['updated_transactions']} transaction(s), removed {result['removed_rules']} learned rule(s)")


if __name__ == '__main__':
    main()
