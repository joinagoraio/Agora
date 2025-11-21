-- Fix profiles RLS to allow workspace_comments to join with author profiles
-- This is the missing piece!

BEGIN;

-- Drop restrictive policies
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON profiles;

-- Create a simple, working policy for a collaborative platform
-- Authenticated users can view all profiles (needed for author joins)
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Keep INSERT and UPDATE policies for profile management
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

COMMIT;

-- Verify
SELECT 
  'profiles' as table_name,
  policyname,
  cmd as operation
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

DO $$
DECLARE
  select_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO select_count
  FROM pg_policies
  WHERE tablename = 'profiles'
  AND cmd = 'SELECT';
  
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '✅ PROFILES RLS FIXED FOR WORKSPACE COMMENTS';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'SELECT policies: %', select_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Authenticated users can now:';
  RAISE NOTICE '  ✓ View all profiles (for author information)';
  RAISE NOTICE '  ✓ Join workspace_comments with profiles';
  RAISE NOTICE '  ✓ See member names and emails';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Refresh your browser (Cmd+Shift+R)';
  RAISE NOTICE '  2. workspace_comments error should be GONE!';
  RAISE NOTICE '';
END;
$$;

