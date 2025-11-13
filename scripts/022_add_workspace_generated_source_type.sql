-- Add workspace_generated source type for documents authored within a workspace

-- If the project uses an ENUM type for source_type, add the new value
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_type') THEN
    BEGIN
      ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'workspace_generated';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- If the project uses a CHECK constraint instead of an ENUM, update it
DO $$
DECLARE
  has_constraint BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'sources'
      AND constraint_name = 'sources_type_check'
  )
  INTO has_constraint;

  IF has_constraint THEN
    ALTER TABLE public.sources DROP CONSTRAINT sources_type_check;
    ALTER TABLE public.sources
      ADD CONSTRAINT sources_type_check CHECK (
        type IN (
          'google_drive',
          'notion',
          'confluence',
          'sharepoint',
          'dropbox',
          'direct_upload',
          'overheid_nl',
          'workspace_generated'
        )
      );
  END IF;
END $$;
