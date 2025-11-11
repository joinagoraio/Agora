-- Add document_pages table for PDF page-level text and coordinates
-- This enables precise highlighting of text sections in PDFs

CREATE TABLE IF NOT EXISTS public.document_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  text_content TEXT,
  text_items JSONB DEFAULT '[]'::jsonb, -- Array of {text, x, y, width, height, fontSize, fontName}
  character_offsets JSONB DEFAULT '{}'::jsonb, -- Map of character positions to text items for highlighting
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, page_number)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_pages_document_id ON public.document_pages(document_id);
CREATE INDEX IF NOT EXISTS idx_document_pages_page_number ON public.document_pages(document_id, page_number);

-- Enable RLS
ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Same access as documents
CREATE POLICY "Workspace members can view document pages"
  ON public.document_pages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN workspaces w ON w.id = d.workspace_id
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE d.id = document_pages.document_id
      AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert document pages"
  ON public.document_pages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update document pages"
  ON public.document_pages FOR UPDATE
  USING (true);

CREATE POLICY "System can delete document pages"
  ON public.document_pages FOR DELETE
  USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_document_pages_updated_at 
  BEFORE UPDATE ON public.document_pages
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

