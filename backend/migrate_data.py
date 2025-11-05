#!/usr/bin/env python3
"""
Data migration script to move existing file-based data to PostgreSQL database
"""

import os
import glob
from database import get_wealth_database
from app import BankStatementParser

def migrate_bank_statements():
    """Migrate bank statement data to database"""
    print("=" * 60)
    print("Starting Bank Statement Data Migration")
    print("=" * 60)

    wealth_db = get_wealth_database()
    parser = BankStatementParser()

    tenant_id = 'default'

    # Define base data directory
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    bank_statements_dir = os.path.join(data_dir, 'bank_statements')

    # Account type mapping
    account_type_map = {
        'DKB Girokonto': ('checking', 'DKB', 'EUR'),
        'DKB Tagesgeld': ('savings', 'DKB', 'EUR'),
        'YUH': ('checking', 'YUH', 'CHF'),
    }

    # Track created accounts
    created_accounts = {}
    
    # Track statistics
    stats = {
        'accounts_created': 0,
        'transactions_imported': 0,
        'transactions_skipped': 0
    }

    # Parse DKB bank statements
    print("\n📁 Processing DKB bank statements...")
    dkb_folder = os.path.join(bank_statements_dir, 'dkb')
    if os.path.exists(dkb_folder):
        dkb_files = glob.glob(os.path.join(dkb_folder, '*.csv')) + glob.glob(os.path.join(dkb_folder, '*.CSV'))
        print(f"   Found {len(dkb_files)} DKB files")
        
        for dkb_file in dkb_files:
            print(f"   📄 Parsing {os.path.basename(dkb_file)}...")
            try:
                transactions = parser.parse_dkb(dkb_file)
                print(f"      ✓ Parsed {len(transactions)} transactions")
                
                # Process transactions
                for trans in transactions:
                    account_name = trans['account']
                    
                    # Create account if it doesn't exist
                    if account_name not in created_accounts:
                        account_type, institution, currency = account_type_map.get(
                            account_name, ('checking', 'DKB', 'EUR')
                        )
                        
                        # Get balance from parser if available
                        balance = 0
                        if account_name in parser.account_balances:
                            balance = parser.account_balances[account_name]['balance']
                        
                        try:
                            account = wealth_db.create_account(tenant_id, {
                                'name': account_name,
                                'type': account_type,
                                'balance': balance,
                                'currency': currency,
                                'institution': institution
                            })
                            created_accounts[account_name] = account['id']
                            stats['accounts_created'] += 1
                            print(f"      ✓ Created account: {account_name} (balance: {balance} {currency})")
                        except Exception as e:
                            print(f"      ⚠ Error creating account {account_name}: {e}")
                            continue
                    
                    # Create transaction
                    account_id = created_accounts[account_name]
                    try:
                        transaction_data = {
                            'date': trans['date'],
                            'amount': abs(trans['amount']),
                            'currency': trans['currency'],
                            'type': trans['type'],
                            'description': trans['description'],
                            'recipient': trans['recipient'],
                            'category': trans.get('category', 'Uncategorized')
                        }
                        
                        # Try to create transaction (will skip if duplicate)
                        result = wealth_db.create_transaction(tenant_id, account_id, transaction_data)
                        if result:
                            stats['transactions_imported'] += 1
                        else:
                            stats['transactions_skipped'] += 1
                    except Exception as e:
                        # If error is about duplicate, that's okay
                        if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                            stats['transactions_skipped'] += 1
                        else:
                            print(f"      ⚠ Error creating transaction: {e}")
                            
            except Exception as e:
                print(f"      ✗ Error parsing {os.path.basename(dkb_file)}: {e}")
    else:
        print(f"   ⚠ DKB folder not found: {dkb_folder}")

    # Parse YUH bank statements
    print("\n📁 Processing YUH bank statements...")
    yuh_folder = os.path.join(bank_statements_dir, 'yuh')
    if os.path.exists(yuh_folder):
        # Handle URL-encoded filenames
        all_files = os.listdir(yuh_folder)
        yuh_files = [os.path.join(yuh_folder, f) for f in all_files if f.lower().endswith('.csv')]
        print(f"   Found {len(yuh_files)} YUH files")
        
        for yuh_file in yuh_files:
            print(f"   📄 Parsing {os.path.basename(yuh_file)}...")
            try:
                transactions = parser.parse_yuh(yuh_file)
                print(f"      ✓ Parsed {len(transactions)} transactions")
                
                # Process transactions
                for trans in transactions:
                    account_name = trans['account']
                    
                    # Create account if it doesn't exist
                    if account_name not in created_accounts:
                        account_type, institution, currency = account_type_map.get(
                            account_name, ('checking', 'YUH', 'CHF')
                        )
                        
                        # Get balance from parser if available
                        balance = 0
                        if account_name in parser.account_balances:
                            balance = parser.account_balances[account_name]['balance']
                        
                        try:
                            account = wealth_db.create_account(tenant_id, {
                                'name': account_name,
                                'type': account_type,
                                'balance': balance,
                                'currency': currency,
                                'institution': institution
                            })
                            created_accounts[account_name] = account['id']
                            stats['accounts_created'] += 1
                            print(f"      ✓ Created account: {account_name} (balance: {balance} {currency})")
                        except Exception as e:
                            print(f"      ⚠ Error creating account {account_name}: {e}")
                            continue
                    
                    # Create transaction
                    account_id = created_accounts[account_name]
                    try:
                        transaction_data = {
                            'date': trans['date'],
                            'amount': abs(trans['amount']),
                            'currency': trans['currency'],
                            'type': trans['type'],
                            'description': trans['description'],
                            'recipient': trans['recipient'],
                            'category': trans.get('category', 'Uncategorized')
                        }
                        
                        # Try to create transaction (will skip if duplicate)
                        result = wealth_db.create_transaction(tenant_id, account_id, transaction_data)
                        if result:
                            stats['transactions_imported'] += 1
                        else:
                            stats['transactions_skipped'] += 1
                    except Exception as e:
                        # If error is about duplicate, that's okay
                        if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                            stats['transactions_skipped'] += 1
                        else:
                            print(f"      ⚠ Error creating transaction: {e}")
                            
            except Exception as e:
                print(f"      ✗ Error parsing {os.path.basename(yuh_file)}: {e}")
    else:
        print(f"   ⚠ YUH folder not found: {yuh_folder}")

    # Print summary
    print("\n" + "=" * 60)
    print("Migration Summary")
    print("=" * 60)
    print(f"✓ Accounts created:      {stats['accounts_created']}")
    print(f"✓ Transactions imported: {stats['transactions_imported']}")
    print(f"⊘ Transactions skipped:  {stats['transactions_skipped']} (duplicates)")
    print("=" * 60)
    print("\n✅ Data migration completed!")

if __name__ == '__main__':
    migrate_bank_statements()
