-- Test script to diagnose why INSERT is still failing
-- This tests the actual function and permissions

-- 1. Check table-level permissions on invitations
SELECT 
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'invitations'
ORDER BY grantee, privilege_type;

-- 2. Check the is_space_admin function definition
SELECT 
  proname,
  prosecdef as is_security_definer,
  provolatile,
  pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname = 'is_space_admin'
  AND pronamespace = 'public'::regnamespace;

-- 3. Test if the function can be called
-- This simulates what the RLS policy does
DO $$
DECLARE
  test_result BOOLEAN;
  current_user_id UUID;
BEGIN
  -- Get current user (will be NULL in SQL editor, but shows the logic)
  SELECT auth.uid() INTO current_user_id;
  
  RAISE NOTICE 'Current auth.uid(): %', current_user_id;
  
  IF current_user_id IS NULL THEN
    RAISE NOTICE '❌ auth.uid() is NULL - you are not authenticated in this session';
    RAISE NOTICE '   This test needs to be run from the application context';
  ELSE
    -- Test with the user's first space
    SELECT public.is_space_admin(sm.space_id, current_user_id)
    INTO test_result
    FROM space_members sm
    WHERE sm.user_id = current_user_id
    LIMIT 1;
    
    RAISE NOTICE 'is_space_admin() returned: %', test_result;
  END IF;
END;
$$;

-- 4. Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN 'RLS is ON'
    ELSE 'RLS is OFF'
  END as status
FROM pg_tables
WHERE tablename = 'invitations';

-- 5. Show current INSERT policy details
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  with_check as policy_logic
FROM pg_policies
WHERE tablename = 'invitations'
  AND cmd = 'INSERT';

