-- Add status field to documents table
-- Status values: 'active' (default, included in RAG), 'archived' (excluded from RAG), 'deleted' (soft delete)

-- Create enum type for document status if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status') THEN
    CREATE TYPE document_status AS ENUM ('active', 'archived', 'deleted');
  END IF;
END $$;

-- Add status column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'status'
  ) THEN
    -- Add status column with default 'active'
    ALTER TABLE documents ADD COLUMN status document_status NOT NULL DEFAULT 'active';
    
    -- Create indexes for faster queries
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_documents_workspace_status ON documents(workspace_id, status);
  END IF;
END $$;

-- Update existing documents to 'active' status (in case any are NULL)
UPDATE documents SET status = 'active' WHERE status IS NULL;
