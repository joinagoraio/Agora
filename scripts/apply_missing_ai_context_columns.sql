-- Apply missing AI context columns to workspace_notes and workspace_items
-- This script is safe to run multiple times due to IF NOT EXISTS checks

-- Migration 025: Add include_in_ai_context to workspace_notes
ALTER TABLE public.workspace_notes
  ADD COLUMN IF NOT EXISTS include_in_ai_context boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.workspace_notes.include_in_ai_context IS
  'Whether the note should be included when building AI context.';

-- Migration 026: Add include_in_ai_context to workspace_items  
ALTER TABLE public.workspace_items
  ADD COLUMN IF NOT EXISTS include_in_ai_context boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspace_items.include_in_ai_context IS
  'Whether the workspace item (evidence) should be included when building AI context. Defaults to false for evidence items.';

