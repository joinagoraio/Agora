-- Per-user pins for dashboard programmes and authorities.

CREATE TABLE IF NOT EXISTS public.dashboard_pins (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_kind text NOT NULL CHECK (item_kind IN ('programme', 'authority')),
  item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_kind, item_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_pins_user
  ON public.dashboard_pins(user_id, created_at DESC);

ALTER TABLE public.dashboard_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own dashboard pins" ON public.dashboard_pins;
CREATE POLICY "Users manage own dashboard pins"
  ON public.dashboard_pins
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.dashboard_pins TO authenticated;
