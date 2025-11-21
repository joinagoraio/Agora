-- Rollback profiles policy to allow viewing all profiles
-- This is a temporary fix - run this to restore member visibility

BEGIN;

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;

-- Create a simple policy that allows all authenticated users to view profiles
-- This is less secure but will make members visible again
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
  );

-- Verify
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'profiles'
  AND policyname = 'Authenticated users can view profiles';
  
  IF policy_count != 1 THEN
    RAISE EXCEPTION 'Policy was not created correctly';
  END IF;
  
  RAISE NOTICE '✓ Profiles policy restored';
END;
$$;

COMMIT;

-- Display policy
SELECT 
  'profiles' as table_name,
  policyname,
  cmd as operation
FROM pg_policies
WHERE tablename = 'profiles';

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '   PROFILES VISIBILITY - ROLLBACK';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Restored profiles visibility';
  RAISE NOTICE '✅ All authenticated users can now view profiles';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Note: This is less secure but members should appear now';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Refresh the workspace settings page to see members!';
  RAISE NOTICE '';
END;
$$;

