-- Keep each saved platform prompt so a worse edit can be restored.

CREATE TABLE IF NOT EXISTS public.platform_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id text NOT NULL REFERENCES public.platform_prompts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  body text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_id, version)
);

CREATE INDEX IF NOT EXISTS idx_platform_prompt_versions_prompt
  ON public.platform_prompt_versions(prompt_id, version DESC);

ALTER TABLE public.platform_prompt_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin manage platform prompt versions" ON public.platform_prompt_versions;
CREATE POLICY "Super admin manage platform prompt versions" ON public.platform_prompt_versions FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
