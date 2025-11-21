-- Ensure sources table exists and is properly configured
-- This script handles both scenarios:
-- 1. If connectors table exists, it migrates it to sources
-- 2. If neither exists, it creates sources from scratch

-- First, ensure the update_updated_at_column function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  -- Check if sources table already exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sources') THEN
    RAISE NOTICE 'Sources table already exists';
    
  -- Check if we need to migrate from connectors
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'connectors') THEN
    RAISE NOTICE 'Migrating connectors table to sources';
    
    -- Rename enum types if they exist
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connector_type') THEN
      ALTER TYPE connector_type RENAME TO source_type;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connector_status') THEN
      ALTER TYPE connector_status RENAME TO source_status;
    END IF;
    
    -- Rename table
    ALTER TABLE connectors RENAME TO sources;
    
    -- Rename columns in documents table if needed
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'documents' AND column_name = 'connector_id'
    ) THEN
      ALTER TABLE documents RENAME COLUMN connector_id TO source_id;
    END IF;
    
    -- Update foreign key constraint
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_connector_id_fkey') THEN
      ALTER TABLE documents DROP CONSTRAINT documents_connector_id_fkey;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_source_id_fkey') THEN
      ALTER TABLE documents 
      ADD CONSTRAINT documents_source_id_fkey 
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE;
    END IF;
    
    -- Update unique constraint
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_connector_id_external_id_key') THEN
      ALTER TABLE documents DROP CONSTRAINT documents_connector_id_external_id_key;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_source_id_external_id_key') THEN
      ALTER TABLE documents 
      ADD CONSTRAINT documents_source_id_external_id_key 
      UNIQUE (source_id, external_id);
    END IF;
    
    -- Rename indexes
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_connectors_workspace_id') THEN
      ALTER INDEX idx_connectors_workspace_id RENAME TO idx_sources_workspace_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_documents_connector_id') THEN
      ALTER INDEX idx_documents_connector_id RENAME TO idx_documents_source_id;
    END IF;
    
  ELSE
    -- Neither table exists, create sources from scratch
    RAISE NOTICE 'Creating sources table from scratch';
    
    -- Create enum types if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_type') THEN
      CREATE TYPE source_type AS ENUM ('google_drive', 'notion', 'confluence', 'sharepoint', 'dropbox', 'direct_upload', 'overheid_nl', 'workspace_generated');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_status') THEN
      CREATE TYPE source_status AS ENUM ('active', 'inactive', 'error');
    END IF;
    
    -- Create sources table
    CREATE TABLE public.sources (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
      name text NOT NULL,
      type source_type NOT NULL,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      status source_status NOT NULL DEFAULT 'active',
      last_sync_at timestamp with time zone,
      created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );
    
    -- Create index
    CREATE INDEX idx_sources_workspace_id ON public.sources(workspace_id);
    
    -- Update documents table to reference sources instead of connectors
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'documents' AND column_name = 'connector_id'
    ) THEN
      ALTER TABLE documents RENAME COLUMN connector_id TO source_id;
      
      -- Update foreign key constraint
      ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_connector_id_fkey;
      ALTER TABLE documents 
      ADD CONSTRAINT documents_source_id_fkey 
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE;
      
      -- Update unique constraint
      ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_connector_id_external_id_key;
      ALTER TABLE documents 
      ADD CONSTRAINT documents_source_id_external_id_key 
      UNIQUE (source_id, external_id);
      
      -- Rename index
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_documents_connector_id') THEN
        ALTER INDEX idx_documents_connector_id RENAME TO idx_documents_source_id;
      ELSE
        CREATE INDEX IF NOT EXISTS idx_documents_source_id ON public.documents(source_id);
      END IF;
    END IF;
    
    -- Create updated_at trigger
    DROP TRIGGER IF EXISTS update_sources_updated_at ON sources;
    CREATE TRIGGER update_sources_updated_at
      BEFORE UPDATE ON sources
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  -- Ensure RLS is enabled
  ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
  
  -- Drop old policies with connector naming
  DROP POLICY IF EXISTS "Space members can view connectors" ON sources;
  DROP POLICY IF EXISTS "Space members can create connectors" ON sources;
  DROP POLICY IF EXISTS "Space members can update connectors" ON sources;
  DROP POLICY IF EXISTS "Space members can delete connectors" ON sources;
  DROP POLICY IF EXISTS "Workspace members can view connectors" ON sources;
  DROP POLICY IF EXISTS "Workspace members can create connectors" ON sources;
  DROP POLICY IF EXISTS "Creators and admins can update connectors" ON sources;
  DROP POLICY IF EXISTS "Creators and admins can delete connectors" ON sources;
  
  -- Drop potentially conflicting new policies
  DROP POLICY IF EXISTS "Workspace members can view sources" ON sources;
  DROP POLICY IF EXISTS "Workspace members can create sources" ON sources;
  DROP POLICY IF EXISTS "Creators and admins can update sources" ON sources;
  DROP POLICY IF EXISTS "Creators and admins can delete sources" ON sources;
  
  -- Create new source policies
  CREATE POLICY "Workspace members can view sources"
    ON sources FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM workspaces w
        JOIN space_members sm ON sm.space_id = w.space_id
        WHERE w.id = sources.workspace_id
        AND sm.user_id = auth.uid()
      )
    );
  
  CREATE POLICY "Workspace members can create sources"
    ON sources FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM workspaces w
        JOIN space_members sm ON sm.space_id = w.space_id
        WHERE w.id = sources.workspace_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin', 'member')
      )
      AND created_by = auth.uid()
    );
  
  CREATE POLICY "Creators and admins can update sources"
    ON sources FOR UPDATE
    USING (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM workspaces w
        JOIN space_members sm ON sm.space_id = w.space_id
        WHERE w.id = sources.workspace_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
      )
    );
  
  CREATE POLICY "Creators and admins can delete sources"
    ON sources FOR DELETE
    USING (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM workspaces w
        JOIN space_members sm ON sm.space_id = w.space_id
        WHERE w.id = sources.workspace_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
      )
    );
  
  RAISE NOTICE 'Sources table setup complete!';
