-- Authority writing language. Generated prose follows this column.
-- Each person's interface language stays on profiles.language.

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS writing_language text NOT NULL DEFAULT 'en';

ALTER TABLE public.spaces
  DROP CONSTRAINT IF EXISTS spaces_writing_language_check;

ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_writing_language_check CHECK (writing_language IN ('en', 'nl'));

UPDATE public.spaces AS space
SET writing_language = CASE WHEN profile.language = 'nl' THEN 'nl' ELSE 'en' END
FROM public.profiles AS profile
WHERE space.owner_id = profile.id;

COMMENT ON COLUMN public.spaces.writing_language IS
  'Language of generated programme and authority text (en or nl). Interface language stays on the profile.';
