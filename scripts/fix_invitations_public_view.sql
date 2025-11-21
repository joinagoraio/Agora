-- Allow public (unauthenticated) viewing of invitations by token
-- This is needed so the invitation page can display invitation details
-- before the user signs up or logs in

BEGIN;

-- Drop all existing SELECT policies on invitations
DROP POLICY IF EXISTS "Space members can view invitations" ON invitations;
DROP POLICY IF EXISTS "Anyone can view invitations by token" ON invitations;
DROP POLICY IF EXISTS "Users can view invitations for their spaces" ON invitations;

-- Create new policy that allows public viewing by token
CREATE POLICY "Anyone can view invitations by token"
  ON public.invitations
  FOR SELECT
  USING (
    -- Anyone can view by token (for the invitation page)
    token IS NOT NULL
    OR
    -- Authenticated users who are space members can view
    (auth.uid() IS NOT NULL AND public.is_space_member(space_id, auth.uid()))
    OR 
    -- Authenticated users can view invitations sent to their email
    (auth.uid() IS NOT NULL AND email IN (SELECT email FROM public.profiles WHERE id = auth.uid()))
  );

COMMIT;

-- Verify the policy
SELECT 
  policyname,
  cmd,
  qual as policy_logic
FROM pg_policies
WHERE tablename = 'invitations'
  AND cmd = 'SELECT';

DO $$
BEGIN
  RAISE NOTICE '✓ Updated SELECT policy to allow public viewing by token';
  RAISE NOTICE '✓ Invitation page can now show details before authentication';
END;
$$;

