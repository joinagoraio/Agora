-- Fix space_members SELECT policy to allow admins to view all members

BEGIN;

-- Drop existing restrictive SELECT policies
DROP POLICY IF EXISTS "Direct user membership view" ON space_members;
DROP POLICY IF EXISTS "Users can view own memberships" ON space_members;

-- Create comprehensive SELECT policy
CREATE POLICY "Users can view space memberships"
  ON public.space_members
  FOR SELECT
  USING (
    -- Users can view their own membership
    user_id = auth.uid()
    OR
    -- Space admins/owners can view all members in their space
    public.is_space_admin(space_id, auth.uid())
    OR
    -- Space members can view all members in their space
    public.is_space_member(space_id, auth.uid())
  );

COMMIT;

-- Verify the new policy
SELECT 
  policyname,
  cmd,
  qual as using_clause
FROM pg_policies
WHERE tablename = 'space_members'
  AND cmd = 'SELECT';

DO $$
BEGIN
  RAISE NOTICE '✓ space_members SELECT policy updated';
  RAISE NOTICE '✓ Space admins can now view all members';
  RAISE NOTICE '✓ Space members can view other members';
END;
$$;

