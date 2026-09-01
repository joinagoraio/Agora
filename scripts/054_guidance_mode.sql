-- Guidance model S2/S4: per-user Guided | Expert preference.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS guidance_mode text NOT NULL DEFAULT 'guided';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_guidance_mode_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_guidance_mode_check CHECK (guidance_mode IN ('guided', 'expert'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expert_prompt_dismissed_at timestamptz;

COMMENT ON COLUMN public.profiles.guidance_mode IS 'Guided help rail open by default; expert keeps the rail closed.';
COMMENT ON COLUMN public.profiles.expert_prompt_dismissed_at IS 'When set, do not prompt the user to try Expert again.';
