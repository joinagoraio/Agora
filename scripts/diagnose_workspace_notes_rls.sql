-- Diagnose workspace_notes RLS issues
-- This script checks the current state of workspace_notes RLS policies

-- 1. Check if table exists and RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as "RLS Enabled"
FROM pg_tables 
WHERE tablename = 'workspace_notes';

-- 2. Check current RLS policies on workspace_notes
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as "Command",
  qual as "USING Expression",
  with_check as "WITH CHECK Expression"
FROM pg_policies
WHERE tablename = 'workspace_notes'
ORDER BY policyname;

-- 3. Check if is_space_member function exists
SELECT 
  n.nspname as "Schema",
  p.proname as "Function Name",
  pg_get_function_arguments(p.oid) as "Arguments",
  pg_get_functiondef(p.oid) as "Definition"
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'is_space_member';

-- 4. Check workspace_notes table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'workspace_notes'
ORDER BY ordinal_position;

-- 5. Test is_space_member function (if exists)
-- This will show if the function can be called
DO $$
BEGIN
  -- Try to call is_space_member with a dummy UUID
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'is_space_member'
  ) THEN
    RAISE NOTICE 'is_space_member function exists';
  ELSE
    RAISE WARNING 'is_space_member function does NOT exist - this is the problem!';
  END IF;
END $$;

-- 6. Check current user and auth context
SELECT 
  current_user as "Current Database User",
  current_schema as "Current Schema";

-- 7. Check if auth schema exists
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name = 'auth';

