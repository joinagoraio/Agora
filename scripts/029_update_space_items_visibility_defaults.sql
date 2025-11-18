-- Update existing space_items to set visibility based on classification
-- This ensures existing data has proper visibility values

-- Set visibility to match classification for existing items
-- This is a reasonable default: public items should be visible, internal/confidential should be internal
UPDATE public.space_items
SET visibility = CASE 
  WHEN classification = 'public' THEN 'public'
  WHEN classification = 'internal' THEN 'internal'
  WHEN classification = 'confidential' THEN 'confidential'
  ELSE 'internal'
END
WHERE visibility IS NULL OR visibility = 'internal';

-- Verify the update
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM public.space_items
  WHERE visibility IS NULL;
  
  IF null_count > 0 THEN
    RAISE NOTICE 'Warning: % space_items still have NULL visibility', null_count;
  ELSE
    RAISE NOTICE 'Success: All space_items have visibility set';
  END IF;
END $$;

