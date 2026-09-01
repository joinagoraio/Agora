-- Phase 0.4: workspace kind for research vs environmental programme
-- Stored as column for indexing; also mirrored into metadata.kind by app code.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'research'
    CHECK (kind IN ('research', 'environmental_programme'));

CREATE INDEX IF NOT EXISTS idx_workspaces_kind ON public.workspaces(kind);

COMMENT ON COLUMN public.workspaces.kind IS 'Workspace type: research (default) or environmental_programme';

-- Backfill metadata.kind for consistency
UPDATE public.workspaces
SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('kind', kind)
WHERE metadata->>'kind' IS DISTINCT FROM kind;
