-- Tenant-wide LLM access policy, per-authority catalog overrides, and space API keys.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS llm_access_policy text;

UPDATE public.tenants
SET llm_access_policy = CASE
  WHEN llm_key_policy = 'allow_byok' THEN 'global_with_override'
  ELSE 'global'
END
WHERE llm_access_policy IS NULL;

ALTER TABLE public.tenants
  ALTER COLUMN llm_access_policy SET DEFAULT 'global';

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_llm_access_policy_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_llm_access_policy_check
  CHECK (llm_access_policy IN ('global', 'global_with_override', 'authority_only'));

ALTER TABLE public.tenants
  ALTER COLUMN llm_access_policy SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.tenant_llm_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id text NOT NULL REFERENCES public.llm_providers(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_id)
);

CREATE TABLE IF NOT EXISTS public.space_llm_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  provider_id text NOT NULL REFERENCES public.llm_providers(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, provider_id)
);

CREATE TABLE IF NOT EXISTS public.space_llm_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES public.llm_models(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, model_id)
);

CREATE TABLE IF NOT EXISTS public.space_llm_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  provider_id text NOT NULL REFERENCES public.llm_providers(id) ON DELETE CASCADE,
  encrypted_key text NOT NULL,
  endpoint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, provider_id)
);

ALTER TABLE public.tenant_llm_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_llm_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_llm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_llm_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members view tenant llm provider settings" ON public.tenant_llm_provider_settings;
CREATE POLICY "Tenant members view tenant llm provider settings" ON public.tenant_llm_provider_settings FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = tenant_llm_provider_settings.tenant_id AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant admins manage tenant llm provider settings" ON public.tenant_llm_provider_settings;
CREATE POLICY "Tenant admins manage tenant llm provider settings" ON public.tenant_llm_provider_settings FOR ALL
  USING (is_tenant_admin(tenant_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_tenant_admin(tenant_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Space members view space llm provider settings" ON public.space_llm_provider_settings;
CREATE POLICY "Space members view space llm provider settings" ON public.space_llm_provider_settings FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR is_space_admin(space_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.space_members sm
      WHERE sm.space_id = space_llm_provider_settings.space_id AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Space admins manage space llm provider settings" ON public.space_llm_provider_settings;
CREATE POLICY "Space admins manage space llm provider settings" ON public.space_llm_provider_settings FOR ALL
  USING (is_space_admin(space_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_space_admin(space_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Space members view space llm settings" ON public.space_llm_settings;
CREATE POLICY "Space members view space llm settings" ON public.space_llm_settings FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR is_space_admin(space_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.space_members sm
      WHERE sm.space_id = space_llm_settings.space_id AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Space admins manage space llm settings" ON public.space_llm_settings;
CREATE POLICY "Space admins manage space llm settings" ON public.space_llm_settings FOR ALL
  USING (is_space_admin(space_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_space_admin(space_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Space admins view space llm credentials" ON public.space_llm_credentials;
CREATE POLICY "Space admins view space llm credentials" ON public.space_llm_credentials FOR SELECT
  USING (is_space_admin(space_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Space admins manage space llm credentials" ON public.space_llm_credentials;
CREATE POLICY "Space admins manage space llm credentials" ON public.space_llm_credentials FOR ALL
  USING (is_space_admin(space_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_space_admin(space_id, auth.uid()) OR is_super_admin(auth.uid()));
