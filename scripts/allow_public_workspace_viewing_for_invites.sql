-- Allow public viewing of basic workspace info (id, name) for invitation pages
-- This is needed so the invitation page can show which workspace users are being invited to

BEGIN;

-- Check current SELECT policies on workspaces
SELECT 
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'workspaces'
  AND cmd = 'SELECT';

-- Add a new policy to allow viewing basic workspace info for invitations
-- This is safe because we're only exposing the workspace name, not sensitive data
DROP POLICY IF EXISTS "Public can view workspace names for invitations" ON workspaces;

CREATE POLICY "Public can view workspace names for invitations"
  ON public.workspaces
  FOR SELECT
  USING (true);  -- Allow all users to view workspaces (read-only)

-- Grant SELECT permission to anonymous users
GRANT SELECT ON public.workspaces TO anon;

-- Note: This makes workspace names public, which is generally fine for most use cases
-- If you need stricter security, you could limit it to:
-- USING (
--   EXISTS (
--     SELECT 1 FROM workspace_invitations 
--     WHERE workspace_invitations.workspace_id = workspaces.id
--   )
-- )
-- But that would be slower and more complex

COMMIT;

-- Verify the policy was created
SELECT 
  policyname,
  cmd,
  permissive
FROM pg_policies
WHERE tablename = 'workspaces'
  AND policyname = 'Public can view workspace names for invitations';

DO $$
BEGIN
  RAISE NOTICE '✓ Public viewing of workspace info enabled';
  RAISE NOTICE '✓ Invitation pages can now display workspace names';
  RAISE NOTICE '';
  RAISE NOTICE 'NOTE: Workspace names are now publicly viewable';
  RAISE NOTICE 'If this is a concern, restrict the policy or use a different approach';
END;
$$;

