-- Cluster confidence, owner-approved topic summary, one pending appeal per comment.
-- Apply locally: psql "$DATABASE_URL" -f scripts/072_consultation_transparency.sql

ALTER TABLE public.consultation_clusters
  ADD COLUMN IF NOT EXISTS confidence real,
  ADD COLUMN IF NOT EXISTS owner_summary text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_status text;

CREATE TABLE IF NOT EXISTS public.consultation_topic_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.programme_consultations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publication_id uuid NOT NULL REFERENCES public.programme_publications(id) ON DELETE CASCADE,
  body_markdown text NOT NULL,
  ai_draft boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_topic_summaries_one
  ON public.consultation_topic_summaries(consultation_id);

CREATE INDEX IF NOT EXISTS idx_consultation_topic_summaries_publication
  ON public.consultation_topic_summaries(publication_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_appeals_one_pending
  ON public.consultation_appeals(comment_id)
  WHERE reviewed_at IS NULL;

ALTER TABLE public.consultation_topic_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members view topic summaries" ON public.consultation_topic_summaries;
CREATE POLICY "Workspace members view topic summaries" ON public.consultation_topic_summaries FOR SELECT
  USING (
    is_workspace_member(consultation_topic_summaries.workspace_id, auth.uid())
    OR published_at IS NOT NULL
  );

DROP POLICY IF EXISTS "Workspace writers insert topic summaries" ON public.consultation_topic_summaries;
CREATE POLICY "Workspace writers insert topic summaries" ON public.consultation_topic_summaries FOR INSERT
  WITH CHECK (is_workspace_writer(consultation_topic_summaries.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers update topic summaries" ON public.consultation_topic_summaries;
CREATE POLICY "Workspace writers update topic summaries" ON public.consultation_topic_summaries FOR UPDATE
  USING (is_workspace_writer(consultation_topic_summaries.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(consultation_topic_summaries.workspace_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.consultation_topic_summaries TO authenticated;
REVOKE DELETE ON public.consultation_topic_summaries FROM authenticated, anon;
