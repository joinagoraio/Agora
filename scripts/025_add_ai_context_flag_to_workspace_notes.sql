-- Adds a flag to control whether workspace notes are included in AI context
ALTER TABLE public.workspace_notes
  ADD COLUMN IF NOT EXISTS include_in_ai_context boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.workspace_notes.include_in_ai_context IS
  'Whether the note should be included when building AI context.';

