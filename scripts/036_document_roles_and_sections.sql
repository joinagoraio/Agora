-- Phase 1: document roles, bibliographic fields, document sections
-- Tenant isolation: sections inherit access via parent documents.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS document_role text
    CHECK (document_role IS NULL OR document_role IN (
      'environmental_vision',
      'environmental_effects_report',
      'programme_handbook',
      'existing_policy',
      'housing_programme',
      'quality_style_rules',
      'other'
    )),
  ADD COLUMN IF NOT EXISTS adopting_body text,
  ADD COLUMN IF NOT EXISTS adoption_date date,
  ADD COLUMN IF NOT EXISTS validity_start date,
  ADD COLUMN IF NOT EXISTS validity_end date,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_document_role ON public.documents(document_role);
CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON public.documents(content_hash);

COMMENT ON COLUMN public.documents.document_role IS 'Programme corpus role (vision, effects report, handbook, etc.)';
COMMENT ON COLUMN public.documents.content_hash IS 'Hash for deduplication warnings';
COMMENT ON COLUMN public.documents.superseded_by IS 'Replacement document when status=superseded';

CREATE TABLE IF NOT EXISTS public.document_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 6),
  page_number integer NOT NULL CHECK (page_number > 0),
  start_offset integer NOT NULL DEFAULT 0,
  detection text NOT NULL DEFAULT 'numbered',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_sections_document ON public.document_sections(document_id);
CREATE INDEX IF NOT EXISTS idx_document_sections_workspace ON public.document_sections(workspace_id);

ALTER TABLE public.document_sections ENABLE ROW LEVEL SECURITY;

-- Baseline policies; 043_rls_harden_programme.sql replaces these with writer + document consistency checks.
DROP POLICY IF EXISTS "Workspace members can view document sections" ON public.document_sections;
CREATE POLICY "Workspace members can view document sections"
  ON public.document_sections FOR SELECT
  USING (is_workspace_member(document_sections.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace members can manage document sections" ON public.document_sections;
CREATE POLICY "Workspace members can manage document sections"
  ON public.document_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = document_sections.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = document_sections.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('admin', 'member')
    )
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_sections.document_id
        AND d.workspace_id = document_sections.workspace_id
    )
  );
