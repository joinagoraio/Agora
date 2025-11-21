-- Quick cleanup script to remove the old "ALL" policy
-- Run this if you're getting conflicts with workspace_members policies

-- Drop the old ALL policy
DROP POLICY IF EXISTS "Workspace admins manage workspace members" ON workspace_members;

-- Verify remaining policies
SELECT 
  policyname,
  cmd as operation
FROM pg_policies
WHERE tablename = 'workspace_members'
ORDER BY cmd, policyname;

-- Expected result: 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- Should NOT have any "ALL" operation policies

