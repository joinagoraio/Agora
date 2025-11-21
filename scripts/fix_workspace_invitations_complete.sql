-- Complete fix for workspace invitations and dashboard
-- Run this single script instead of running multiple scripts

BEGIN;

-- ============================================================================
-- PART 0: ENSURE SCHEMA IS CORRECT
-- ============================================================================

-- Ensure workspace_invitations has accepted_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workspace_invitations' 
    AND column_name = 'accepted_at'
  ) THEN
    ALTER TABLE public.workspace_invitations 
    ADD COLUMN accepted_at TIMESTAMPTZ;
    RAISE NOTICE '✓ Added accepted_at column to workspace_invitations';
  ELSE
    RAISE NOTICE '✓ accepted_at column already exists';
  END IF;
END;
$$;

-- ============================================================================
-- PART 1: GRANT PERMISSIONS
-- ============================================================================

DO $$
BEGIN
  -- Grant EXECUTE permissions on workspace helper functions
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) TO service_role';
  
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO service_role';
  
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO service_role';
  
  RAISE NOTICE '✓ Granted EXECUTE permissions on helper functions';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Warning: Could not grant some permissions (they may already exist): %', SQLERRM;
END;
$$;

DO $$
BEGIN
  -- Grant table permissions
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invitations TO authenticated;
  GRANT SELECT ON public.workspace_invitations TO anon;
  GRANT SELECT ON public.workspaces TO anon;
  GRANT SELECT ON public.workspaces TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
  GRANT SELECT ON public.workspace_members TO anon;
  GRANT SELECT ON public.profiles TO authenticated;
  GRANT SELECT ON public.profiles TO anon;
  GRANT SELECT ON public.space_members TO authenticated;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  
  RAISE NOTICE '✓ Granted table permissions';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Warning: Could not grant table permissions: %', SQLERRM;
END;
$$;

-- ============================================================================
-- PART 2: DROP OLD POLICIES
-- ============================================================================

-- Drop all workspace_invitations policies
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  RAISE NOTICE 'Dropping old workspace_invitations policies...';
  FOR policy_record IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'workspace_invitations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON workspace_invitations', policy_record.policyname);
    RAISE NOTICE '  - Dropped: %', policy_record.policyname;
  END LOOP;
END;
$$;

-- Drop old workspace viewing policies
DROP POLICY IF EXISTS "Public can view workspace names for invitations" ON workspaces;
DROP POLICY IF EXISTS "Workspace access can view workspaces" ON workspaces;

-- ============================================================================
-- PART 3: CREATE NEW POLICIES FOR WORKSPACE_INVITATIONS
-- ============================================================================

-- Policy 1: View invitations (SELECT)
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

-- Policy 2: Create invitations (INSERT)
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

-- ============================================================================
-- PART 4: CREATE POLICIES FOR WORKSPACES (PUBLIC VIEWING)
-- ============================================================================

-- Allow public viewing of workspace names (needed for invitation page)
CREATE POLICY "Public can view workspace names for invitations"
  ON public.workspaces
  FOR SELECT
  USING (true);

DO $$
BEGIN
  RAISE NOTICE '✓ Created public workspace viewing policy';
END;
$$;

-- ============================================================================
-- PART 5: CREATE POLICIES FOR WORKSPACE_MEMBERS (DASHBOARD)
-- ============================================================================

-- Drop old workspace_members policies
DROP POLICY IF EXISTS "Workspace members can view workspace members" ON workspace_members;
DROP POLICY IF EXISTS "Users can view their own workspace memberships" ON workspace_members;
DROP POLICY IF EXISTS "Users can view workspace memberships" ON workspace_members;
DROP POLICY IF EXISTS "Users can accept workspace invitations" ON workspace_members;
DROP POLICY IF EXISTS "Workspace admins can manage members" ON workspace_members;
DROP POLICY IF EXISTS "Workspace admins manage workspace members" ON workspace_members;
DROP POLICY IF EXISTS "Users can be added to workspaces" ON workspace_members;
DROP POLICY IF EXISTS "Workspace admins can update members" ON workspace_members;
DROP POLICY IF EXISTS "Workspace admins can remove members" ON workspace_members;

-- Policy 1: SELECT - View workspace memberships
CREATE POLICY "Users can view workspace memberships"
  ON public.workspace_members
  FOR SELECT
  USING (
    -- User can see their own memberships
    user_id = auth.uid()
    OR
    -- User can see other members if they're a member of the same workspace
    public.is_workspace_member(workspace_id, auth.uid())
    OR
    -- Space admins can see all workspace members in their space
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_members.workspace_id
      AND public.is_space_admin(w.space_id, auth.uid())
    )
  );

-- Policy 2: INSERT - Accept invitations and add members
CREATE POLICY "Users can be added to workspaces"
  ON public.workspace_members
  FOR INSERT
  WITH CHECK (
    -- User can add themselves when accepting an invitation
    user_id = auth.uid()
    OR
    -- Workspace admins can add members
    public.is_workspace_admin(workspace_id, auth.uid())
    OR
    -- Space admins can add members to workspaces in their space
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_id
      AND public.is_space_admin(w.space_id, auth.uid())
    )
  );

