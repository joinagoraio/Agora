-- Fix space_members RLS to allow invitation acceptance
-- Users accepting invitations need to be able to add themselves to space_members

BEGIN;

-- Check current policies on space_members
SELECT 
  policyname,
  cmd,
  with_check
FROM pg_policies
WHERE tablename = 'space_members'
  AND cmd = 'INSERT';

-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Space admins can add members" ON space_members;
DROP POLICY IF EXISTS "Users can join via invitation" ON space_members;

-- Recreate INSERT policy that allows both:
-- 1. Space admins adding members directly
-- 2. Users adding themselves when they have a valid invitation
CREATE POLICY "Space admins and invited users can add members"
  ON public.space_members
  FOR INSERT
  WITH CHECK (
    -- Space admins can add any member
    public.is_space_admin(space_id, auth.uid())
    OR
    -- Users can add themselves if they have a valid, pending invitation
    (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 
        FROM invitations 
        WHERE invitations.space_id = space_members.space_id
          AND invitations.email IN (SELECT email FROM profiles WHERE id = auth.uid())
          AND invitations.accepted_at IS NULL
          AND invitations.expires_at > NOW()
      )
    )
  );

COMMIT;

-- Verify the policy
SELECT 
  policyname,
  cmd,
  with_check
FROM pg_policies
WHERE tablename = 'space_members'
  AND cmd = 'INSERT';

DO $$
BEGIN
  RAISE NOTICE '✓ space_members INSERT policy updated';
  RAISE NOTICE '✓ Users can now accept invitations and join spaces';
  RAISE NOTICE '✓ Space admins can still add members directly';
END;
$$;

