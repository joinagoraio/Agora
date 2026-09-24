-- Optional name for a saved prompt version. The saved time stays on created_at.

ALTER TABLE public.platform_prompt_versions
  ADD COLUMN IF NOT EXISTS name text;
