-- Add visibility column to space_items table
-- This column is used for controlling item visibility independently from classification

-- Check if visibility column already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'space_items' 
    AND column_name = 'visibility'
  ) THEN
    -- Add visibility column with default value
    ALTER TABLE public.space_items 
      ADD COLUMN visibility text CHECK (visibility IN ('public', 'internal', 'confidential')) DEFAULT 'internal';
    
    -- Create index for visibility queries
    CREATE INDEX IF NOT EXISTS idx_space_items_visibility 
      ON public.space_items(visibility);
    
    -- Update the composite index to include visibility
    DROP INDEX IF EXISTS idx_space_items_space_published;
    CREATE INDEX IF NOT EXISTS idx_space_items_space_published 
      ON public.space_items(space_id, item_type, classification, visibility)
      WHERE classification = 'public' OR visibility = 'public';
    
    -- Add comment
    COMMENT ON COLUMN public.space_items.visibility IS 'Visibility level: public (federated), internal (tenant only), or confidential. Can differ from classification.';
  END IF;
END $$;

