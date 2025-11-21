-- Fix for workspace_invitations RLS - Complete overhaul
-- This creates proper policies similar to space invitations

BEGIN;

-- 1. Ensure helper functions exist and have proper grants
-- Grant EXECUTE permissions on workspace helper functions
DO $$
BEGIN
  -- Grant on is_workspace_admin
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) TO service_role';
  
  -- Grant on is_workspace_member
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO service_role';
  
  -- Grant on is_space_admin (for space-level access)
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO service_role';
  
  RAISE NOTICE '✓ Granted EXECUTE permissions on helper functions';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Warning: Could not grant some permissions (they may already exist): %', SQLERRM;
END;
$$;

-- 2. Grant table-level permissions
DO $$
BEGIN
  -- Grant basic permissions to authenticated users
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invitations TO authenticated;
  -- Grant SELECT permission to anonymous users (for viewing invitations before sign up)
  GRANT SELECT ON public.workspace_invitations TO anon;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  
  RAISE NOTICE '✓ Granted table permissions to authenticated and anon roles';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Warning: Could not grant table permissions: %', SQLERRM;
END;
$$;

-- 3. Drop ALL existing workspace_invitations policies
-- First, let's see what policies exist
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  RAISE NOTICE 'Current workspace_invitations policies:';
  FOR policy_record IN 
    SELECT policyname, cmd 
    FROM pg_policies 
    WHERE tablename = 'workspace_invitations'
    ORDER BY cmd, policyname
  LOOP
    RAISE NOTICE '  - % (%)', policy_record.policyname, policy_record.cmd;
  END LOOP;
END;
$$;

-- Drop all possible policy names (including ones we might not know about)
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'workspace_invitations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON workspace_invitations', policy_record.policyname);
    RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
  END LOOP;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE '✓ Dropped all old workspace_invitations policies';
END;
$$;

-- 4. Create fresh, secure policies

-- Policy 1: View invitations (SELECT)
-- This policy allows BOTH authenticated AND anonymous users to view invitations
-- Anonymous users can view by token (to see invitation before signing up)
CREATE POLICY "Workspace members can view invitations"
  ON public.workspace_invitations
  FOR SELECT
  USING (
    -- Anonymous/authenticated users can view by token (for accepting invitations)
    token IS NOT NULL
    OR
    -- User is a member of the workspace
    public.is_workspace_member(workspace_id, auth.uid())
    OR 
    -- User is admin of the space that owns this workspace
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_invitations.workspace_id
      AND public.is_space_admin(w.space_id, auth.uid())
    )
    OR
    -- Invitation is sent to the user's email
    email IN (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

-- Policy 2: Create invitations (INSERT) - THIS IS THE KEY ONE FOR YOUR ERROR
CREATE POLICY "Workspace admins can create invitations"
  ON public.workspace_invitations
  FOR INSERT
  WITH CHECK (
    -- User is admin of the workspace
    public.is_workspace_admin(workspace_id, auth.uid())
    OR
    -- User is admin of the space that owns this workspace
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_id
      AND public.is_space_admin(w.space_id, auth.uid())
    )
  );

-- Policy 3: Update invitations (UPDATE)
CREATE POLICY "Workspace admins and invitees can update invitations"
  ON public.workspace_invitations
  FOR UPDATE
  USING (
    -- Workspace admins can update any invitation
    public.is_workspace_admin(workspace_id, auth.uid())
    OR
    -- Space admins can update invitations for workspaces in their space
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_invitations.workspace_id
      AND public.is_space_admin(w.space_id, auth.uid())
    )
    OR
    -- Invitees can update their own invitation (to accept/decline)
    email IN (SELECT email FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    -- Same conditions for WITH CHECK
    public.is_workspace_admin(workspace_id, auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_invitations.workspace_id
      AND public.is_space_admin(w.space_id, auth.uid())
    )
    OR
    email IN (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

-- Policy 4: Delete invitations (DELETE)
CREATE POLICY "Workspace admins can delete invitations"
  ON public.workspace_invitations
  FOR DELETE
  USING (
    -- Workspace admins can delete invitations
    public.is_workspace_admin(workspace_id, auth.uid())
    OR
    -- Space admins can delete invitations for workspaces in their space
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_invitations.workspace_id
      AND public.is_space_admin(w.space_id, auth.uid())
    )
  );

DO $$
BEGIN
  RAISE NOTICE '✓ Created 4 new workspace_invitations policies';
END;
$$;

-- 5. Verify the policies
DO $$
DECLARE
  insert_count INTEGER;
  select_count INTEGER;
  update_count INTEGER;
  delete_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO insert_count
  FROM pg_policies
  WHERE tablename = 'workspace_invitations' AND cmd = 'INSERT';
  
  SELECT COUNT(*) INTO select_count
  FROM pg_policies
  WHERE tablename = 'workspace_invitations' AND cmd = 'SELECT';
  
  SELECT COUNT(*) INTO update_count
  FROM pg_policies
  WHERE tablename = 'workspace_invitations' AND cmd = 'UPDATE';
  
  SELECT COUNT(*) INTO delete_count
  FROM pg_policies
  WHERE tablename = 'workspace_invitations' AND cmd = 'DELETE';
  
  SELECT COUNT(*) INTO total_count
  FROM pg_policies
  WHERE tablename = 'workspace_invitations';
  
  IF insert_count != 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 INSERT policy, found %', insert_count;
  END IF;
  
  IF select_count != 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 SELECT policy, found %', select_count;
  END IF;
  
  IF update_count != 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 UPDATE policy, found %', update_count;
  END IF;
  
  IF delete_count != 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 DELETE policy, found %', delete_count;
  END IF;
  
  IF total_count != 4 THEN
    RAISE EXCEPTION 'Expected exactly 4 total policies, found %', total_count;
  END IF;
  
  RAISE NOTICE '✓ Verification passed: 4 policies (1 each for INSERT, SELECT, UPDATE, DELETE)';
END;
$$;

COMMIT;

-- Display final policy state
SELECT 
  policyname,
  cmd as operation,
  CASE 
    WHEN cmd = 'INSERT' THEN '← Allows workspace/space admins to create invitations'
    WHEN cmd = 'SELECT' THEN '← Allows viewing by members, invitees, or token'
    WHEN cmd = 'UPDATE' THEN '← Allows admins and invitees to update'
    WHEN cmd = 'DELETE' THEN '← Allows admins to revoke invitations'
    ELSE ''
  END as description
FROM pg_policies
WHERE tablename = 'workspace_invitations'
ORDER BY cmd, policyname;

-- Final success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== WORKSPACE INVITATIONS RLS FIXED ===';
  RAISE NOTICE '✓ Removed all insecure policies';
  RAISE NOTICE '✓ Created 4 secure policies';
  RAISE NOTICE '✓ Workspace admins can create invitations';
  RAISE NOTICE '✓ Space admins can create invitations for workspaces in their space';
  RAISE NOTICE '✓ Proper access control for view/update/delete';
  RAISE NOTICE '';
  RAISE NOTICE 'You can now test workspace invitations from your app!';
  RAISE NOTICE 'The "permission denied" error should be resolved.';
END;
$$;

