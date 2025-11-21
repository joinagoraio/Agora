-- Comprehensive diagnostic for invitations permission issue
-- Run this to see exactly what's blocking the invitation creation

-- 1. Check if you're logged in
SELECT 
  auth.uid() as your_user_id,
  CASE 
    WHEN auth.uid() IS NULL THEN '❌ NOT LOGGED IN'
    ELSE '✅ Logged in'
  END as auth_status;

-- 2. Get your email and profile info
SELECT 
  id,
  email,
  full_name
FROM profiles
WHERE id = auth.uid();

-- 3. Check what spaces you're a member of and your roles
SELECT 
  s.id as space_id,
  s.name as space_name,
  sm.role as your_role,
  CASE 
    WHEN sm.role IN ('owner', 'admin') THEN '✅ CAN INVITE'
    ELSE '❌ CANNOT INVITE (need admin/owner)'
  END as invitation_permission
FROM spaces s
JOIN space_members sm ON s.id = sm.space_id
WHERE sm.user_id = auth.uid()
ORDER BY s.name;

-- 4. Test the is_space_admin function for each of your spaces
SELECT 
  s.id as space_id,
  s.name as space_name,
  sm.role as your_role,
  public.is_space_admin(s.id, auth.uid()) as is_admin_result,
  public.is_space_member(s.id, auth.uid()) as is_member_result
FROM spaces s
JOIN space_members sm ON s.id = sm.space_id
WHERE sm.user_id = auth.uid()
ORDER BY s.name;

-- 5. Check current invitations policies
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd as operation,
  CASE 
    WHEN cmd = 'INSERT' THEN '🔍 This controls CREATE invitations'
    WHEN cmd = 'SELECT' THEN '🔍 This controls VIEW invitations'
    WHEN cmd = 'UPDATE' THEN '🔍 This controls UPDATE invitations'
    WHEN cmd = 'DELETE' THEN '🔍 This controls DELETE invitations'
  END as description,
  qual as using_clause,
  with_check as with_check_clause
FROM pg_policies
WHERE tablename = 'invitations'
ORDER BY cmd, policyname;

-- 6. Check if RLS is enabled on invitations table
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN '✅ RLS is ON (policies are enforced)'
    ELSE '⚠️ RLS is OFF (policies ignored)'
  END as status
FROM pg_tables
WHERE tablename = 'invitations'
  AND schemaname = 'public';

-- 7. Check helper functions exist
SELECT 
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as parameters,
  p.prosecdef as is_security_definer,
  CASE 
    WHEN p.prosecdef THEN '✅ SECURITY DEFINER (can bypass RLS)'
    ELSE '⚠️ Not security definer'
  END as security_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname IN ('is_space_admin', 'is_space_member')
  AND n.nspname = 'public'
ORDER BY p.proname;

-- 8. Test policy simulation (replace SPACE_ID with actual space where you're admin)
-- Uncomment and replace the space_id to test:
/*
DO $$
DECLARE
  test_space_id UUID := 'PASTE-YOUR-SPACE-ID-HERE'::uuid;
  can_insert BOOLEAN;
BEGIN
  -- Test if the policy would allow insert
  SELECT public.is_space_admin(test_space_id, auth.uid()) INTO can_insert;
  
  RAISE NOTICE 'Space ID: %', test_space_id;
  RAISE NOTICE 'Your User ID: %', auth.uid();
  RAISE NOTICE 'is_space_admin() returns: %', can_insert;
  
  IF can_insert THEN
    RAISE NOTICE '✅ Policy SHOULD allow you to create invitations';
  ELSE
    RAISE NOTICE '❌ Policy will BLOCK you from creating invitations';
    RAISE NOTICE '   Reason: is_space_admin() returned FALSE';
  END IF;
END;
$$;
*/

-- 9. Check if there are any existing invitations you can see
SELECT 
  COUNT(*) as visible_invitations,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ You can see some invitations (SELECT works)'
    ELSE 'ℹ️ No invitations visible (might be none exist, or SELECT policy blocking)'
  END as status
FROM invitations;

-- 10. Summary
DO $$
DECLARE
  user_count INTEGER;
  space_count INTEGER;
  admin_count INTEGER;
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM profiles WHERE id = auth.uid();
  SELECT COUNT(*) INTO space_count FROM space_members WHERE user_id = auth.uid();
  SELECT COUNT(*) INTO admin_count FROM space_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin');
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'invitations' AND cmd = 'INSERT';
  
  RAISE NOTICE '=== DIAGNOSTIC SUMMARY ===';
  RAISE NOTICE 'Logged in: %', CASE WHEN user_count > 0 THEN '✅ YES' ELSE '❌ NO' END;
  RAISE NOTICE 'Member of % space(s)', space_count;
  RAISE NOTICE 'Admin/Owner of % space(s)', admin_count;
  RAISE NOTICE 'INSERT policies on invitations: %', policy_count;
  
  IF user_count = 0 THEN
    RAISE NOTICE '❌ PROBLEM: Not logged in or profile missing';
  ELSIF space_count = 0 THEN
    RAISE NOTICE '❌ PROBLEM: Not a member of any spaces';
  ELSIF admin_count = 0 THEN
    RAISE NOTICE '❌ PROBLEM: Not an admin/owner of any spaces';
  ELSIF policy_count = 0 THEN
    RAISE NOTICE '❌ PROBLEM: No INSERT policy exists on invitations table';
  ELSE
    RAISE NOTICE '✅ Everything looks correct. The issue might be:';
    RAISE NOTICE '   1. Using wrong space_id (not admin of that specific space)';
    RAISE NOTICE '   2. Function is_space_admin() has a bug';
    RAISE NOTICE '   3. Need to check query #4 above for specific space';
  END IF;
END;
$$;

