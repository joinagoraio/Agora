-- Chapter structures stay private to a programme until they are saved for other programmes.
-- Demo packs are platform data. A system administrator loads them; provinces do not see them as built-in content.

ALTER TABLE public.programme_templates
  ADD COLUMN IF NOT EXISTS shared boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.platform_demo_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  writing_language text NOT NULL DEFAULT 'en' CHECK (writing_language IN ('en', 'nl')),
  chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_demo_packs ENABLE ROW LEVEL SECURITY;
