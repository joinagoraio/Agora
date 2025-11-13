-- Phase 1.4: Create Workspace-Space Links Table
-- Links workspaces to parent spaces for Reference inheritance (Amendment A1 Phase 1)

CREATE TABLE IF NOT EXISTS public.workspace_space_links (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (relationship = 'reference'),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (workspace_id, space_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_workspace_space_links_workspace_id ON public.workspace_space_links(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_space_links_space_id ON public.workspace_space_links(space_id);
CREATE INDEX IF NOT EXISTS idx_workspace_space_links_relationship ON public.workspace_space_links(relationship);

-- Add comments
COMMENT ON TABLE public.workspace_space_links IS 'Links workspaces to parent spaces for Reference inheritance (read-only mirrors)';
COMMENT ON COLUMN public.workspace_space_links.relationship IS 'Type of relationship (currently only "reference" supported in Phase 1)';
