-- Where guided help sits: the side panel, or the bar under the tools.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS guidance_place text NOT NULL DEFAULT 'sidebar';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_guidance_place_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_guidance_place_check CHECK (guidance_place IN ('sidebar', 'strip'));
