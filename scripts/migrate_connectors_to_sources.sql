-- Migration script to rename connectors to sources
-- This script renames tables, columns, types, and constraints

-- Step 1: Rename enum types
DO $$ 
BEGIN
  -- Rename connector_type enum to source_type
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connector_type') THEN
    ALTER TYPE connector_type RENAME TO source_type;
  END IF;
  
  -- Rename connector_status enum to source_status  
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connector_status') THEN
    ALTER TYPE connector_status RENAME TO source_status;
  END IF;
END $$;

-- Step 2: Rename table
ALTER TABLE IF EXISTS connectors RENAME TO sources;

-- Step 3: Rename columns in documents table
ALTER TABLE IF EXISTS documents RENAME COLUMN connector_id TO source_id;

-- Step 4: Update foreign key constraint name
DO $$
BEGIN
  -- Drop old foreign key constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'documents_connector_id_fkey'
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT documents_connector_id_fkey;
  END IF;
  
  -- Add new foreign key constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'documents_source_id_fkey'
  ) THEN
    ALTER TABLE documents 
    ADD CONSTRAINT documents_source_id_fkey 
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 5: Update unique constraint on documents table
DO $$
BEGIN
  -- Drop old unique constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'documents_connector_id_external_id_key'
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT documents_connector_id_external_id_key;
  END IF;
  
  -- Add new unique constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'documents_source_id_external_id_key'
  ) THEN
    ALTER TABLE documents 
    ADD CONSTRAINT documents_source_id_external_id_key 
    UNIQUE (source_id, external_id);
  END IF;
END $$;

-- Step 6: Update CHECK constraints on sources table
DO $$
BEGIN
  -- Drop old constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'connectors_type_check'
  ) THEN
    ALTER TABLE sources DROP CONSTRAINT connectors_type_check;
  END IF;
  
  -- Add new constraint (if using CHECK instead of enum)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sources' AND column_name = 'type' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE sources ADD CONSTRAINT sources_type_check 
    CHECK (type IN ('google_drive', 'notion', 'confluence', 'sharepoint', 'dropbox', 'direct_upload', 'overheid_nl'));
  END IF;
  
  -- Drop old status constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'connectors_status_check'
  ) THEN
    ALTER TABLE sources DROP CONSTRAINT connectors_status_check;
  END IF;
END $$;

-- Step 7: Rename indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_connectors_workspace_id') THEN
    ALTER INDEX idx_connectors_workspace_id RENAME TO idx_sources_workspace_id;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_documents_connector_id') THEN
    ALTER INDEX idx_documents_connector_id RENAME TO idx_documents_source_id;
  END IF;
END $$;

-- Step 8: Update RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Space members can view connectors" ON sources;
  DROP POLICY IF EXISTS "Space members can create connectors" ON sources;
  DROP POLICY IF EXISTS "Space members can update connectors" ON sources;
  DROP POLICY IF EXISTS "Space members can delete connectors" ON sources;
  DROP POLICY IF EXISTS "Workspace members can view connectors" ON sources;
  DROP POLICY IF EXISTS "Workspace members can create connectors" ON sources;
  DROP POLICY IF EXISTS "Creators and admins can update connectors" ON sources;
  DROP POLICY IF EXISTS "Creators and admins can delete connectors" ON sources;
  
  -- Create new policies (these will need to be recreated based on your RLS requirements)
  -- The exact policies depend on your security model
END $$;

-- Step 9: Update triggers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'sources'::regclass) THEN
    -- Trigger name stays the same, but table reference is updated automatically
    NULL; -- Trigger will work automatically after table rename
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_connectors_updated_at') THEN
    DROP TRIGGER IF EXISTS update_connectors_updated_at ON sources;
    CREATE TRIGGER update_sources_updated_at 
    BEFORE UPDATE ON sources 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Step 10: Update any views or functions that reference connectors
-- Note: You may need to update application code that references these

-- Verify the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration complete. Please verify:';
  RAISE NOTICE '1. Table "sources" exists: %', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sources');
  RAISE NOTICE '2. Column "source_id" exists in documents: %', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'source_id');
  RAISE NOTICE '3. Type "source_type" exists: %', EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_type');
END $$;

