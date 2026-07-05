#!/usr/bin/env python3
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from database import get_wealth_database
from services.transfer_pairing import apply_transfer_pairs


def main():
    parser = argparse.ArgumentParser(description='Mark matched cross-account transfer pairs as Internal Transfer')
    parser.add_argument('--tenant', default=os.environ.get('WEALTH_TENANT_ID', 'default'))
    args = parser.parse_args()

    db = get_wealth_database()
    result = apply_transfer_pairs(db, args.tenant)
    print(result)


if __name__ == '__main__':
    main()
