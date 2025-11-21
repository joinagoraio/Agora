-- Fix for invitations RLS policies
-- This ensures that space admins and owners can create invitations

BEGIN;

-- Drop existing invitations policies to recreate them
DROP POLICY IF EXISTS "Users can view invitations for their spaces" ON invitations;
DROP POLICY IF EXISTS "Space admins can create invitations" ON invitations;
DROP POLICY IF EXISTS "Space admins can update invitations" ON invitations;
DROP POLICY IF EXISTS "Space admins can delete invitations" ON invitations;

-- Ensure has_space_role function exists with correct signature
-- This function checks if the current user has a specific role or higher in a space
CREATE OR REPLACE FUNCTION public.has_space_role(p_space_id uuid, p_required_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the current authenticated user has the required role
  RETURN EXISTS (
    SELECT 1 
    FROM space_members
    WHERE space_id = p_space_id
      AND user_id = auth.uid()
      AND (
        -- If required role is 'owner', user must be owner
        CASE p_required_role
          WHEN 'owner' THEN role = 'owner'
          -- If required role is 'admin', user can be owner or admin
          WHEN 'admin' THEN role IN ('owner', 'admin')
          -- If required role is 'member', user can be owner, admin, or member
          WHEN 'member' THEN role IN ('owner', 'admin', 'member')
          -- If required role is 'viewer', any role is acceptable
          WHEN 'viewer' THEN role IN ('owner', 'admin', 'member', 'viewer')
          ELSE false
        END
      )
  );
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.has_space_role(uuid, text) TO authenticated;

-- Recreate invitations policies with better logic
-- Policy 1: Users can view invitations for spaces they're members of, or invitations sent to their email
CREATE POLICY "Users can view invitations for their spaces"
  ON public.invitations
  FOR SELECT
  USING (
    -- User is a member of the space
    public.has_space_role(space_id, 'viewer')
    OR 
    -- Invitation is sent to the user's email
    email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

-- Policy 2: Space admins and owners can create invitations
CREATE POLICY "Space admins can create invitations"
  ON public.invitations
  FOR INSERT
  WITH CHECK (
    public.has_space_role(space_id, 'admin')
  );

-- Policy 3: Space admins and owners can update invitations
CREATE POLICY "Space admins can update invitations"
  ON public.invitations
  FOR UPDATE
  USING (
    public.has_space_role(space_id, 'admin')
  );

-- Policy 4: Space admins and owners can delete invitations
CREATE POLICY "Space admins can delete invitations"
  ON public.invitations
  FOR DELETE
  USING (
    public.has_space_role(space_id, 'admin')
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
  RAISE NOTICE '✓ Invitations RLS policies have been fixed';
  RAISE NOTICE '✓ Space admins and owners can now create, update, and delete invitations';
  RAISE NOTICE '✓ Users can view invitations for their spaces or sent to their email';
END;
$$;

