-- Phase 4: programme templates, outline nodes, measures registry

CREATE TABLE IF NOT EXISTS public.programme_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.programme_outline_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.programme_templates(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.programme_outline_nodes(id) ON DELETE CASCADE,
  title text NOT NULL,
  purpose text,
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.programme_measures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  measure_type text NOT NULL CHECK (measure_type IN ('ambition', 'goal', 'measure', 'implementation')),
  specific_action text NOT NULL DEFAULT '',
  owner_role text,
  geography text,
  timeline text,
  indicator text,
  success_criterion text,
  contributes_to_vision text[] NOT NULL DEFAULT '{}',
  provincial_interests text[] NOT NULL DEFAULT '{}',
  effects_direction text NOT NULL DEFAULT 'unknown'
    CHECK (effects_direction IN ('positive', 'negative', 'neutral', 'unknown')),
  effects_deviation boolean NOT NULL DEFAULT false,
  effects_justification text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  narrative text,
  workflow_status text NOT NULL DEFAULT 'generated'
    CHECK (workflow_status IN ('generated', 'in_review', 'revised', 'approved')),
  outline_node_id uuid REFERENCES public.programme_outline_nodes(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programme_measures_workspace ON public.programme_measures(workspace_id);

ALTER TABLE public.programme_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_outline_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_measures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Space members view templates" ON public.programme_templates;
CREATE POLICY "Space members view templates" ON public.programme_templates FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.space_members sm WHERE sm.space_id = programme_templates.space_id AND sm.user_id = auth.uid()));

DROP POLICY IF EXISTS "Space admins manage templates" ON public.programme_templates;
CREATE POLICY "Space admins manage templates" ON public.programme_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.space_members sm WHERE sm.space_id = programme_templates.space_id AND sm.user_id = auth.uid() AND sm.role IN ('admin', 'owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.space_members sm WHERE sm.space_id = programme_templates.space_id AND sm.user_id = auth.uid() AND sm.role IN ('admin', 'owner')));

DROP POLICY IF EXISTS "Space members view outline nodes" ON public.programme_outline_nodes;
CREATE POLICY "Space members view outline nodes" ON public.programme_outline_nodes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.programme_templates t
    JOIN public.space_members sm ON sm.space_id = t.space_id
    WHERE t.id = programme_outline_nodes.template_id AND sm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Space admins manage outline nodes" ON public.programme_outline_nodes;
CREATE POLICY "Space admins manage outline nodes" ON public.programme_outline_nodes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.programme_templates t
    JOIN public.space_members sm ON sm.space_id = t.space_id
    WHERE t.id = programme_outline_nodes.template_id AND sm.user_id = auth.uid() AND sm.role IN ('admin', 'owner')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.programme_templates t
    JOIN public.space_members sm ON sm.space_id = t.space_id
    WHERE t.id = programme_outline_nodes.template_id AND sm.user_id = auth.uid() AND sm.role IN ('admin', 'owner')
  ));

DROP POLICY IF EXISTS "Workspace members view measures" ON public.programme_measures;
CREATE POLICY "Workspace members view measures" ON public.programme_measures FOR SELECT
  USING (is_workspace_member(programme_measures.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace members manage measures" ON public.programme_measures;
CREATE POLICY "Workspace members manage measures" ON public.programme_measures FOR ALL
  USING (is_workspace_member(programme_measures.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(programme_measures.workspace_id, auth.uid()));

-- Hardened writer-only mutations in 043_rls_harden_programme.sql
