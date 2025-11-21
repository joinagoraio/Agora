-- Fix missing context_id and context_type columns in conversations table
-- This migration adds context scoping to conversations
-- Run this in Supabase SQL Editor (runs as postgres user by default)

BEGIN;

-- Grant necessary permissions (if running as service_role)
GRANT ALL ON TABLE public.conversations TO postgres;
GRANT ALL ON TABLE public.conversations TO service_role;

-- Step 1: Add columns (nullable first to avoid issues with existing rows)
DO $$
BEGIN
  -- Add context_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'conversations' 
    AND column_name = 'context_type'
  ) THEN
    ALTER TABLE public.conversations ADD COLUMN context_type text;
    RAISE NOTICE 'Added context_type column to conversations table';
  ELSE
    RAISE NOTICE 'context_type column already exists in conversations table';
  END IF;

  -- Add context_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'conversations' 
    AND column_name = 'context_id'
  ) THEN
    ALTER TABLE public.conversations ADD COLUMN context_id uuid;
    RAISE NOTICE 'Added context_id column to conversations table';
  ELSE
    RAISE NOTICE 'context_id column already exists in conversations table';
  END IF;
END $$;

-- Step 2: Update existing rows to have default context_type
UPDATE public.conversations 
SET context_type = 'workspace' 
WHERE context_type IS NULL;

-- Step 3: Make context_type NOT NULL with default
ALTER TABLE public.conversations 
  ALTER COLUMN context_type SET DEFAULT 'workspace';

-- Only set NOT NULL if all rows have been updated
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations WHERE context_type IS NULL
  ) THEN
    ALTER TABLE public.conversations ALTER COLUMN context_type SET NOT NULL;
    RAISE NOTICE 'Set context_type to NOT NULL';
  ELSE
    RAISE WARNING 'Some conversations still have NULL context_type, skipping NOT NULL constraint';
  END IF;
END $$;

-- Step 4: Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS conversations_workspace_context_idx
  ON public.conversations (workspace_id, context_type, context_id);

-- Step 5: Restore proper permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO service_role;

-- Step 6: Verify the changes
DO $$
DECLARE
  has_context_type boolean;
  has_context_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'conversations' 
    AND column_name = 'context_type'
  ) INTO has_context_type;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'conversations' 
    AND column_name = 'context_id'
  ) INTO has_context_id;

  IF has_context_type AND has_context_id THEN
    RAISE NOTICE '✓ Migration successful: Both context_type and context_id columns exist';
  ELSE
    RAISE WARNING 'Migration incomplete: context_type=%s, context_id=%s', has_context_type, has_context_id;
  END IF;
END $$;

COMMIT;

