-- Phase 9.3: playbook-selectable model tiers / citation strictness config

ALTER TABLE public.playbook_versions
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.playbook_versions.config IS
  'Playbook runtime config: { models: { chat, draft, measures, qc }, citationMode?: standard|strict }';
