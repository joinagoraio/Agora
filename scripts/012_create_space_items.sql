-- Phase 1.3: Create Space Items Table
-- Stores publishable artifacts in spaces (policies, documents, answers, notes)

CREATE TABLE IF NOT EXISTS public.space_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('policy', 'document', 'answer', 'note')),
  classification text CHECK (classification IN ('public', 'internal', 'confidential')),
  payload jsonb NOT NULL DEFAULT '{}',
  source_url text,
  source_doc_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  source_page integer,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_space_items_space_id ON public.space_items(space_id);
CREATE INDEX IF NOT EXISTS idx_space_items_item_type ON public.space_items(item_type);
CREATE INDEX IF NOT EXISTS idx_space_items_classification ON public.space_items(classification);
CREATE INDEX IF NOT EXISTS idx_space_items_created_by ON public.space_items(created_by);
CREATE INDEX IF NOT EXISTS idx_space_items_source_doc_id ON public.space_items(source_doc_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_space_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_space_items_updated_at ON public.space_items;
CREATE TRIGGER trigger_space_items_updated_at
  BEFORE UPDATE ON public.space_items
  FOR EACH ROW
  EXECUTE FUNCTION update_space_items_updated_at();

-- Add comments
COMMENT ON TABLE public.space_items IS 'Publishable artifacts within spaces (policies, documents, answers, notes)';
COMMENT ON COLUMN public.space_items.item_type IS 'Type of item: policy, document, answer, or note';
COMMENT ON COLUMN public.space_items.classification IS 'Classification level: public, internal, or confidential';
COMMENT ON COLUMN public.space_items.payload IS 'Item content and metadata as JSON';
COMMENT ON COLUMN public.space_items.source_url IS 'Source URL for provenance';
COMMENT ON COLUMN public.space_items.source_doc_id IS 'Reference to source document if applicable';
COMMENT ON COLUMN public.space_items.source_page IS 'Page number in source document if applicable';

