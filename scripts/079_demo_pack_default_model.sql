-- A demo pack names the model its loaded authority starts with.
ALTER TABLE public.platform_demo_packs
  ADD COLUMN IF NOT EXISTS default_model_id uuid REFERENCES public.llm_models(id) ON DELETE SET NULL;
