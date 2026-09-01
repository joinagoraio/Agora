-- G.8: published frozen snapshots (reading room). Not gazette enactment.
-- Tenant: space_id. Authority members SELECT; writers INSERT/UPDATE.
-- Unauthenticated public_listing / link+code reads go through server actions
-- with the service role after visibility, expiry, and code checks.

CREATE TABLE IF NOT EXISTS public.programme_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  freeze_id uuid NOT NULL REFERENCES public.programme_freezes(id) ON DELETE RESTRICT,
  title text NOT NULL,
  period_label text,
  citation text NOT NULL,
  visibility text NOT NULL DEFAULT 'permissioned'
    CHECK (visibility IN ('permissioned', 'link_code', 'public_listing')),
  access_code_hash text,
  expires_at timestamptz,
  body_markdown text NOT NULL DEFAULT '',
  content_hash text,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_programme_publications_workspace
  ON public.programme_publications(workspace_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_programme_publications_space
  ON public.programme_publications(space_id, published_at DESC)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_programme_publications_one_active
  ON public.programme_publications(workspace_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.programme_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authority members view programme publications" ON public.programme_publications;
CREATE POLICY "Authority members view programme publications" ON public.programme_publications FOR SELECT
  USING (is_space_member(programme_publications.space_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers insert programme publications" ON public.programme_publications;
CREATE POLICY "Workspace writers insert programme publications" ON public.programme_publications FOR INSERT
  WITH CHECK (is_workspace_writer(programme_publications.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers update programme publications" ON public.programme_publications;
CREATE POLICY "Workspace writers update programme publications" ON public.programme_publications FOR UPDATE
  USING (is_workspace_writer(programme_publications.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(programme_publications.workspace_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.programme_publications TO authenticated;
