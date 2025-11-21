-- Fix documents table schema by adding missing columns
-- This ensures all required columns exist for document operations

-- First, fix the document_status enum to support both old and new values
DO $$
BEGIN
  -- Check if document_status enum exists
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status') THEN
    -- Try to add new values to existing enum (they might already exist)
    BEGIN
      -- Add 'active' if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'document_status' AND e.enumlabel = 'active'
      ) THEN
        ALTER TYPE document_status ADD VALUE 'active';
        RAISE NOTICE 'Added "active" to document_status enum';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not add "active" value: %', SQLERRM;
    END;
    
    BEGIN
      -- Add 'archived' if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'document_status' AND e.enumlabel = 'archived'
      ) THEN
        ALTER TYPE document_status ADD VALUE 'archived';
        RAISE NOTICE 'Added "archived" to document_status enum';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not add "archived" value: %', SQLERRM;
    END;
    
    BEGIN
      -- Add 'deleted' if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'document_status' AND e.enumlabel = 'deleted'
      ) THEN
        ALTER TYPE document_status ADD VALUE 'deleted';
        RAISE NOTICE 'Added "deleted" to document_status enum';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not add "deleted" value: %', SQLERRM;
    END;
  ELSE
    -- Create the enum with all values
    CREATE TYPE document_status AS ENUM ('processing', 'ready', 'error', 'active', 'archived', 'deleted');
    RAISE NOTICE 'Created document_status enum with all values';
  END IF;
END $$;

-- Add missing columns to documents table
ALTER TABLE public.documents 
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS publication_date date,
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS municipality text,
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS url text;

-- Add CHECK constraint for classification if it doesn't exist
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_classification_check' 
    AND table_name = 'documents'
  ) THEN
    ALTER TABLE public.documents DROP CONSTRAINT documents_classification_check;
  END IF;
  
  -- Add the constraint
  ALTER TABLE public.documents 
  ADD CONSTRAINT documents_classification_check 
  CHECK (classification IN ('public', 'internal', 'confidential'));
EXCEPTION 
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add classification constraint: %', SQLERRM;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON public.documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_publication_date ON public.documents(publication_date);
CREATE INDEX IF NOT EXISTS idx_documents_domain ON public.documents(domain);
CREATE INDEX IF NOT EXISTS idx_documents_municipality ON public.documents(municipality);
CREATE INDEX IF NOT EXISTS idx_documents_classification ON public.documents(classification);
CREATE INDEX IF NOT EXISTS idx_documents_url ON public.documents(url);

-- Populate tenant_id from workspace.space_id for existing documents
UPDATE public.documents d
SET tenant_id = w.space_id
FROM public.workspaces w
WHERE d.workspace_id = w.id
AND d.tenant_id IS NULL;

-- Set default classification for existing documents if NULL
UPDATE public.documents
SET classification = 'internal'
WHERE classification IS NULL;

-- Ensure status column exists and uses the correct type
DO $$
BEGIN
  -- Check if status column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'status'
  ) THEN
    -- Add status column with document_status enum type
    ALTER TABLE public.documents 
    ADD COLUMN status document_status NOT NULL DEFAULT 'active';
    RAISE NOTICE 'Added status column to documents table';
  END IF;
  
  -- Create index for status
  CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
  CREATE INDEX IF NOT EXISTS idx_documents_workspace_status ON public.documents(workspace_id, status);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Issue with status column: %', SQLERRM;
END $$;

-- Update any old status values to 'active'
UPDATE public.documents
SET status = 'active'
WHERE status IN ('ready', 'processing')
AND EXISTS (
  SELECT 1 FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'document_status' AND e.enumlabel = 'active'
);

-- Add foreign key for tenant_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_tenant_id_fkey' 
    AND table_name = 'documents'
  ) THEN
    ALTER TABLE public.documents
    ADD CONSTRAINT documents_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.spaces(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add tenant_id foreign key: %', SQLERRM;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.documents.tenant_id IS 'Tenant ID (space_id) for RLS performance (denormalized from workspace)';
COMMENT ON COLUMN public.documents.publication_date IS 'Publication date of the document';
COMMENT ON COLUMN public.documents.domain IS 'Domain tag for cross-domain organization';
COMMENT ON COLUMN public.documents.municipality IS 'Municipality associated with the document';
COMMENT ON COLUMN public.documents.classification IS 'Classification level: public, internal, or confidential';
COMMENT ON COLUMN public.documents.url IS 'URL or path to the document file';

-- Grant permissions to authenticated users
GRANT ALL ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;

-- Verify the setup
DO $$
DECLARE
  missing_columns text[] := ARRAY[]::text[];
BEGIN
  -- Check for classification column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'classification'
  ) THEN
    missing_columns := array_append(missing_columns, 'classification');
  ELSE
    RAISE NOTICE '✓ Column "classification" exists in documents table';
  END IF;
  
  -- Check for tenant_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'tenant_id'
  ) THEN
    missing_columns := array_append(missing_columns, 'tenant_id');
  ELSE
    RAISE NOTICE '✓ Column "tenant_id" exists in documents table';
  END IF;
  
  -- Check for url column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'url'
  ) THEN
    missing_columns := array_append(missing_columns, 'url');
  ELSE
    RAISE NOTICE '✓ Column "url" exists in documents table';
  END IF;
  
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE WARNING '✗ Missing columns in documents table: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE '✓ All required columns exist in documents table';
  END IF;
  
  -- Check constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_classification_check' 
    AND table_name = 'documents'
  ) THEN
    RAISE NOTICE '✓ Classification constraint is configured';
  ELSE
    RAISE WARNING '✗ Classification constraint is NOT configured';
  END IF;
END $$;

