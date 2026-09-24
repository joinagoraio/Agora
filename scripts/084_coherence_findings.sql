-- Links across interests: where they reinforce each other, where a measure can serve several,
-- and where they pull against each other. Staff decide what stays.

CREATE TABLE IF NOT EXISTS public.programme_coherence_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('reinforces', 'shared_measure', 'dilemma')),
  title text NOT NULL,
  explanation text,
  interest_ids uuid[] NOT NULL DEFAULT '{}',
  measure_ids uuid[] NOT NULL DEFAULT '{}',
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  origin text NOT NULL DEFAULT 'model' CHECK (origin IN ('model', 'signal')),
  decision text CHECK (decision IS NULL OR decision IN ('keep', 'adapt', 'drop')),
  decision_reason text,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  generation_run_id uuid REFERENCES public.generation_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programme_coherence_workspace ON public.programme_coherence_findings(workspace_id);

ALTER TABLE public.programme_coherence_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members view coherence" ON public.programme_coherence_findings;
CREATE POLICY "Workspace members view coherence" ON public.programme_coherence_findings FOR SELECT
  USING (is_workspace_member(programme_coherence_findings.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers insert coherence" ON public.programme_coherence_findings;
CREATE POLICY "Workspace writers insert coherence" ON public.programme_coherence_findings FOR INSERT
  WITH CHECK (is_workspace_writer(programme_coherence_findings.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers update coherence" ON public.programme_coherence_findings;
CREATE POLICY "Workspace writers update coherence" ON public.programme_coherence_findings FOR UPDATE
  USING (is_workspace_writer(programme_coherence_findings.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(programme_coherence_findings.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers delete coherence" ON public.programme_coherence_findings;
CREATE POLICY "Workspace writers delete coherence" ON public.programme_coherence_findings FOR DELETE
  USING (is_workspace_writer(programme_coherence_findings.workspace_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programme_coherence_findings TO authenticated;
REVOKE ALL ON public.programme_coherence_findings FROM anon;
