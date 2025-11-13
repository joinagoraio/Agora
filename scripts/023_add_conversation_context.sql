-- Add context scoping to conversations
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
  END IF;

  -- Add context_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'conversations' 
    AND column_name = 'context_id'
  ) THEN
    ALTER TABLE public.conversations ADD COLUMN context_id uuid;
  END IF;
END $$;

-- Step 2: Update existing rows to have default context_type
UPDATE public.conversations 
SET context_type = 'workspace' 
WHERE context_type IS NULL;

-- Step 3: Make context_type NOT NULL with default
ALTER TABLE public.conversations 
  ALTER COLUMN context_type SET DEFAULT 'workspace',
  ALTER COLUMN context_type SET NOT NULL;

-- Step 4: Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS conversations_workspace_context_idx
  ON public.conversations (workspace_id, context_type, context_id);
