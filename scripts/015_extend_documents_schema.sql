-- Phase 1.6: Extend Documents Table with classification and metadata fields
-- Adds tenant_id, publication_date, domain, municipality, and classification

-- First, check if we need to add tenant_id (for RLS)
-- We'll derive it from workspace.space_id, but store it for performance
ALTER TABLE public.documents 
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS publication_date date,
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS municipality text,
  ADD COLUMN IF NOT EXISTS classification text CHECK (classification IN ('public', 'internal', 'confidential'));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON public.documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_publication_date ON public.documents(publication_date);
CREATE INDEX IF NOT EXISTS idx_documents_domain ON public.documents(domain);
CREATE INDEX IF NOT EXISTS idx_documents_municipality ON public.documents(municipality);
CREATE INDEX IF NOT EXISTS idx_documents_classification ON public.documents(classification);

-- Populate tenant_id from workspace.space_id for existing documents
DO $$
BEGIN
  UPDATE public.documents d
  SET tenant_id = w.space_id
  FROM public.workspaces w
  WHERE d.workspace_id = w.id
  AND d.tenant_id IS NULL;
END $$;

-- Add comments
COMMENT ON COLUMN public.documents.tenant_id IS 'Tenant ID (space_id) for RLS performance (denormalized from workspace)';
COMMENT ON COLUMN public.documents.publication_date IS 'Publication date of the document';
COMMENT ON COLUMN public.documents.domain IS 'Domain tag for cross-domain organization';
COMMENT ON COLUMN public.documents.municipality IS 'Municipality associated with the document';
COMMENT ON COLUMN public.documents.classification IS 'Classification level: public, internal, or confidential';

