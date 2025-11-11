-- Add context and location fields to workspaces table
-- These fields will be used to provide additional context to the AI for search criteria

ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS context TEXT,
ADD COLUMN IF NOT EXISTS location TEXT;

COMMENT ON COLUMN public.workspaces.context IS 'Additional context for the workspace to help AI understand search criteria and domain';
COMMENT ON COLUMN public.workspaces.location IS 'Location associated with the workspace. If provided, this will be automatically included in searches.';

