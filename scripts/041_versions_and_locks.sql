-- Phase 6: artefact versions and section locks
-- Hardened SELECT/write split applied in 043_rls_harden_programme.sql

CREATE TABLE IF NOT EXISTS public.artefact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  artefact_type text NOT NULL CHECK (artefact_type IN ('section', 'measure', 'playbook', 'document')),
  artefact_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.section_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  locked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (workspace_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_artefact_versions_workspace ON public.artefact_versions(workspace_id, artefact_type, artefact_id);

ALTER TABLE public.artefact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members artefact versions" ON public.artefact_versions;
CREATE POLICY "Workspace members artefact versions" ON public.artefact_versions FOR ALL
  USING (is_workspace_member(artefact_versions.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(artefact_versions.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace members section locks" ON public.section_locks;
CREATE POLICY "Workspace members section locks" ON public.section_locks FOR ALL
  USING (is_workspace_member(section_locks.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(section_locks.workspace_id, auth.uid()));
