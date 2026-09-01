-- Phase F/G support: artefact comments, freeze, review assignment
-- Apply locally only.

CREATE TABLE IF NOT EXISTS public.programme_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  artefact_type text NOT NULL CHECK (artefact_type IN ('measure', 'outline_node', 'document', 'section')),
  artefact_id text NOT NULL,
  body text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programme_comments_workspace ON public.programme_comments(workspace_id, artefact_type, artefact_id);

CREATE TABLE IF NOT EXISTS public.programme_freezes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.programme_measures
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.programme_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_freezes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members view programme comments" ON public.programme_comments;
CREATE POLICY "Workspace members view programme comments" ON public.programme_comments FOR SELECT
  USING (is_workspace_member(programme_comments.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers insert programme comments" ON public.programme_comments;
CREATE POLICY "Workspace writers insert programme comments" ON public.programme_comments FOR INSERT
  WITH CHECK (is_workspace_writer(programme_comments.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers update programme comments" ON public.programme_comments;
CREATE POLICY "Workspace writers update programme comments" ON public.programme_comments FOR UPDATE
  USING (is_workspace_writer(programme_comments.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(programme_comments.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace members view programme freezes" ON public.programme_freezes;
CREATE POLICY "Workspace members view programme freezes" ON public.programme_freezes FOR SELECT
  USING (is_workspace_member(programme_freezes.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers insert programme freezes" ON public.programme_freezes;
CREATE POLICY "Workspace writers insert programme freezes" ON public.programme_freezes FOR INSERT
  WITH CHECK (is_workspace_writer(programme_freezes.workspace_id, auth.uid()));
