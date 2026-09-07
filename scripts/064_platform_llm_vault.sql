-- Platform key vault, addable providers, default models for orgs, editable prompts.

ALTER TABLE public.llm_providers
  ADD COLUMN IF NOT EXISTS adapter text NOT NULL DEFAULT 'openai-compatible'
    CHECK (adapter IN ('openai-compatible', 'anthropic')),
  ADD COLUMN IF NOT EXISTS endpoint text;

UPDATE public.llm_providers
SET adapter = 'anthropic'
WHERE id = 'anthropic' AND adapter IS DISTINCT FROM 'anthropic';

ALTER TABLE public.llm_models
  ADD COLUMN IF NOT EXISTS default_for_tenants boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.platform_llm_credentials (
  provider_id text PRIMARY KEY REFERENCES public.llm_providers(id) ON DELETE CASCADE,
  encrypted_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_llm_credentials
  ADD COLUMN IF NOT EXISTS endpoint text;

CREATE TABLE IF NOT EXISTS public.platform_prompts (
  id text PRIMARY KEY,
  group_id text NOT NULL DEFAULT 'tools',
  label text NOT NULL,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_task_models (task, model_id)
SELECT v.task, m.id
FROM (VALUES
  ('summarize', 'openai', 'gpt-4o-mini'),
  ('query_rewrite', 'openai', 'gpt-4o-mini'),
  ('enhance', 'openai', 'gpt-4o-mini'),
  ('overheid_search', 'openai', 'gpt-4o-mini'),
  ('chat_title', 'openai', 'gpt-4o-mini')
) AS v(task, provider_id, model_id)
JOIN public.llm_models m ON m.provider_id = v.provider_id AND m.model_id = v.model_id
ON CONFLICT (task) DO NOTHING;

ALTER TABLE public.platform_llm_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin manage platform credentials" ON public.platform_llm_credentials;
CREATE POLICY "Super admin manage platform credentials" ON public.platform_llm_credentials FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read platform prompts" ON public.platform_prompts;
CREATE POLICY "Authenticated read platform prompts" ON public.platform_prompts FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Super admin manage platform prompts" ON public.platform_prompts;
CREATE POLICY "Super admin manage platform prompts" ON public.platform_prompts FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
