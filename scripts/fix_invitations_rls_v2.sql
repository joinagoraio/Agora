-- Fix for invitations RLS policies - Updated Version
-- This uses the modern is_space_admin function instead of has_space_role

BEGIN;

-- Drop existing invitations policies
DROP POLICY IF EXISTS "Users can view invitations for their spaces" ON invitations;
DROP POLICY IF EXISTS "Space admins can create invitations" ON invitations;
DROP POLICY IF EXISTS "Space admins can update invitations" ON invitations;
DROP POLICY IF EXISTS "Space admins can delete invitations" ON invitations;

-- Note: We don't need to recreate is_space_admin and is_space_member functions
-- They already exist from migration 032_helper_function_consistency.sql
-- and are used by many other policies throughout the system.

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
    email = (SELECT email FROM public.profiles WHERE id = auth.uid())
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
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'invitations';
  
  RAISE NOTICE 'Total invitations policies: %', policy_count;
  
  IF policy_count < 4 THEN
    RAISE EXCEPTION 'Expected at least 4 policies for invitations table, found %', policy_count;
  END IF;
END;
$$;

COMMIT;

-- Display final state
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN with_check IS NOT NULL THEN 'WITH CHECK'
    WHEN qual IS NOT NULL THEN 'USING'
    ELSE 'N/A'
  END as clause_type
FROM pg_policies
WHERE tablename = 'invitations'
ORDER BY policyname;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✓ Invitations RLS policies have been fixed (v2)';
  RAISE NOTICE '✓ Using modern is_space_admin() function';
  RAISE NOTICE '✓ Space admins and owners can now create, update, and delete invitations';
  RAISE NOTICE '✓ Users can view invitations for their spaces or sent to their email';
END;
$$;

