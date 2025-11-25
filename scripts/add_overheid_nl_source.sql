-- Add 'overheid_nl' to the connector_type
-- This script handles both enum types and CHECK constraints

-- If using enum type (from 001_create_core_schema.sql):
DO $$ 
BEGIN
  -- Check if connector_type enum exists
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connector_type') THEN
    -- Add 'overheid_nl' value if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'overheid_nl' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'connector_type')
    ) THEN
      ALTER TYPE connector_type ADD VALUE 'overheid_nl';
    END IF;
  END IF;
END $$;

-- If using CHECK constraint (from complete_migration.sql):
DO $$
BEGIN
  -- Check if connectors table uses CHECK constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'connectors_type_check'
  ) THEN
    ALTER TABLE connectors DROP CONSTRAINT IF EXISTS connectors_type_check;
    ALTER TABLE connectors ADD CONSTRAINT connectors_type_check 
      CHECK (type IN ('google_drive', 'notion', 'confluence', 'sharepoint', 'dropbox', 'direct_upload', 'overheid_nl'));
  END IF;
END $$;

-- If the connectors table has already been migrated to sources but still uses the old CHECK constraint, update it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sources'
      AND column_name = 'type'
      AND data_type IN ('text', 'character varying')
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.table_constraints 
      WHERE constraint_schema = 'public'
        AND table_name = 'sources'
        AND constraint_name = 'connectors_type_check'
    ) THEN
      ALTER TABLE public.sources DROP CONSTRAINT connectors_type_check;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.table_constraints 
      WHERE constraint_schema = 'public'
        AND table_name = 'sources'
        AND constraint_name = 'sources_type_check'
    ) THEN
      ALTER TABLE public.sources DROP CONSTRAINT sources_type_check;
    END IF;

    ALTER TABLE public.sources ADD CONSTRAINT sources_type_check 
      CHECK (type IN ('google_drive', 'notion', 'confluence', 'sharepoint', 'dropbox', 'direct_upload', 'overheid_nl', 'workspace_generated'));
  END IF;
END $$;
