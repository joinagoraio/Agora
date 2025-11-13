-- Add slug column to spaces table if it doesn't exist
-- This ensures compatibility with the createSpace function

DO $$
BEGIN
  -- Check if slug column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'spaces' 
    AND column_name = 'slug'
  ) THEN
    -- Add slug column
    ALTER TABLE spaces ADD COLUMN slug TEXT;
    
    -- Generate slugs for existing spaces based on their names
    UPDATE spaces 
    SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
    WHERE slug IS NULL;
    
    -- Make slug NOT NULL and UNIQUE
    ALTER TABLE spaces 
      ALTER COLUMN slug SET NOT NULL,
      ADD CONSTRAINT spaces_slug_unique UNIQUE (slug);
    
    -- Create index for slug lookups
    CREATE INDEX IF NOT EXISTS idx_spaces_slug ON spaces(slug);
  END IF;
END $$;

COMMENT ON COLUMN spaces.slug IS 'URL-friendly identifier for the space';
