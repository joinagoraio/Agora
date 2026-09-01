-- Phase 7: export jobs
-- Hardened SELECT/write split applied in 043_rls_harden_programme.sql

CREATE TABLE IF NOT EXISTS public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('docx', 'pdf', 'markdown', 'json', 'audit_package')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  classification_max text NOT NULL DEFAULT 'internal'
    CHECK (classification_max IN ('public', 'internal', 'confidential')),
  result_path text,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_workspace ON public.export_jobs(workspace_id, created_at DESC);

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members export jobs" ON public.export_jobs;
CREATE POLICY "Workspace members export jobs" ON public.export_jobs FOR ALL
  USING (is_workspace_member(export_jobs.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(export_jobs.workspace_id, auth.uid()));
