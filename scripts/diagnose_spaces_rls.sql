-- Diagnostic script to check spaces table RLS configuration
-- Run this to understand the current state before applying fixes

-- 1. Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'spaces';

-- 2. List all policies on spaces table
SELECT 
  schemaname,
  tablename,
  policyname,
  CASE cmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END AS command,
  roles,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'spaces'
ORDER BY policyname;

-- 3. Check table permissions for authenticated role
SELECT 
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
AND table_name = 'spaces'
AND grantee = 'authenticated'
ORDER BY privilege_type;

-- 4. Check if there are any spaces owned by the current user
SELECT 
  id,
  name,
  owner_id,
  owner_id = auth.uid() AS is_owner,
  created_at
FROM spaces
WHERE owner_id = auth.uid()
LIMIT 5;

-- 5. Check space_members for current user
SELECT 
  sm.space_id,
  s.name AS space_name,
  sm.role,
  sm.user_id = auth.uid() AS is_current_user
FROM space_members sm
JOIN spaces s ON s.id = sm.space_id
WHERE sm.user_id = auth.uid()
LIMIT 10;

