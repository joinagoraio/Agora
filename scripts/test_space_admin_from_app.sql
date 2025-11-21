-- Test script to diagnose is_space_admin() from application context
-- This simulates what happens when the app tries to insert an invitation

-- First, let's check the is_space_admin function definition
SELECT 
  proname as function_name,
  pg_get_functiondef(oid) as full_definition
FROM pg_proc
WHERE proname = 'is_space_admin'
  AND pronamespace = 'public'::regnamespace;

-- Check grants on the function
SELECT 
  r.rolname as role_name,
  p.proname as function_name,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
CROSS JOIN pg_roles r
WHERE p.proname = 'is_space_admin'
  AND p.pronamespace = 'public'::regnamespace
  AND r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

-- Check the invitations INSERT policy
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  with_check as policy_check_clause
FROM pg_policies
WHERE tablename = 'invitations'
  AND cmd = 'INSERT';

