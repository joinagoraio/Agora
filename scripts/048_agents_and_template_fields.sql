-- Execution Plan v2 Phase A.2: expanded templates + agents
-- Apply locally only. Do not push to cloud as part of this programme.

ALTER TABLE public.programme_templates
  ADD COLUMN IF NOT EXISTS quality_rules text,
  ADD COLUMN IF NOT EXISTS output_form text;

ALTER TABLE public.programme_outline_nodes
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS field_specs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_rules text,
  ADD COLUMN IF NOT EXISTS output_form text,
  ADD COLUMN IF NOT EXISTS relation_hints text;

CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('analysis', 'vision', 'measures', 'oer', 'qc', 'draft', 'chat')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  version integer NOT NULL,
  instructions text NOT NULL,
  source_roles text[] NOT NULL DEFAULT '{}',
  source_document_ids uuid[] NOT NULL DEFAULT '{}',
  output_contract text NOT NULL DEFAULT 'json',
  quality_rules text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT 'openai-compatible',
  endpoint text,
  credentials_ref text,
  model text NOT NULL,
  changelog text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version)
);

CREATE INDEX IF NOT EXISTS idx_agents_space ON public.agents(space_id);
CREATE INDEX IF NOT EXISTS idx_agent_versions_agent ON public.agent_versions(agent_id, version DESC);

ALTER TABLE public.generation_runs
  ADD COLUMN IF NOT EXISTS agent_version_id uuid REFERENCES public.agent_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider text;

ALTER TABLE public.generation_runs DROP CONSTRAINT IF EXISTS generation_runs_kind_check;
ALTER TABLE public.generation_runs
  ADD CONSTRAINT generation_runs_kind_check
  CHECK (kind IN ('chat', 'draft', 'measures', 'analysis', 'vision', 'oer', 'qc', 'export'));

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Space members view agents" ON public.agents;
CREATE POLICY "Space members view agents" ON public.agents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.space_members sm
    WHERE sm.space_id = agents.space_id AND sm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Space admins insert agents" ON public.agents;
CREATE POLICY "Space admins insert agents" ON public.agents FOR INSERT
  WITH CHECK (is_space_admin(agents.space_id, auth.uid()));

DROP POLICY IF EXISTS "Space admins update agents" ON public.agents;
CREATE POLICY "Space admins update agents" ON public.agents FOR UPDATE
  USING (is_space_admin(agents.space_id, auth.uid()))
  WITH CHECK (is_space_admin(agents.space_id, auth.uid()));

DROP POLICY IF EXISTS "Space admins delete agents" ON public.agents;
CREATE POLICY "Space admins delete agents" ON public.agents FOR DELETE
  USING (is_space_admin(agents.space_id, auth.uid()));

DROP POLICY IF EXISTS "Space members view agent versions" ON public.agent_versions;
CREATE POLICY "Space members view agent versions" ON public.agent_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.agents a
    JOIN public.space_members sm ON sm.space_id = a.space_id
    WHERE a.id = agent_versions.agent_id AND sm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Space admins insert agent versions" ON public.agent_versions;
CREATE POLICY "Space admins insert agent versions" ON public.agent_versions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = agent_versions.agent_id AND is_space_admin(a.space_id, auth.uid())
  ));

DROP POLICY IF EXISTS "Space admins delete agent versions" ON public.agent_versions;
CREATE POLICY "Space admins delete agent versions" ON public.agent_versions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = agent_versions.agent_id AND is_space_admin(a.space_id, auth.uid())
  ));
