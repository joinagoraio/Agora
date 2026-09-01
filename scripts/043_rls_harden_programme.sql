-- Harden programme RLS (035–042 follow-up)
-- - Use is_workspace_member / is_workspace_writer helpers
-- - Viewers: SELECT only; writers (admin/member/creator/space admin): mutations
-- - generation_runs: SELECT for members; INSERT only via service role (no client insert)
-- - document_sections: enforce document_id ↔ workspace_id alignment; drop dead 'editor' role

BEGIN;

-- Ensure space-admin helper exists (032 may have been skipped on fresh local installs)
CREATE OR REPLACE FUNCTION public.is_space_admin(space_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  membership_role TEXT;
BEGIN
  IF space_uuid IS NULL OR user_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO membership_role
  FROM space_members
  WHERE space_id = space_uuid
    AND user_id = user_uuid
  LIMIT 1;

  RETURN membership_role IN ('owner', 'admin');
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_space_admin(UUID, UUID) TO authenticated, service_role;

-- Writer = membership that can mutate (not viewer-only)
CREATE OR REPLACE FUNCTION public.is_workspace_writer(workspace_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  space_uuid UUID;
  creator_uuid UUID;
  member_role text;
BEGIN
  SELECT space_id, created_by INTO space_uuid, creator_uuid FROM workspaces WHERE id = workspace_uuid;
  IF space_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF creator_uuid = user_uuid THEN
    RETURN TRUE;
  END IF;

  SELECT role INTO member_role
  FROM workspace_members
  WHERE workspace_id = workspace_uuid AND user_id = user_uuid;

  IF member_role IN ('admin', 'member') THEN
    RETURN TRUE;
  END IF;

  IF is_space_admin(space_uuid, user_uuid) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_workspace_writer(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- document_sections (036)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Workspace members can view document sections" ON public.document_sections;
DROP POLICY IF EXISTS "Workspace members can manage document sections" ON public.document_sections;
DROP POLICY IF EXISTS "Workspace writers can manage document sections" ON public.document_sections;
DROP POLICY IF EXISTS "Workspace writers can update document sections" ON public.document_sections;
DROP POLICY IF EXISTS "Workspace writers can delete document sections" ON public.document_sections;

CREATE POLICY "Workspace members can view document sections"
  ON public.document_sections FOR SELECT
  USING (is_workspace_member(document_sections.workspace_id, auth.uid()));

CREATE POLICY "Workspace writers can manage document sections"
  ON public.document_sections FOR INSERT
  WITH CHECK (
    is_workspace_writer(document_sections.workspace_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_sections.document_id
        AND d.workspace_id = document_sections.workspace_id
    )
  );

CREATE POLICY "Workspace writers can update document sections"
  ON public.document_sections FOR UPDATE
  USING (is_workspace_writer(document_sections.workspace_id, auth.uid()))
  WITH CHECK (
    is_workspace_writer(document_sections.workspace_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_sections.document_id
        AND d.workspace_id = document_sections.workspace_id
    )
  );

CREATE POLICY "Workspace writers can delete document sections"
  ON public.document_sections FOR DELETE
  USING (is_workspace_writer(document_sections.workspace_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- generation_runs (038) — append-only audit; no client INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Workspace members can view generation runs" ON public.generation_runs;
DROP POLICY IF EXISTS "Workspace members can insert generation runs" ON public.generation_runs;

CREATE POLICY "Workspace members can view generation runs"
  ON public.generation_runs FOR SELECT
  USING (is_workspace_member(generation_runs.workspace_id, auth.uid()));

-- No INSERT/UPDATE/DELETE policies for authenticated — service_role bypasses RLS after app auth.

-- ---------------------------------------------------------------------------
-- programme_measures (039)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Workspace members view measures" ON public.programme_measures;
DROP POLICY IF EXISTS "Workspace members manage measures" ON public.programme_measures;
DROP POLICY IF EXISTS "Workspace writers manage measures" ON public.programme_measures;
DROP POLICY IF EXISTS "Workspace writers update measures" ON public.programme_measures;
DROP POLICY IF EXISTS "Workspace writers delete measures" ON public.programme_measures;

CREATE POLICY "Workspace members view measures"
  ON public.programme_measures FOR SELECT
  USING (is_workspace_member(programme_measures.workspace_id, auth.uid()));

CREATE POLICY "Workspace writers manage measures"
  ON public.programme_measures FOR INSERT
  WITH CHECK (is_workspace_writer(programme_measures.workspace_id, auth.uid()));

CREATE POLICY "Workspace writers update measures"
  ON public.programme_measures FOR UPDATE
  USING (is_workspace_writer(programme_measures.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(programme_measures.workspace_id, auth.uid()));

CREATE POLICY "Workspace writers delete measures"
  ON public.programme_measures FOR DELETE
  USING (is_workspace_writer(programme_measures.workspace_id, auth.uid()));


DROP POLICY IF EXISTS "Workspace members view analysis reports" ON public.analysis_reports;
DROP POLICY IF EXISTS "Workspace writers insert analysis reports" ON public.analysis_reports;
DROP POLICY IF EXISTS "Workspace writers update analysis reports" ON public.analysis_reports;
DROP POLICY IF EXISTS "Workspace writers delete analysis reports" ON public.analysis_reports;
DROP POLICY IF EXISTS "Workspace members view policy nodes" ON public.policy_graph_nodes;
DROP POLICY IF EXISTS "Workspace writers insert policy nodes" ON public.policy_graph_nodes;
DROP POLICY IF EXISTS "Workspace writers update policy nodes" ON public.policy_graph_nodes;
DROP POLICY IF EXISTS "Workspace writers delete policy nodes" ON public.policy_graph_nodes;
DROP POLICY IF EXISTS "Workspace members view policy edges" ON public.policy_graph_edges;
DROP POLICY IF EXISTS "Workspace writers insert policy edges" ON public.policy_graph_edges;
DROP POLICY IF EXISTS "Workspace writers update policy edges" ON public.policy_graph_edges;
DROP POLICY IF EXISTS "Workspace writers delete policy edges" ON public.policy_graph_edges;
DROP POLICY IF EXISTS "Workspace members view artefact versions" ON public.artefact_versions;
DROP POLICY IF EXISTS "Workspace writers insert artefact versions" ON public.artefact_versions;
DROP POLICY IF EXISTS "Workspace writers delete artefact versions" ON public.artefact_versions;
DROP POLICY IF EXISTS "Workspace members view section locks" ON public.section_locks;
DROP POLICY IF EXISTS "Workspace writers manage section locks" ON public.section_locks;
DROP POLICY IF EXISTS "Workspace writers update section locks" ON public.section_locks;
DROP POLICY IF EXISTS "Workspace writers delete section locks" ON public.section_locks;
DROP POLICY IF EXISTS "Workspace members view export jobs" ON public.export_jobs;
DROP POLICY IF EXISTS "Workspace writers insert export jobs" ON public.export_jobs;
DROP POLICY IF EXISTS "Workspace writers update export jobs" ON public.export_jobs;
DROP POLICY IF EXISTS "Workspace admins delete export jobs" ON public.export_jobs;

-- ---------------------------------------------------------------------------
-- analysis + policy graph (040)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Workspace members analysis reports" ON public.analysis_reports;
DROP POLICY IF EXISTS "Workspace members policy nodes" ON public.policy_graph_nodes;
DROP POLICY IF EXISTS "Workspace members policy edges" ON public.policy_graph_edges;

CREATE POLICY "Workspace members view analysis reports"
  ON public.analysis_reports FOR SELECT
  USING (is_workspace_member(analysis_reports.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers insert analysis reports"
  ON public.analysis_reports FOR INSERT
  WITH CHECK (is_workspace_writer(analysis_reports.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers update analysis reports"
  ON public.analysis_reports FOR UPDATE
  USING (is_workspace_writer(analysis_reports.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(analysis_reports.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers delete analysis reports"
  ON public.analysis_reports FOR DELETE
  USING (is_workspace_writer(analysis_reports.workspace_id, auth.uid()));

CREATE POLICY "Workspace members view policy nodes"
  ON public.policy_graph_nodes FOR SELECT
  USING (is_workspace_member(policy_graph_nodes.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers insert policy nodes"
  ON public.policy_graph_nodes FOR INSERT
  WITH CHECK (is_workspace_writer(policy_graph_nodes.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers update policy nodes"
  ON public.policy_graph_nodes FOR UPDATE
  USING (is_workspace_writer(policy_graph_nodes.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(policy_graph_nodes.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers delete policy nodes"
  ON public.policy_graph_nodes FOR DELETE
  USING (is_workspace_writer(policy_graph_nodes.workspace_id, auth.uid()));

CREATE POLICY "Workspace members view policy edges"
  ON public.policy_graph_edges FOR SELECT
  USING (is_workspace_member(policy_graph_edges.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers insert policy edges"
  ON public.policy_graph_edges FOR INSERT
  WITH CHECK (is_workspace_writer(policy_graph_edges.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers update policy edges"
  ON public.policy_graph_edges FOR UPDATE
  USING (is_workspace_writer(policy_graph_edges.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(policy_graph_edges.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers delete policy edges"
  ON public.policy_graph_edges FOR DELETE
  USING (is_workspace_writer(policy_graph_edges.workspace_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- versions + locks (041)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Workspace members artefact versions" ON public.artefact_versions;
DROP POLICY IF EXISTS "Workspace members section locks" ON public.section_locks;

CREATE POLICY "Workspace members view artefact versions"
  ON public.artefact_versions FOR SELECT
  USING (is_workspace_member(artefact_versions.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers insert artefact versions"
  ON public.artefact_versions FOR INSERT
  WITH CHECK (is_workspace_writer(artefact_versions.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers delete artefact versions"
  ON public.artefact_versions FOR DELETE
  USING (is_workspace_admin(artefact_versions.workspace_id, auth.uid()));

CREATE POLICY "Workspace members view section locks"
  ON public.section_locks FOR SELECT
  USING (is_workspace_member(section_locks.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers manage section locks"
  ON public.section_locks FOR INSERT
  WITH CHECK (is_workspace_writer(section_locks.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers update section locks"
  ON public.section_locks FOR UPDATE
  USING (is_workspace_writer(section_locks.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(section_locks.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers delete section locks"
  ON public.section_locks FOR DELETE
  USING (is_workspace_writer(section_locks.workspace_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- export_jobs (042)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Workspace members export jobs" ON public.export_jobs;

CREATE POLICY "Workspace members view export jobs"
  ON public.export_jobs FOR SELECT
  USING (is_workspace_member(export_jobs.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers insert export jobs"
  ON public.export_jobs FOR INSERT
  WITH CHECK (is_workspace_writer(export_jobs.workspace_id, auth.uid()));
CREATE POLICY "Workspace writers update export jobs"
  ON public.export_jobs FOR UPDATE
  USING (is_workspace_writer(export_jobs.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(export_jobs.workspace_id, auth.uid()));
CREATE POLICY "Workspace admins delete export jobs"
  ON public.export_jobs FOR DELETE
  USING (is_workspace_admin(export_jobs.workspace_id, auth.uid()));

COMMIT;
