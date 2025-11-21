-- Add missing columns to workspaces and spaces tables
-- This fixes the "Could not find the 'context' column" error

BEGIN;

-- =============================================================================
-- WORKSPACES TABLE
-- =============================================================================

-- Add missing fields to workspaces table
-- These fields are used to provide additional context to the AI
ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS context TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS summary TEXT;

-- Note: description column should already exist from the base schema

COMMENT ON COLUMN public.workspaces.summary IS 'Brief 1-2 sentence summary of the workspace purpose (similar to mission statement)';
COMMENT ON COLUMN public.workspaces.context IS 'Additional context for the workspace to help AI understand search criteria and domain';
COMMENT ON COLUMN public.workspaces.location IS 'Location associated with the workspace. Automatically included in searches when provided.';
COMMENT ON COLUMN public.workspaces.description IS 'Detailed description of the workspace (longer than summary, 4-6 sentences)';

-- =============================================================================
-- SPACES TABLE  
-- =============================================================================

-- Ensure spaces table has all extended columns from Phase 1.1
-- These support space_type, jurisdiction, visibility, metadata, and logo_url

-- Create enum types if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'space_type') THEN
    CREATE TYPE space_type AS ENUM ('national', 'regional', 'municipal', 'party', 'other');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visibility_type') THEN
    CREATE TYPE visibility_type AS ENUM ('public', 'internal', 'confidential');
  END IF;
END $$;

-- Add columns to spaces table if they don't exist
ALTER TABLE public.spaces 
ADD COLUMN IF NOT EXISTS space_type space_type DEFAULT 'municipal',
ADD COLUMN IF NOT EXISTS jurisdiction jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS visibility visibility_type DEFAULT 'internal',
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS description text;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_spaces_space_type ON public.spaces(space_type);
CREATE INDEX IF NOT EXISTS idx_spaces_visibility ON public.spaces(visibility);

-- Add comments
COMMENT ON COLUMN public.spaces.space_type IS 'Type of space: national, regional, municipal, party, or other';
COMMENT ON COLUMN public.spaces.jurisdiction IS 'Jurisdiction information as JSON (e.g., municipality name, region, etc.)';
COMMENT ON COLUMN public.spaces.visibility IS 'Visibility level: public (federated), internal (tenant only), or confidential';
COMMENT ON COLUMN public.spaces.metadata IS 'Additional metadata for the space (includes summary, description, timeframe, etc.)';
COMMENT ON COLUMN public.spaces.logo_url IS 'URL to the space logo/image';
COMMENT ON COLUMN public.spaces.description IS 'Description of the space';

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  workspace_columns TEXT[];
  space_columns TEXT[];
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '✅ MISSING COLUMNS ADDED';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
  
  -- Check workspaces columns
  SELECT ARRAY_AGG(column_name::TEXT ORDER BY column_name) INTO workspace_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'workspaces'
  AND column_name IN ('context', 'location', 'description', 'summary');
  
  RAISE NOTICE '📋 Workspaces table columns:';
  RAISE NOTICE '   ✓ %', ARRAY_TO_STRING(workspace_columns, ', ');
  RAISE NOTICE '   - summary: Brief 1-2 sentence overview';
  RAISE NOTICE '   - description: Detailed 4-6 sentence description';
  RAISE NOTICE '   - context: Additional AI context';
  RAISE NOTICE '   - location: Workspace location';
  RAISE NOTICE '';
  
  -- Check spaces columns
  SELECT ARRAY_AGG(column_name::TEXT ORDER BY column_name) INTO space_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'spaces'
  AND column_name IN ('space_type', 'jurisdiction', 'visibility', 'metadata', 'logo_url', 'description');
  
  RAISE NOTICE '📋 Spaces table columns:';
  RAISE NOTICE '   ✓ %', ARRAY_TO_STRING(space_columns, ', ');
  RAISE NOTICE '';
  
  RAISE NOTICE '✅ You can now edit workspace and space details without errors!';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Workspace fields:';
  RAISE NOTICE '   - Summary (AI-enhanced): Brief overview (1-2 sentences)';
  RAISE NOTICE '   - Description (AI-enhanced): Detailed description (4-6 sentences)';
  RAISE NOTICE '   - Context: Additional AI search context';
  RAISE NOTICE '   - Location: Workspace location';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Space fields:';
  RAISE NOTICE '   - Summary (AI-enhanced): Mission statement (1-2 sentences)';
  RAISE NOTICE '   - Description (AI-enhanced): Detailed description (4-6 sentences)';
  RAISE NOTICE '   - Type, Jurisdiction, Visibility, Metadata, Logo';
  RAISE NOTICE '';
END $$;

