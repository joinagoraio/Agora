-- Allowed for Agora-key orgs requires the model to be enabled in the catalog.

UPDATE public.llm_models
SET default_for_tenants = false
WHERE enabled = false AND default_for_tenants = true;

ALTER TABLE public.llm_models
  DROP CONSTRAINT IF EXISTS llm_models_allowed_requires_enabled;

ALTER TABLE public.llm_models
  ADD CONSTRAINT llm_models_allowed_requires_enabled
  CHECK (NOT default_for_tenants OR enabled);
