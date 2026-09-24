-- Interests the vision names become the unit of work: each is worked up under the
-- programme structure's headings. Measures link to interests and carry staff decisions.

ALTER TABLE public.programme_templates
  ADD COLUMN IF NOT EXISTS workup_headings jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.programme_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  reference text,
  label text NOT NULL,
  summary text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  origin text NOT NULL DEFAULT 'extracted' CHECK (origin IN ('extracted', 'manual')),
  workup_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programme_interests_workspace ON public.programme_interests(workspace_id, sort_order);

ALTER TABLE public.programme_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members view interests" ON public.programme_interests;
CREATE POLICY "Workspace members view interests" ON public.programme_interests FOR SELECT
  USING (is_workspace_member(programme_interests.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers insert interests" ON public.programme_interests;
CREATE POLICY "Workspace writers insert interests" ON public.programme_interests FOR INSERT
  WITH CHECK (is_workspace_writer(programme_interests.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers update interests" ON public.programme_interests;
CREATE POLICY "Workspace writers update interests" ON public.programme_interests FOR UPDATE
  USING (is_workspace_writer(programme_interests.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_writer(programme_interests.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace writers delete interests" ON public.programme_interests;
CREATE POLICY "Workspace writers delete interests" ON public.programme_interests FOR DELETE
  USING (is_workspace_writer(programme_interests.workspace_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programme_interests TO authenticated;
REVOKE ALL ON public.programme_interests FROM anon;

ALTER TABLE public.programme_measures
  ADD COLUMN IF NOT EXISTS interest_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS challenge text,
  ADD COLUMN IF NOT EXISTS resources text,
  ADD COLUMN IF NOT EXISTS decision text CHECK (decision IS NULL OR decision IN ('keep', 'adapt', 'drop')),
  ADD COLUMN IF NOT EXISTS decision_reason text,
  ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS role_check jsonb;
