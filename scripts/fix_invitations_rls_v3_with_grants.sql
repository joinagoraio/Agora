-- Fix for invitations RLS - Version 3 with proper grants
-- This ensures the functions have proper permissions for authenticated users

BEGIN;

-- First, ensure the helper functions have proper grants
DO $$
DECLARE
  func_exists BOOLEAN;
BEGIN
  -- Check if is_space_admin exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'is_space_admin' 
      AND pronamespace = 'public'::regnamespace
  ) INTO func_exists;
  
  IF NOT func_exists THEN
    RAISE EXCEPTION 'Function is_space_admin does not exist. Run migration 032_helper_function_consistency.sql first.';
  END IF;
  
  -- Grant execute to authenticated users
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO service_role';
  
  -- Check if is_space_member exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'is_space_member' 
      AND pronamespace = 'public'::regnamespace
  ) INTO func_exists;
  
  IF NOT func_exists THEN
    RAISE EXCEPTION 'Function is_space_member does not exist. Run migration 032_helper_function_consistency.sql first.';
  END IF;
  
  -- Grant execute to authenticated users
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO service_role';
  
  RAISE NOTICE '✓ Granted EXECUTE permissions on helper functions';
END;
$$;

-- Drop existing invitations policies
DROP POLICY IF EXISTS "Users can view invitations for their spaces" ON invitations;
DROP POLICY IF EXISTS "Space admins can create invitations" ON invitations;
DROP POLICY IF EXISTS "Space admins can update invitations" ON invitations;
DROP POLICY IF EXISTS "Space admins can delete invitations" ON invitations;

-- Recreate invitations policies using the correct function signatures
-- Policy 1: Users can view invitations for spaces they're members of, or invitations sent to their email
CREATE POLICY "Users can view invitations for their spaces"
  ON public.invitations
  FOR SELECT
  USING (
    -- User is a member of the space
    public.is_space_member(space_id, auth.uid())
    OR 
    -- Invitation is sent to the user's email
    email IN (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

-- Policy 2: Space admins and owners can create invitations
CREATE POLICY "Space admins can create invitations"
  ON public.invitations
  FOR INSERT
  WITH CHECK (
    public.is_space_admin(space_id, auth.uid())
  );

-- Policy 3: Space admins and owners can update invitations
CREATE POLICY "Space admins can update invitations"
  ON public.invitations
  FOR UPDATE
  USING (
    public.is_space_admin(space_id, auth.uid())
  )
  WITH CHECK (
    public.is_space_admin(space_id, auth.uid())
  );

-- Policy 4: Space admins and owners can delete invitations
CREATE POLICY "Space admins can delete invitations"
  ON public.invitations
  FOR DELETE
  USING (
    public.is_space_admin(space_id, auth.uid())
  );

-- Verify policies are created
DO $$
DECLARE
  policy_count INTEGER;
  insert_policy_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'invitations';
  
  SELECT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invitations' 
      AND cmd = 'INSERT'
  ) INTO insert_policy_exists;
  
  RAISE NOTICE '✓ Total invitations policies: %', policy_count;
  
  IF policy_count < 4 THEN
    RAISE EXCEPTION 'Expected at least 4 policies for invitations table, found %', policy_count;
  END IF;
  
  IF NOT insert_policy_exists THEN
    RAISE EXCEPTION 'INSERT policy was not created!';
  END IF;
  
  RAISE NOTICE '✓ All policies verified';
END;
$$;

COMMIT;

-- Display final state
SELECT 
  policyname,
  cmd as operation,
  CASE 
    WHEN cmd = 'INSERT' THEN '← THIS CONTROLS INVITING'
    ELSE ''
  END as note
FROM pg_policies
WHERE tablename = 'invitations'
ORDER BY cmd, policyname;

-- Final verification
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FIX APPLIED SUCCESSFULLY ===';
  RAISE NOTICE '✓ Helper functions granted to authenticated role';
  RAISE NOTICE '✓ All 4 invitations policies created';
  RAISE NOTICE '✓ Using is_space_admin(space_id, auth.uid())';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Test from your app as a logged-in space owner';
  RAISE NOTICE '2. Go to Space Settings → Invitations';
  RAISE NOTICE '3. Try inviting a member';
  RAISE NOTICE '';
  RAISE NOTICE 'If still failing, check server logs for the actual error';
END;
$$;