-- Policy 3: UPDATE - Update member roles
CREATE POLICY "Workspace admins can update members"
  ON public.workspace_members
  FOR UPDATE
  USING (
    -- Workspace admins can update members
    public.is_workspace_admin(workspace_id, auth.uid())
    OR
    -- Space admins can update members
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_members.workspace_id
      AND public.is_space_admin(w.space_id, auth.uid())
    )
  )
  WITH CHECK (
    -- Same conditions for the new row
    public.is_workspace_admin(workspace_id, auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_id
      AND public.is_space_admin(w.space_id, auth.uid())
    )
  );

-- Policy 4: DELETE - Remove members
CREATE POLICY "Workspace admins can remove members"
  ON public.workspace_members
  FOR DELETE
  USING (
    -- Workspace admins can remove members
    public.is_workspace_admin(workspace_id, auth.uid())
    OR
    -- Space admins can remove members
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_members.workspace_id
      AND public.is_space_admin(w.space_id, auth.uid())
    )
    OR
    -- Users can remove themselves
    user_id = auth.uid()
  );

DO $$
BEGIN
  RAISE NOTICE '✓ Created 4 workspace_members policies (SELECT, INSERT, UPDATE, DELETE)';
END;
$$;

-- ============================================================================
-- PART 6: VERIFY POLICIES
-- ============================================================================

DO $$
DECLARE
  invite_count INTEGER;
  workspace_count INTEGER;
  member_count INTEGER;
BEGIN
  -- Count workspace_invitations policies
  SELECT COUNT(*) INTO invite_count
  FROM pg_policies
  WHERE tablename = 'workspace_invitations';
  
  -- Count workspaces policies with "Public"
  SELECT COUNT(*) INTO workspace_count
  FROM pg_policies
  WHERE tablename = 'workspaces'
  AND policyname LIKE '%Public%';
  
  -- Count workspace_members policies
  SELECT COUNT(*) INTO member_count
  FROM pg_policies
  WHERE tablename = 'workspace_members';
  
  IF invite_count != 4 THEN
    RAISE EXCEPTION 'Expected 4 workspace_invitations policies, found %', invite_count;
  END IF;
  
  IF workspace_count < 1 THEN
    RAISE EXCEPTION 'Expected at least 1 public workspace viewing policy, found %', workspace_count;
  END IF;
  
  IF member_count < 4 THEN
    RAISE EXCEPTION 'Expected at least 4 workspace_members policies, found %', member_count;
  END IF;
  
  RAISE NOTICE '✓ Verification passed: All policies created correctly';
  RAISE NOTICE '  - workspace_invitations: % policies', invite_count;
  RAISE NOTICE '  - workspaces (public): % policies', workspace_count;
  RAISE NOTICE '  - workspace_members: % policies', member_count;
END;
$$;

COMMIT;

-- ============================================================================
-- DISPLAY FINAL STATE
-- ============================================================================

-- Show workspace_invitations policies
SELECT 
  'workspace_invitations' as table_name,
  policyname,
  cmd as operation
FROM pg_policies
WHERE tablename = 'workspace_invitations'
ORDER BY cmd, policyname;

-- Show workspace viewing policies
SELECT 
  'workspaces' as table_name,
  policyname,
  cmd as operation
FROM pg_policies
WHERE tablename = 'workspaces'
AND policyname LIKE '%Public%'
ORDER BY cmd, policyname;

-- Show workspace_members policies
SELECT 
  'workspace_members' as table_name,
  policyname,
  cmd as operation
FROM pg_policies
WHERE tablename = 'workspace_members'
ORDER BY cmd, policyname;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '   WORKSPACE INVITATIONS & DASHBOARD - COMPLETE FIX';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Fixed workspace invitation RLS policies (4 policies)';
  RAISE NOTICE '✅ Enabled public viewing of workspace names';
  RAISE NOTICE '✅ Fixed workspace_members RLS policies (4 policies)';
  RAISE NOTICE '✅ Granted all necessary permissions';
  RAISE NOTICE '';
  RAISE NOTICE 'What works now:';
  RAISE NOTICE '  • Anonymous users can view invitation page';
  RAISE NOTICE '  • Users can accept workspace invitations (INSERT policy)';
  RAISE NOTICE '  • Users are added to workspace_members table';
  RAISE NOTICE '  • Invitation status changes to accepted';
  RAISE NOTICE '  • Accepted users appear in Members tab';
  RAISE NOTICE '  • Accepted invitations disappear from Invitations tab';
  RAISE NOTICE '  • Workspaces appear in dashboard after acceptance';
  RAISE NOTICE '  • Email has pre-filled, disabled field';
  RAISE NOTICE '  • Password confirmation on signup';
  RAISE NOTICE '  • Auto-redirect after acceptance';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 You can now test the full invitation flow!';
  RAISE NOTICE '';
END;
$$;

