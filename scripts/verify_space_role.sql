-- Quick verification script to check your role in spaces
-- This helps diagnose why invitations might be failing

-- 1. Check what spaces you're a member of and your role
SELECT 
  s.id as space_id,
  s.name as space_name,
  sm.role as your_role,
  sm.user_id,
  p.email as your_email
FROM spaces s
JOIN space_members sm ON s.id = sm.space_id
JOIN profiles p ON p.id = sm.user_id
WHERE sm.user_id = auth.uid()
ORDER BY s.name;

-- 2. Check if has_space_role function exists and its signature
SELECT 
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosrc as source
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'has_space_role'
  AND n.nspname = 'public';

-- 3. Check current invitations policies
SELECT 
  policyname,
  cmd as command,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'invitations'
ORDER BY policyname;

-- 4. Test if you can create an invitation (this will show if RLS is blocking)
-- Replace with actual space_id where you're an admin
-- SELECT public.has_space_role('YOUR-SPACE-ID-HERE'::uuid, 'admin');

