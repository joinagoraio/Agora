-- Long AI steps run as background jobs so they survive navigation and reloads.
ALTER TABLE public.programme_jobs
  DROP CONSTRAINT IF EXISTS programme_jobs_kind_check;
ALTER TABLE public.programme_jobs
  ADD CONSTRAINT programme_jobs_kind_check
  CHECK (kind IN ('fill', 'analysis', 'qc', 'consultation_cluster', 'workup', 'measures', 'coherence', 'roles', 'chapter'));
