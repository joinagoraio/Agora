-- Diagnostic script for invitations RLS issues
-- Run this to check the current state of invitations RLS policies and functions

-- 1. Check current has_space_role function signature
SELECT 
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'has_space_role'
  AND n.nspname = 'public';

-- 2. Check current invitations policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'invitations'
ORDER BY policyname;

-- 3. Check if RLS is enabled on invitations
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'invitations';

-- 4. Test current user's space memberships (replace with actual user ID when running)
-- SELECT 
--   sm.space_id,
--   s.name as space_name,
--   sm.role,
--   sm.user_id
-- FROM space_members sm
-- JOIN spaces s ON s.id = sm.space_id
-- WHERE sm.user_id = auth.uid();

-- 5. Check invitations table structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'invitations'
  AND table_schema = 'public'
ORDER BY ordinal_position;

