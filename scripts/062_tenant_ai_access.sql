-- Tenant layer, platform LLM catalog, tenant model allow-list, agent catalog refs

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  llm_key_policy text NOT NULL DEFAULT 'platform_only'
    CHECK (llm_key_policy IN ('platform_only', 'allow_byok')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS platform_role text
    CHECK (platform_role IS NULL OR platform_role = 'super_admin');

-- Backfill tenants: one per distinct space owner
INSERT INTO public.tenants (name, llm_key_policy)
SELECT DISTINCT ON (s.owner_id)
  COALESCE(NULLIF(trim(p.full_name), ''), split_part(p.email, '@', 1), 'Organisation') || ' organisation',
  'platform_only'
FROM public.spaces s
JOIN public.profiles p ON p.id = s.owner_id
WHERE s.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tenants t
    JOIN public.spaces s2 ON s2.tenant_id = t.id
    WHERE s2.owner_id = s.owner_id
  )
ORDER BY s.owner_id, s.created_at ASC;

-- Attach every space of an owner to that owner's tenant
UPDATE public.spaces s
SET tenant_id = map.tenant_id
FROM (
  SELECT DISTINCT ON (s2.owner_id)
    s2.owner_id,
    t.id AS tenant_id
  FROM public.spaces s2
  JOIN public.profiles p ON p.id = s2.owner_id
  JOIN public.tenants t
    ON t.name = COALESCE(NULLIF(trim(p.full_name), ''), split_part(p.email, '@', 1), 'Organisation') || ' organisation'
  WHERE s2.owner_id IS NOT NULL
  ORDER BY s2.owner_id, t.created_at ASC
) map
WHERE s.owner_id = map.owner_id
  AND s.tenant_id IS NULL;

-- Orphan spaces: create a tenant per space
INSERT INTO public.tenants (name, llm_key_policy)
SELECT s.name || ' tenant', 'platform_only'
FROM public.spaces s
WHERE s.tenant_id IS NULL;

UPDATE public.spaces s
SET tenant_id = t.id
FROM public.tenants t
WHERE s.tenant_id IS NULL AND t.name = s.name || ' tenant';

-- Tenant members from space owners/admins
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT DISTINCT s.tenant_id, sm.user_id,
  CASE
    WHEN sm.role = 'owner' THEN 'owner'
    WHEN sm.role = 'admin' THEN 'admin'
    ELSE 'member'
  END
FROM public.space_members sm
JOIN public.spaces s ON s.id = sm.space_id
WHERE s.tenant_id IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT DISTINCT s.tenant_id, s.owner_id, 'owner'
FROM public.spaces s
WHERE s.tenant_id IS NOT NULL AND s.owner_id IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner'
WHERE tenant_members.role <> 'owner';

CREATE INDEX IF NOT EXISTS idx_spaces_tenant ON public.spaces(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON public.tenant_members(user_id);

-- Platform LLM catalog
CREATE TABLE IF NOT EXISTS public.llm_providers (
  id text PRIMARY KEY,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.llm_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL REFERENCES public.llm_providers(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  cost_hint text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, model_id)
);

CREATE TABLE IF NOT EXISTS public.platform_task_models (
  task text PRIMARY KEY,
  model_id uuid NOT NULL REFERENCES public.llm_models(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_llm_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES public.llm_models(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, model_id)
);

CREATE TABLE IF NOT EXISTS public.tenant_llm_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id text NOT NULL REFERENCES public.llm_providers(id) ON DELETE CASCADE,
  encrypted_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_id)
);

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS permitted boolean NOT NULL DEFAULT true;

ALTER TABLE public.agent_versions
  ADD COLUMN IF NOT EXISTS catalog_model_id uuid REFERENCES public.llm_models(id) ON DELETE SET NULL;

