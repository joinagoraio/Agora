-- Phase 1.1: Extend Spaces Table with Amendment A1 fields
-- Adds space_type, jurisdiction, visibility, metadata, and logo_url

-- Create enum types
DO $$ 
BEGIN
  -- Create space_type enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'space_type') THEN
    CREATE TYPE space_type AS ENUM ('national', 'regional', 'municipal', 'party', 'other');
  END IF;
  
  -- Create visibility_type enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visibility_type') THEN
    CREATE TYPE visibility_type AS ENUM ('public', 'internal', 'confidential');
  END IF;
END $$;

-- Alter spaces table to add new columns
ALTER TABLE public.spaces 
  ADD COLUMN IF NOT EXISTS space_type space_type DEFAULT 'municipal',
  ADD COLUMN IF NOT EXISTS jurisdiction jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visibility visibility_type DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_spaces_space_type ON public.spaces(space_type);
CREATE INDEX IF NOT EXISTS idx_spaces_visibility ON public.spaces(visibility);

-- Add comments
COMMENT ON COLUMN public.spaces.space_type IS 'Type of space: national, regional, municipal, party, or other';
COMMENT ON COLUMN public.spaces.jurisdiction IS 'Jurisdiction information as JSON (e.g., municipality name, region, etc.)';
COMMENT ON COLUMN public.spaces.visibility IS 'Visibility level: public (federated), internal (tenant only), or confidential';
COMMENT ON COLUMN public.spaces.metadata IS 'Additional metadata for the space';
COMMENT ON COLUMN public.spaces.logo_url IS 'URL to the space logo/image';
