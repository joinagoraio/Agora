-- Remember the order of a user's dashboard favorites.

ALTER TABLE public.dashboard_pins
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE public.dashboard_pins AS pins
SET sort_order = ranked.rn
FROM (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) - 1)::integer AS rn
  FROM public.dashboard_pins
) AS ranked
WHERE pins.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_dashboard_pins_user_sort
  ON public.dashboard_pins(user_id, sort_order ASC, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_pins TO authenticated;
