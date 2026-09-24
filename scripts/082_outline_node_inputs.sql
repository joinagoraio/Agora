-- What a chapter draws on when it is drafted, beyond its own sources:
-- 'measures' (the whole measure list), 'interests' (interest work-ups), 'coherence' (links across interests).
ALTER TABLE public.programme_outline_nodes
  ADD COLUMN IF NOT EXISTS draws_on text[] NOT NULL DEFAULT '{}';
