-- F34: long-running programme jobs (fill / analysis / qc)
-- Writers mutate; all workspace members can read progress.

CREATE TABLE IF NOT EXISTS public.programme_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('fill', 'analysis', 'qc')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'cancelled', 'done', 'failed')),
  cancelled boolean NOT NULL DEFAULT false,
  progress jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.programme_jobs
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_programme_jobs_workspace
  ON public.programme_jobs(workspace_id, kind, created_at DESC);

ALTER TABLE public.programme_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view programme jobs" ON public.programme_jobs;
CREATE POLICY "Workspace members can view programme jobs"
  ON public.programme_jobs FOR SELECT
  USING (is_workspace_member(programme_jobs.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers can insert programme jobs" ON public.programme_jobs;
CREATE POLICY "Workspace writers can insert programme jobs"
  ON public.programme_jobs FOR INSERT
  WITH CHECK (is_workspace_writer(programme_jobs.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers can update programme jobs" ON public.programme_jobs;
CREATE POLICY "Workspace writers can update programme jobs"
  ON public.programme_jobs FOR UPDATE
  USING (is_workspace_writer(programme_jobs.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(programme_jobs.workspace_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.programme_jobs TO authenticated;
