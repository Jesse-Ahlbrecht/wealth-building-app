-- Migration: Add source_document_id column to transactions table
-- Run this script if your database doesn't have this column yet

-- Add the column if it doesn't exist
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS source_document_id INTEGER;

-- Add foreign key constraint if it doesn't exist
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

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_transactions_source_document 
ON transactions(source_document_id);

