-- Phase 5: analysis reports and policy graph
-- Hardened SELECT/write split applied in 043_rls_harden_programme.sql

CREATE TABLE IF NOT EXISTS public.analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('existing_policy', 'coverage', 'conflicts', 'effects', 'quality')),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  generation_run_id uuid REFERENCES public.generation_runs(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.policy_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  node_type text NOT NULL CHECK (node_type IN ('ambition', 'provincial_interest', 'challenge', 'goal', 'measure', 'implementation')),
  label text NOT NULL,
  measure_id uuid REFERENCES public.programme_measures(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.policy_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  from_node_id uuid NOT NULL REFERENCES public.policy_graph_nodes(id) ON DELETE CASCADE,
  to_node_id uuid NOT NULL REFERENCES public.policy_graph_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL CHECK (relation IN ('contributes_to', 'implements', 'conflicts_with', 'duplicates', 'supersedes', 'effects')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_analysis_reports_workspace ON public.analysis_reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_policy_graph_nodes_workspace ON public.policy_graph_nodes(workspace_id);

ALTER TABLE public.analysis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_graph_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members analysis reports" ON public.analysis_reports;
CREATE POLICY "Workspace members analysis reports" ON public.analysis_reports FOR ALL
  USING (is_workspace_member(analysis_reports.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(analysis_reports.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace members policy nodes" ON public.policy_graph_nodes;
CREATE POLICY "Workspace members policy nodes" ON public.policy_graph_nodes FOR ALL
  USING (is_workspace_member(policy_graph_nodes.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(policy_graph_nodes.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace members policy edges" ON public.policy_graph_edges;
CREATE POLICY "Workspace members policy edges" ON public.policy_graph_edges FOR ALL
  USING (is_workspace_member(policy_graph_edges.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(policy_graph_edges.workspace_id, auth.uid()));
