-- Adds a flag to control whether workspace items (evidence) are included in AI context
ALTER TABLE public.workspace_items
  ADD COLUMN IF NOT EXISTS include_in_ai_context boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspace_items.include_in_ai_context IS
  'Whether the workspace item (evidence) should be included when building AI context. Defaults to false for evidence items.';