-- Seed providers and models
INSERT INTO public.llm_providers (id, label, enabled, sort_order) VALUES
  ('openai', 'OpenAI', true, 1),
  ('anthropic', 'Anthropic', true, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.llm_models (provider_id, model_id, label, enabled, cost_hint, sort_order)
SELECT * FROM (VALUES
  ('openai', 'gpt-4o-mini', 'GPT-4o mini', true, 'low', 1),
  ('openai', 'gpt-4o', 'GPT-4o', true, 'high', 2),
  ('anthropic', 'claude-3-5-haiku-latest', 'Claude 3.5 Haiku', true, 'low', 3),
  ('anthropic', 'claude-3-5-sonnet-latest', 'Claude 3.5 Sonnet', true, 'high', 4)
) AS v(provider_id, model_id, label, enabled, cost_hint, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_models m
  WHERE m.provider_id = v.provider_id AND m.model_id = v.model_id
);

-- Default platform task models
INSERT INTO public.platform_task_models (task, model_id)
SELECT v.task, m.id
FROM (VALUES
  ('help', 'openai', 'gpt-4o-mini'),
  ('space_ask', 'openai', 'gpt-4o-mini'),
  ('chat', 'openai', 'gpt-4o-mini'),
  ('chat_preview', 'openai', 'gpt-4o'),
  ('draft', 'openai', 'gpt-4o-mini'),
  ('measures', 'openai', 'gpt-4o-mini'),
  ('qc', 'openai', 'gpt-4o'),
  ('qc_default', 'openai', 'gpt-4o')
) AS v(task, provider_id, model_id)
JOIN public.llm_models m ON m.provider_id = v.provider_id AND m.model_id = v.model_id
ON CONFLICT (task) DO NOTHING;

-- Enable all catalog models for existing tenants
INSERT INTO public.tenant_llm_settings (tenant_id, model_id, enabled)
SELECT t.id, m.id, m.enabled
FROM public.tenants t
CROSS JOIN public.llm_models m
WHERE m.enabled = true
ON CONFLICT (tenant_id, model_id) DO NOTHING;

-- RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_task_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_llm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_llm_credentials ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = p_user_id
      AND tm.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND p.platform_role = 'super_admin'
  );
$$;

DROP POLICY IF EXISTS "Tenant members view tenant" ON public.tenants;
CREATE POLICY "Tenant members view tenant" ON public.tenants FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = tenants.id AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Super admin manage tenants" ON public.tenants;
CREATE POLICY "Super admin manage tenants" ON public.tenants FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant admins update tenant" ON public.tenants;
CREATE POLICY "Tenant admins update tenant" ON public.tenants FOR UPDATE
  USING (is_tenant_admin(tenants.id, auth.uid()))
  WITH CHECK (is_tenant_admin(tenants.id, auth.uid()));

DROP POLICY IF EXISTS "View tenant members" ON public.tenant_members;
CREATE POLICY "View tenant members" ON public.tenant_members FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR user_id = auth.uid()
    OR is_tenant_admin(tenant_id, auth.uid())
  );

DROP POLICY IF EXISTS "Tenant admins manage members" ON public.tenant_members;
CREATE POLICY "Tenant admins manage members" ON public.tenant_members FOR ALL
  USING (is_tenant_admin(tenant_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_tenant_admin(tenant_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone authenticated reads llm providers" ON public.llm_providers;
CREATE POLICY "Anyone authenticated reads llm providers" ON public.llm_providers FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Super admin manage llm providers" ON public.llm_providers;
CREATE POLICY "Super admin manage llm providers" ON public.llm_providers FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone authenticated reads llm models" ON public.llm_models;
CREATE POLICY "Anyone authenticated reads llm models" ON public.llm_models FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Super admin manage llm models" ON public.llm_models;
CREATE POLICY "Super admin manage llm models" ON public.llm_models FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone authenticated reads platform task models" ON public.platform_task_models;
CREATE POLICY "Anyone authenticated reads platform task models" ON public.platform_task_models FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Super admin manage platform task models" ON public.platform_task_models;
CREATE POLICY "Super admin manage platform task models" ON public.platform_task_models FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant members view tenant llm settings" ON public.tenant_llm_settings;
CREATE POLICY "Tenant members view tenant llm settings" ON public.tenant_llm_settings FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = tenant_llm_settings.tenant_id AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant admins manage tenant llm settings" ON public.tenant_llm_settings;
CREATE POLICY "Tenant admins manage tenant llm settings" ON public.tenant_llm_settings FOR ALL
  USING (is_tenant_admin(tenant_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_tenant_admin(tenant_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant admins view credentials" ON public.tenant_llm_credentials;
CREATE POLICY "Tenant admins view credentials" ON public.tenant_llm_credentials FOR SELECT
  USING (is_tenant_admin(tenant_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant admins manage credentials" ON public.tenant_llm_credentials;
CREATE POLICY "Tenant admins manage credentials" ON public.tenant_llm_credentials FOR ALL
  USING (is_tenant_admin(tenant_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_tenant_admin(tenant_id, auth.uid()) OR is_super_admin(auth.uid()));
