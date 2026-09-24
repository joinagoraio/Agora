-- Sidebar and top strip are separate guidance switches.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS guidance_sidebar boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS guidance_strip boolean NOT NULL DEFAULT false;

UPDATE public.profiles
SET guidance_sidebar = true
WHERE guidance_place = 'sidebar' AND guidance_sidebar = false AND guidance_strip = false;

UPDATE public.profiles
SET guidance_strip = true
WHERE guidance_place = 'strip' AND guidance_sidebar = false AND guidance_strip = false;
