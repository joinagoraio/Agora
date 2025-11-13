-- Phase 1.5: Create Workspace Items Table
-- Stores items within workspaces (local items and inherited reference items)

CREATE TABLE IF NOT EXISTS public.workspace_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_space_item_id uuid REFERENCES public.space_items(id) ON DELETE SET NULL,
  inheritance text CHECK (inheritance IN ('reference', 'local')),
  classification text CHECK (classification IN ('public', 'internal', 'confidential')),
  payload jsonb NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_workspace_items_workspace_id ON public.workspace_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_items_source_space_item_id ON public.workspace_items(source_space_item_id);
CREATE INDEX IF NOT EXISTS idx_workspace_items_inheritance ON public.workspace_items(inheritance);
CREATE INDEX IF NOT EXISTS idx_workspace_items_classification ON public.workspace_items(classification);
CREATE INDEX IF NOT EXISTS idx_workspace_items_created_by ON public.workspace_items(created_by);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_workspace_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_workspace_items_updated_at ON public.workspace_items;
CREATE TRIGGER trigger_workspace_items_updated_at
  BEFORE UPDATE ON public.workspace_items
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_items_updated_at();

-- Add comments
COMMENT ON TABLE public.workspace_items IS 'Items within workspaces (local items and inherited reference items from parent spaces)';
COMMENT ON COLUMN public.workspace_items.source_space_item_id IS 'Reference to source space_item if inherited (null for local items)';
COMMENT ON COLUMN public.workspace_items.inheritance IS 'Inheritance type: reference (read-only from parent space) or local (created in workspace)';
COMMENT ON COLUMN public.workspace_items.classification IS 'Classification level: public, internal, or confidential';
COMMENT ON COLUMN public.workspace_items.payload IS 'Item content and metadata as JSON';
