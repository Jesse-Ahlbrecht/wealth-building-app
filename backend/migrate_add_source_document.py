#!/usr/bin/env python3
"""
Migration script to add source_document_id column to transactions table
"""
import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import get_database

def run_migration():
    """Add source_document_id column to transactions table"""
    db = get_database()
    
    print("Running migration: Add source_document_id to transactions...")
    
    with db.get_cursor() as cursor:
        # Add the column if it doesn't exist
        cursor.execute("""
            ALTER TABLE transactions 
            ADD COLUMN IF NOT EXISTS source_document_id INTEGER;
        """)
        
        # Add foreign key constraint
        cursor.execute("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'transactions_source_document_fkey'
                ) THEN
                    ALTER TABLE transactions
                    ADD CONSTRAINT transactions_source_document_fkey
                    FOREIGN KEY (source_document_id) 
                    REFERENCES file_attachments(id) 
                    ON DELETE CASCADE;
                END IF;
            END $$;
        """)
        
        # Create index
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_transactions_source_document 
            ON transactions(source_document_id);
        """)
        
        print("✓ Migration completed successfully!")
        print("  - Added source_document_id column")
        print("  - Added foreign key constraint (CASCADE on delete)")
        print("  - Created index for faster lookups")

if __name__ == '__main__':
    try:
        run_migration()
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