END $$;

-- Add missing enum values if the enum already exists
-- This needs to be done outside the main DO block because ALTER TYPE ADD VALUE cannot run inside a transaction block
DO $$
BEGIN
  -- Check if we need to add 'direct_upload' value
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'source_type' AND e.enumlabel = 'direct_upload'
  ) THEN
    ALTER TYPE source_type ADD VALUE 'direct_upload';
    RAISE NOTICE 'Added direct_upload to source_type enum';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add direct_upload: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Check if we need to add 'overheid_nl' value
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'source_type' AND e.enumlabel = 'overheid_nl'
  ) THEN
    ALTER TYPE source_type ADD VALUE 'overheid_nl';
    RAISE NOTICE 'Added overheid_nl to source_type enum';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add overheid_nl: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Check if we need to add 'workspace_generated' value
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'source_type' AND e.enumlabel = 'workspace_generated'
  ) THEN
    ALTER TYPE source_type ADD VALUE 'workspace_generated';
    RAISE NOTICE 'Added workspace_generated to source_type enum';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add workspace_generated: %', SQLERRM;
END $$;

-- Verify the setup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sources') THEN
    RAISE NOTICE '✓ Table "sources" exists';
  ELSE
    RAISE WARNING '✗ Table "sources" does NOT exist';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'source_id') THEN
    RAISE NOTICE '✓ Column "source_id" exists in documents table';
  ELSE
    RAISE WARNING '✗ Column "source_id" does NOT exist in documents table';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_type') THEN
    RAISE NOTICE '✓ Type "source_type" exists';
  ELSE
    RAISE WARNING '✗ Type "source_type" does NOT exist';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'sources' 
    AND policyname = 'Workspace members can view sources'
  ) THEN
    RAISE NOTICE '✓ RLS policies are configured';
  ELSE
    RAISE WARNING '✗ RLS policies are NOT configured';
  END IF;
END $$;

