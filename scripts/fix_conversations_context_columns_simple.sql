-- Simple version: Fix missing context_id and context_type columns in conversations table
-- Run this in Supabase SQL Editor if the full version has permission issues

-- Add context_type column with default
ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS context_type text DEFAULT 'workspace';

-- Add context_id column
ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS context_id uuid;

-- Update any NULL values (for safety)
UPDATE public.conversations 
SET context_type = 'workspace' 
WHERE context_type IS NULL;

-- Make context_type NOT NULL
ALTER TABLE public.conversations 
  ALTER COLUMN context_type SET NOT NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS conversations_workspace_context_idx
  ON public.conversations (workspace_id, context_type, context_id);

-- Verify
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_name = 'conversations'
  AND column_name IN ('context_type', 'context_id')
ORDER BY column_name;

