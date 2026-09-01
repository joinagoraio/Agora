-- Phase 3: generation_runs audit log

CREATE TABLE IF NOT EXISTS public.generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chat', 'draft', 'measures', 'analysis', 'export')),
  playbook_version_id uuid REFERENCES public.playbook_versions(id) ON DELETE SET NULL,
  model text,
  temperature numeric,
  instructions text,
  source_document_ids uuid[] NOT NULL DEFAULT '{}',
  unused_document_ids uuid[] NOT NULL DEFAULT '{}',
  output_ref text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_runs_workspace ON public.generation_runs(workspace_id, created_at DESC);

ALTER TABLE public.generation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view generation runs" ON public.generation_runs;
CREATE POLICY "Workspace members can view generation runs" ON public.generation_runs FOR SELECT
  USING (is_workspace_member(generation_runs.workspace_id, auth.uid()));

-- No client INSERT: service_role only after requireAuthAndPermission (see 043 + generation-run.ts)
DROP POLICY IF EXISTS "Workspace members can insert generation runs" ON public.generation_runs;