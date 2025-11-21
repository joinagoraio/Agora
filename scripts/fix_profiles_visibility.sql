-- Fix profiles visibility for workspace/space members
-- This ensures profiles can be queried when fetching workspace_members or space_members

BEGIN;

-- Grant SELECT on profiles to authenticated and anon (already done in fix_workspace_invitations_complete.sql but ensuring)
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- Drop old profiles policies
DROP POLICY IF EXISTS "Users can view profiles of space members" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;

-- Create comprehensive profile viewing policy
CREATE POLICY "Users can view profiles"
  ON public.profiles
  FOR SELECT
  USING (
    -- User can see their own profile
    id = auth.uid()
    OR
    -- User can see profiles of people in their spaces
    EXISTS (
      SELECT 1 FROM space_members sm1
      WHERE sm1.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM space_members sm2
        WHERE sm2.space_id = sm1.space_id
        AND sm2.user_id = profiles.id
      )
    )
    OR
    -- User can see profiles of people in their workspaces
    EXISTS (
      SELECT 1 FROM workspace_members wm1
      WHERE wm1.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM workspace_members wm2
        WHERE wm2.workspace_id = wm1.workspace_id
        AND wm2.user_id = profiles.id
      )
    )
    OR
    -- User can see profiles of people who invited them
    EXISTS (
      SELECT 1 FROM workspace_invitations wi
      WHERE wi.invited_by = profiles.id
      AND wi.email IN (SELECT email FROM profiles WHERE id = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM invitations inv
      WHERE inv.invited_by = profiles.id
      AND inv.email IN (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

-- Verify policy created
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'profiles';
  
  IF policy_count < 1 THEN
    RAISE EXCEPTION 'Expected at least 1 profiles policy, found %', policy_count;
  END IF;
  
  RAISE NOTICE '✓ Created profiles viewing policy';
  RAISE NOTICE '  - Total profiles policies: %', policy_count;
END;
$$;

COMMIT;

-- Display policies
SELECT 
  'profiles' as table_name,
  policyname,
  cmd as operation
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '   PROFILES VISIBILITY FIX';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Fixed profiles RLS policies';
  RAISE NOTICE '✅ Granted SELECT permissions';
  RAISE NOTICE '';
  RAISE NOTICE 'Profiles are now visible to:';
  RAISE NOTICE '  • The user themselves';
  RAISE NOTICE '  • Space members in the same space';
  RAISE NOTICE '  • Workspace members in the same workspace';
  RAISE NOTICE '  • Users who received invitations';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Workspace members should now show email and name!';
  RAISE NOTICE '';
END;
$$;

