-- Consultation ledger: timed comment periods on published drafts.
-- Live editor programme_comments stay internal. This is the legal record.
-- Apply locally: psql "$DATABASE_URL" -f scripts/071_consultation_ledger.sql

CREATE TABLE IF NOT EXISTS public.programme_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publication_id uuid NOT NULL REFERENCES public.programme_publications(id) ON DELETE CASCADE,
  title text,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  closed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_programme_consultations_one_active
  ON public.programme_consultations(publication_id)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_programme_consultations_workspace
  ON public.programme_consultations(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.consultation_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.programme_consultations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publication_id uuid NOT NULL REFERENCES public.programme_publications(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  body text NOT NULL,
  quote_text text NOT NULL,
  quote_locator text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open',
      'in_discussion',
      'accepted',
      'accepted_with_modification',
      'rejected',
      'merged',
      'out_of_scope'
    )),
  cluster_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_comments_workspace_status
  ON public.consultation_comments(workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consultation_comments_consultation
  ON public.consultation_comments(consultation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consultation_comments_author
  ON public.consultation_comments(author_id, publication_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.consultation_comment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.consultation_comments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status text,
  to_status text NOT NULL
    CHECK (to_status IN (
      'open',
      'in_discussion',
      'accepted',
      'accepted_with_modification',
      'rejected',
      'merged',
      'out_of_scope'
    )),
  reason text,
  source text NOT NULL DEFAULT 'owner'
    CHECK (source IN ('owner', 'cluster', 'system')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_comment_events_comment
  ON public.consultation_comment_events(comment_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.consultation_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.consultation_comments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_replies_comment
  ON public.consultation_replies(comment_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.consultation_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.programme_consultations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label text NOT NULL,
  summary text,
  suggested_response text,
  suggested_status text
    CHECK (suggested_status IS NULL OR suggested_status IN (
      'accepted',
      'accepted_with_modification',
      'rejected',
      'merged',
      'out_of_scope',
      'in_discussion'
    )),
  member_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_clusters_consultation
  ON public.consultation_clusters(consultation_id, created_at DESC);

ALTER TABLE public.consultation_comments
  DROP CONSTRAINT IF EXISTS consultation_comments_cluster_id_fkey;
ALTER TABLE public.consultation_comments
  ADD CONSTRAINT consultation_comments_cluster_id_fkey
  FOREIGN KEY (cluster_id) REFERENCES public.consultation_clusters(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.consultation_cluster_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL UNIQUE REFERENCES public.consultation_comments(id) ON DELETE CASCADE,
  cluster_id uuid NOT NULL REFERENCES public.consultation_clusters(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consultation_embeddings (
  comment_id uuid PRIMARY KEY REFERENCES public.consultation_comments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  embedding vector(1536),
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consultation_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.consultation_comments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome text CHECK (outcome IS NULL OR outcome IN ('reopen', 'upheld'))
);

CREATE INDEX IF NOT EXISTS idx_consultation_appeals_comment
  ON public.consultation_appeals(comment_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.consultation_comments_protect_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body
    OR NEW.author_id IS DISTINCT FROM OLD.author_id
    OR NEW.quote_text IS DISTINCT FROM OLD.quote_text
    OR NEW.quote_locator IS DISTINCT FROM OLD.quote_locator
    OR NEW.consultation_id IS DISTINCT FROM OLD.consultation_id
    OR NEW.publication_id IS DISTINCT FROM OLD.publication_id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'consultation comments are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consultation_comments_protect_immutable ON public.consultation_comments;
CREATE TRIGGER consultation_comments_protect_immutable
  BEFORE UPDATE ON public.consultation_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.consultation_comments_protect_immutable();

CREATE OR REPLACE FUNCTION public.consultation_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'consultation events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS consultation_events_no_update ON public.consultation_comment_events;
CREATE TRIGGER consultation_events_no_update
  BEFORE UPDATE OR DELETE ON public.consultation_comment_events
  FOR EACH ROW
  EXECUTE FUNCTION public.consultation_events_append_only();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'programme_jobs'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.programme_jobs DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.programme_jobs
  DROP CONSTRAINT IF EXISTS programme_jobs_kind_check;
ALTER TABLE public.programme_jobs
  ADD CONSTRAINT programme_jobs_kind_check
  CHECK (kind IN ('fill', 'analysis', 'qc', 'consultation_cluster'));

ALTER TABLE public.programme_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_comment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_cluster_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_appeals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members view consultations" ON public.programme_consultations;
CREATE POLICY "Workspace members view consultations" ON public.programme_consultations FOR SELECT
  USING (is_workspace_member(programme_consultations.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers insert consultations" ON public.programme_consultations;
CREATE POLICY "Workspace writers insert consultations" ON public.programme_consultations FOR INSERT
  WITH CHECK (is_workspace_writer(programme_consultations.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers update consultations" ON public.programme_consultations;
CREATE POLICY "Workspace writers update consultations" ON public.programme_consultations FOR UPDATE
  USING (is_workspace_writer(programme_consultations.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(programme_consultations.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Authors or members view consultation comments" ON public.consultation_comments;
CREATE POLICY "Authors or members view consultation comments" ON public.consultation_comments FOR SELECT
  USING (
    author_id = auth.uid()
    OR is_workspace_member(consultation_comments.workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "Signed-in authors insert consultation comments" ON public.consultation_comments;
CREATE POLICY "Signed-in authors insert consultation comments" ON public.consultation_comments FOR INSERT
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Workspace writers update consultation comment status" ON public.consultation_comments;
CREATE POLICY "Workspace writers update consultation comment status" ON public.consultation_comments FOR UPDATE
  USING (is_workspace_writer(consultation_comments.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(consultation_comments.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Authors or members view consultation events" ON public.consultation_comment_events;
CREATE POLICY "Authors or members view consultation events" ON public.consultation_comment_events FOR SELECT
  USING (
    is_workspace_member(consultation_comment_events.workspace_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.consultation_comments c
      WHERE c.id = consultation_comment_events.comment_id
        AND c.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace writers insert consultation events" ON public.consultation_comment_events;
CREATE POLICY "Workspace writers insert consultation events" ON public.consultation_comment_events FOR INSERT
  WITH CHECK (is_workspace_writer(consultation_comment_events.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Authors or members view consultation replies" ON public.consultation_replies;
CREATE POLICY "Authors or members view consultation replies" ON public.consultation_replies FOR SELECT
  USING (
    author_id = auth.uid()
    OR is_workspace_member(consultation_replies.workspace_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.consultation_comments c
      WHERE c.id = consultation_replies.comment_id
        AND c.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authors or writers insert consultation replies" ON public.consultation_replies;
CREATE POLICY "Authors or writers insert consultation replies" ON public.consultation_replies FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (
      is_workspace_writer(consultation_replies.workspace_id, auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.consultation_comments c
        WHERE c.id = consultation_replies.comment_id
          AND c.author_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Workspace members view consultation clusters" ON public.consultation_clusters;
CREATE POLICY "Workspace members view consultation clusters" ON public.consultation_clusters FOR SELECT
  USING (is_workspace_member(consultation_clusters.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers mutate consultation clusters" ON public.consultation_clusters;
CREATE POLICY "Workspace writers mutate consultation clusters" ON public.consultation_clusters FOR INSERT
  WITH CHECK (is_workspace_writer(consultation_clusters.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers update consultation clusters" ON public.consultation_clusters;
CREATE POLICY "Workspace writers update consultation clusters" ON public.consultation_clusters FOR UPDATE
  USING (is_workspace_writer(consultation_clusters.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(consultation_clusters.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace members view cluster corrections" ON public.consultation_cluster_corrections;
CREATE POLICY "Workspace members view cluster corrections" ON public.consultation_cluster_corrections FOR SELECT
  USING (is_workspace_member(consultation_cluster_corrections.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers insert cluster corrections" ON public.consultation_cluster_corrections;
CREATE POLICY "Workspace writers insert cluster corrections" ON public.consultation_cluster_corrections FOR INSERT
  WITH CHECK (is_workspace_writer(consultation_cluster_corrections.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace members view consultation embeddings" ON public.consultation_embeddings;
CREATE POLICY "Workspace members view consultation embeddings" ON public.consultation_embeddings FOR SELECT
  USING (is_workspace_member(consultation_embeddings.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers insert consultation embeddings" ON public.consultation_embeddings;
CREATE POLICY "Workspace writers insert consultation embeddings" ON public.consultation_embeddings FOR INSERT
  WITH CHECK (is_workspace_writer(consultation_embeddings.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Authors or members view consultation appeals" ON public.consultation_appeals;
CREATE POLICY "Authors or members view consultation appeals" ON public.consultation_appeals FOR SELECT
  USING (
    author_id = auth.uid()
    OR is_workspace_member(consultation_appeals.workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "Authors insert consultation appeals" ON public.consultation_appeals;
CREATE POLICY "Authors insert consultation appeals" ON public.consultation_appeals FOR INSERT
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Workspace writers update consultation appeals" ON public.consultation_appeals;
CREATE POLICY "Workspace writers update consultation appeals" ON public.consultation_appeals FOR UPDATE
  USING (is_workspace_writer(consultation_appeals.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(consultation_appeals.workspace_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.programme_consultations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.consultation_comments TO authenticated;
GRANT SELECT, INSERT ON public.consultation_comment_events TO authenticated;
GRANT SELECT, INSERT ON public.consultation_replies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.consultation_clusters TO authenticated;
GRANT SELECT, INSERT ON public.consultation_cluster_corrections TO authenticated;
GRANT SELECT, INSERT ON public.consultation_embeddings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.consultation_appeals TO authenticated;

REVOKE DELETE ON public.programme_consultations FROM authenticated, anon;
REVOKE DELETE ON public.consultation_comments FROM authenticated, anon;
REVOKE DELETE ON public.consultation_comment_events FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.consultation_comment_events FROM authenticated, anon;
REVOKE DELETE ON public.consultation_replies FROM authenticated, anon;
REVOKE DELETE ON public.consultation_clusters FROM authenticated, anon;
REVOKE DELETE ON public.consultation_cluster_corrections FROM authenticated, anon;
REVOKE DELETE ON public.consultation_embeddings FROM authenticated, anon;
REVOKE DELETE ON public.consultation_appeals FROM authenticated, anon;
