-- S4: aggregate guidance events. No policy text, no document bodies.

CREATE TABLE IF NOT EXISTS public.guidance_telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  job text,
  mode text,
  section text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guidance_telemetry_user
  ON public.guidance_telemetry_events(user_id, created_at DESC);

ALTER TABLE public.guidance_telemetry_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own guidance telemetry" ON public.guidance_telemetry_events;
CREATE POLICY "Users insert own guidance telemetry" ON public.guidance_telemetry_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own guidance telemetry" ON public.guidance_telemetry_events;
CREATE POLICY "Users read own guidance telemetry" ON public.guidance_telemetry_events FOR SELECT
  USING (user_id = auth.uid());

GRANT SELECT, INSERT ON public.guidance_telemetry_events TO authenticated;
