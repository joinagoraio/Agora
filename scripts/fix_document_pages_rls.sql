-- Fix document_pages RLS policy to support both workspace and space members
-- 
-- Problem: The current policy only checks space_members, blocking workspace-only members
-- This causes 403 errors when trying to highlight text in documents
--
-- Solution: Use is_workspace_member() function which checks both workspace and space membership

BEGIN;

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Workspace members can view document pages" ON public.document_pages;

-- Create new policy that uses is_workspace_member()
-- This function checks:
-- 1. Direct workspace membership (workspace_members table)
-- 2. Space membership (space_members table)
-- 3. Workspace creator
CREATE POLICY "Workspace members can view document pages"
  ON public.document_pages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_pages.document_id
      AND public.is_workspace_member(d.workspace_id, auth.uid())
    )
  );

-- Verify the policy was created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'document_pages' 
    AND policyname = 'Workspace members can view document pages'
  ) THEN
    RAISE NOTICE '✓ document_pages SELECT policy updated successfully';
  ELSE
    RAISE EXCEPTION '✗ Failed to create document_pages SELECT policy';
  END IF;
END $$;

COMMIT;

-- Test the policy (optional - uncomment to test)
-- SELECT 
--   dp.id, 
--   dp.document_id, 
--   dp.page_number,
--   length(dp.text_content) as content_length
-- FROM public.document_pages dp
-- LIMIT 5;

