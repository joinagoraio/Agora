-- Colleague notes on the live draft: replies and common-note themes.
-- These are not consultation comments. Consultation stays on the published snapshot.
-- Apply locally: psql "$DATABASE_URL" -f scripts/073_programme_comment_threads.sql

ALTER TABLE public.programme_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.programme_comments(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.programme_comment_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label text NOT NULL,
  summary text,
  suggested_reply text,
  addressed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.programme_comments
  ADD COLUMN IF NOT EXISTS theme_id uuid REFERENCES public.programme_comment_themes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_programme_comments_parent
  ON public.programme_comments(parent_id);

CREATE INDEX IF NOT EXISTS idx_programme_comments_theme
  ON public.programme_comments(theme_id);

CREATE INDEX IF NOT EXISTS idx_programme_comment_themes_workspace
  ON public.programme_comment_themes(workspace_id);

ALTER TABLE public.programme_comment_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members view programme comment themes" ON public.programme_comment_themes;
CREATE POLICY "Workspace members view programme comment themes" ON public.programme_comment_themes FOR SELECT
  USING (is_workspace_member(programme_comment_themes.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers insert programme comment themes" ON public.programme_comment_themes;
CREATE POLICY "Workspace writers insert programme comment themes" ON public.programme_comment_themes FOR INSERT
  WITH CHECK (is_workspace_writer(programme_comment_themes.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers update programme comment themes" ON public.programme_comment_themes;
CREATE POLICY "Workspace writers update programme comment themes" ON public.programme_comment_themes FOR UPDATE
  USING (is_workspace_writer(programme_comment_themes.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(programme_comment_themes.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers delete programme comment themes" ON public.programme_comment_themes;
CREATE POLICY "Workspace writers delete programme comment themes" ON public.programme_comment_themes FOR DELETE
  USING (is_workspace_writer(programme_comment_themes.workspace_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programme_comment_themes TO authenticated;
REVOKE ALL ON public.programme_comment_themes FROM anon;
