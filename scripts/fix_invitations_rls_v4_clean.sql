-- Fix for invitations RLS - Version 4 (Clean sweep)
-- This drops ALL old policies and creates fresh ones

BEGIN;

-- Grant EXECUTE permissions first
DO $$
BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_admin(uuid, uuid) TO service_role';
  
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO service_role';
END;
$$;

-- Drop ALL existing invitations policies (both old and new names)
DROP POLICY IF EXISTS "Users can view invitations for their spaces" ON invitations;
DROP POLICY IF EXISTS "Space admins can create invitations" ON invitations;
DROP POLICY IF EXISTS "Space admins can update invitations" ON invitations;
DROP POLICY IF EXISTS "Space admins can delete invitations" ON invitations;

-- Drop old policy names from previous migrations
DROP POLICY IF EXISTS "Admins can view invitations" ON invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON invitations;
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON invitations;
DROP POLICY IF EXISTS "Invitees can update their invitation" ON invitations;

-- Create fresh policies with correct logic
-- Policy 1: View invitations
CREATE POLICY "Space members can view invitations"
  ON public.invitations
  FOR SELECT
  USING (
    -- User is a member of the space
    public.is_space_member(space_id, auth.uid())
    OR 
    -- Invitation is sent to the user's email
    email IN (SELECT email FROM public.profiles WHERE id = auth.uid())
    OR
    -- Anyone can view by token (for accepting invitations)
    token IS NOT NULL
  );

-- Policy 2: Create invitations (THIS IS THE KEY ONE)
CREATE POLICY "Space admins can create invitations"
  ON public.invitations
  FOR INSERT
  WITH CHECK (
    public.is_space_admin(space_id, auth.uid())
  );

-- Policy 3: Update invitations
CREATE POLICY "Space admins and invitees can update invitations"
  ON public.invitations
  FOR UPDATE
  USING (
    -- Space admins can update any invitation
    public.is_space_admin(space_id, auth.uid())
    OR
    -- Invitees can update their own invitation (to accept/decline)
    email IN (SELECT email FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    -- Space admins can update any invitation
    public.is_space_admin(space_id, auth.uid())
    OR
    -- Invitees can update their own invitation (to accept/decline)
    email IN (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

-- Policy 4: Delete invitations
CREATE POLICY "Space admins can delete invitations"
  ON public.invitations
  FOR DELETE
  USING (
    public.is_space_admin(space_id, auth.uid())
  );

-- Verify no duplicate policies exist
DO $$
DECLARE
  insert_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO insert_count
  FROM pg_policies
  WHERE tablename = 'invitations' AND cmd = 'INSERT';
  
  SELECT COUNT(*) INTO total_count
  FROM pg_policies
  WHERE tablename = 'invitations';
  
  IF insert_count != 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 INSERT policy, found %', insert_count;
  END IF;
  
  IF total_count != 4 THEN
    RAISE EXCEPTION 'Expected exactly 4 total policies, found %', total_count;
  END IF;
  
  RAISE NOTICE '✓ Verification passed: 1 INSERT policy, 4 total policies';
END;
$$;

COMMIT;

-- Display final clean state
SELECT 
  policyname,
  cmd as operation,
  CASE 
    WHEN cmd = 'INSERT' THEN '← ONLY THIS ONE for inviting'
    ELSE ''
  END as note
FROM pg_policies
WHERE tablename = 'invitations'
ORDER BY cmd, policyname;

-- Final success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== INVITATIONS RLS FIXED ===';
  RAISE NOTICE '✓ Removed all old/duplicate policies';
  RAISE NOTICE '✓ Created 4 clean policies';
  RAISE NOTICE '✓ Exactly 1 INSERT policy using is_space_admin()';
  RAISE NOTICE '';
  RAISE NOTICE 'Test now from your app!';
END;
$$;

