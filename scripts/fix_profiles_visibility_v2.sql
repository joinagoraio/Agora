-- Fixed profiles visibility - simpler and working version
-- This allows workspace/space members to see each other's profiles

BEGIN;

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

-- Create a working policy that allows viewing profiles
-- Simple approach: authenticated users can view all profiles
-- This is the most practical for a collaborative platform
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow INSERT for profile creation (needed for signup)
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Allow UPDATE for own profile
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Verify policies created
DO $$
DECLARE
  select_count INTEGER;
  insert_count INTEGER;
  update_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO select_count
  FROM pg_policies
  WHERE tablename = 'profiles'
  AND cmd = 'SELECT';
  
  SELECT COUNT(*) INTO insert_count
  FROM pg_policies
  WHERE tablename = 'profiles'
  AND cmd = 'INSERT';
  
  SELECT COUNT(*) INTO update_count
  FROM pg_policies
  WHERE tablename = 'profiles'
  AND cmd = 'UPDATE';
  
  IF select_count < 1 THEN
    RAISE EXCEPTION 'Expected at least 1 SELECT policy for profiles, found %', select_count;
  END IF;
  
  RAISE NOTICE '✓ Created profiles policies:';
  RAISE NOTICE '  - SELECT policies: %', select_count;
  RAISE NOTICE '  - INSERT policies: %', insert_count;
  RAISE NOTICE '  - UPDATE policies: %', update_count;
END;
$$;

COMMIT;

-- Display all profiles policies
SELECT 
  'profiles' as table_name,
  policyname,
  cmd as operation,
  qual as using_expression
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '   PROFILES VISIBILITY - FIXED (V2)';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Fixed profiles RLS policies';
  RAISE NOTICE '✅ All authenticated users can view profiles';
  RAISE NOTICE '✅ Users can insert/update their own profile';
  RAISE NOTICE '';
  RAISE NOTICE 'This allows:';
  RAISE NOTICE '  • Workspace members to see each other';
  RAISE NOTICE '  • Space members to see each other';
  RAISE NOTICE '  • Profile display in member lists';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Members should now appear in workspace settings!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Refresh the workspace settings page';
  RAISE NOTICE '';
END;
$$;

