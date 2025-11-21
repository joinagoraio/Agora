-- Fix permissions for sources table
-- This script grants necessary permissions and verifies RLS policies

-- Grant permissions to authenticated users
GRANT ALL ON public.sources TO authenticated;
GRANT ALL ON public.sources TO service_role;

-- Also grant permissions on related tables if needed
GRANT ALL ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;

-- Ensure RLS is enabled
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Workspace members can view sources" ON public.sources;
DROP POLICY IF EXISTS "Workspace members can create sources" ON public.sources;
DROP POLICY IF EXISTS "Creators and admins can update sources" ON public.sources;
DROP POLICY IF EXISTS "Creators and admins can delete sources" ON public.sources;

-- Recreate policies with proper permissions
CREATE POLICY "Workspace members can view sources"
  ON public.sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.space_members sm ON sm.space_id = w.space_id
      WHERE w.id = sources.workspace_id
      AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can create sources"
  ON public.sources FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.space_members sm ON sm.space_id = w.space_id
      WHERE w.id = sources.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin', 'member')
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Creators and admins can update sources"
  ON public.sources FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.space_members sm ON sm.space_id = w.space_id
      WHERE w.id = sources.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Creators and admins can delete sources"
  ON public.sources FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.space_members sm ON sm.space_id = w.space_id
      WHERE w.id = sources.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

-- Verify the setup
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  -- Check if policies exist
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'sources';
  
  IF policy_count >= 4 THEN
    RAISE NOTICE '✓ All RLS policies are configured (% policies found)', policy_count;
  ELSE
    RAISE WARNING '✗ Not all RLS policies are configured (only % policies found)', policy_count;
  END IF;
  
  -- Check if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sources') THEN
    RAISE NOTICE '✓ Table "sources" exists';
  ELSE
    RAISE WARNING '✗ Table "sources" does NOT exist';
  END IF;
  
  -- Check grants
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_name = 'sources'
    AND grantee = 'authenticated'
  ) THEN
    RAISE NOTICE '✓ Permissions granted to authenticated users';
  ELSE
    RAISE WARNING '✗ Permissions NOT granted to authenticated users';
  END IF;
END $$;

