-- Phase 1.2: Extend Workspaces Table with Amendment A1 fields
-- Adds location, phase, domains, and metadata

-- Check if columns already exist and add them if not
ALTER TABLE public.workspaces 
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS domains text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Create index for domains array
CREATE INDEX IF NOT EXISTS idx_workspaces_domains ON public.workspaces USING GIN(domains);

-- Add comments
COMMENT ON COLUMN public.workspaces.location IS 'Location associated with the workspace';
COMMENT ON COLUMN public.workspaces.phase IS 'Current phase of the workspace/project';
COMMENT ON COLUMN public.workspaces.domains IS 'Array of domain tags for cross-domain organization';
COMMENT ON COLUMN public.workspaces.metadata IS 'Additional metadata for the workspace';

