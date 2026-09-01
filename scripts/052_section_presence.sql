-- F.4: lightweight section presence (also-open warning). Local apply only.

CREATE TABLE IF NOT EXISTS public.section_presence (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, section_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_section_presence_seen
  ON public.section_presence(workspace_id, section_key, last_seen_at DESC);

ALTER TABLE public.section_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view section presence" ON public.section_presence;
CREATE POLICY "Workspace members can view section presence"
  ON public.section_presence FOR SELECT
  USING (is_workspace_member(section_presence.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers can upsert section presence" ON public.section_presence;
CREATE POLICY "Workspace writers can upsert section presence"
  ON public.section_presence FOR INSERT
  WITH CHECK (is_workspace_writer(section_presence.workspace_id, auth.uid()) AND user_id = auth.uid());

DROP POLICY IF EXISTS "Workspace writers can update own section presence" ON public.section_presence;
CREATE POLICY "Workspace writers can update own section presence"
  ON public.section_presence FOR UPDATE
  USING (is_workspace_writer(section_presence.workspace_id, auth.uid()) AND user_id = auth.uid())
  WITH CHECK (is_workspace_writer(section_presence.workspace_id, auth.uid()) AND user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.section_presence TO authenticated;
