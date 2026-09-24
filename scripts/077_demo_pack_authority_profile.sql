-- Mission, description, and jurisdiction travel with a demo pack and are copied onto the authority when it is loaded.

ALTER TABLE public.platform_demo_packs
  ADD COLUMN IF NOT EXISTS mission text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS jurisdiction text;
