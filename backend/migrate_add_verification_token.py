#!/usr/bin/env python3
"""
Migration script to add missing columns to users table if they don't exist
Adds: verification_token, email_verified, reset_token, reset_token_expires
"""

import os
from dotenv import load_dotenv
from database import get_database

load_dotenv()

def check_column_exists(cursor, table_name, column_name):
    """Check if a column exists in a table"""
    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = %s 
        AND column_name = %s
    """, (table_name, column_name))
    return cursor.fetchone() is not None

def migrate_add_missing_columns():
    """Add missing columns to users table"""
    db = get_database()
    
    print("=" * 60)
    print("Migration: Add missing columns to users table")
    print("=" * 60)
    
    columns_to_add = [
        ('verification_token', 'VARCHAR(255)'),
        ('email_verified', 'BOOLEAN DEFAULT FALSE'),
        ('reset_token', 'VARCHAR(255)'),
        ('reset_token_expires', 'TIMESTAMP WITH TIME ZONE'),
    ]
    
    try:
        with db.get_cursor() as cursor:
            added_count = 0
            skipped_count = 0
            
            for column_name, column_def in columns_to_add:
                if check_column_exists(cursor, 'users', column_name):
                    print(f"✓ Column '{column_name}' already exists in users table")
                    skipped_count += 1
                else:
                    print(f"Adding column '{column_name}' to users table...")
                    cursor.execute(f"""
                        ALTER TABLE users 
                        ADD COLUMN {column_name} {column_def}
                    """)
                    print(f"✓ Successfully added column '{column_name}' to users table")
                    added_count += 1
            
            print("\n" + "=" * 60)
            print(f"Migration Summary:")
            print(f"  ✓ Added: {added_count} columns")
            print(f"  ⊘ Skipped: {skipped_count} columns (already exist)")
            print("=" * 60)
            
            return True
            
    except Exception as e:
        print(f"✗ Error adding columns: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = migrate_add_missing_columns()
    if success:
        print("\n✅ Migration completed successfully!")
    else:
        print("\n❌ Migration failed!")
        exit(1)

