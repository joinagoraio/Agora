-- Diagnostic script for workspace_comments RLS policies
-- Run this to check the current state before applying fixes

BEGIN;

-- Set up better formatting
\pset border 2
\pset format wrapped

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================';
  RAISE NOTICE '🔍 WORKSPACE COMMENTS RLS DIAGNOSTICS';
  RAISE NOTICE '================================';
  RAISE NOTICE '';
END $$;

-- 1. Check if workspace_comments table exists
DO $$
DECLARE
  table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'workspace_comments'
  ) INTO table_exists;
  
  IF table_exists THEN
    RAISE NOTICE '✅ workspace_comments table exists';
  ELSE
    RAISE NOTICE '❌ workspace_comments table NOT found';
  END IF;
END $$;

-- 2. Check RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity AS "RLS Enabled",
  CASE 
    WHEN rowsecurity THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END AS "Status"
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'workspace_comments';

-- 3. List all policies
SELECT 
  policyname AS "Policy Name",
  cmd AS "Command",
  qual AS "USING Expression",
  with_check AS "WITH CHECK Expression"
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'workspace_comments'
ORDER BY cmd, policyname;

-- 4. Check helper functions
DO $$
DECLARE
  func_1param_exists boolean;
  func_2param_exists boolean;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📋 Helper Functions Check:';
  
  -- Check 1-parameter version
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'is_space_member'
    AND p.pronargs = 1
  ) INTO func_1param_exists;
  
  -- Check 2-parameter version
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'is_space_member'
    AND p.pronargs = 2
  ) INTO func_2param_exists;
  
  IF func_1param_exists THEN
    RAISE NOTICE '   ✅ is_space_member(uuid) exists';
  ELSE
    RAISE NOTICE '   ❌ is_space_member(uuid) NOT found';
  END IF;
  
  IF func_2param_exists THEN
    RAISE NOTICE '   ✅ is_space_member(uuid, uuid) exists';
  ELSE
    RAISE NOTICE '   ❌ is_space_member(uuid, uuid) NOT found';
  END IF;
END $$;

-- 5. Test policy expressions for common issues
DO $$
DECLARE
  policy_count integer;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename = 'workspace_comments';
  
  RAISE NOTICE '';
  RAISE NOTICE '📊 Summary:';
  RAISE NOTICE '   Total policies: %', policy_count;
  
  IF policy_count = 0 THEN
    RAISE NOTICE '   ⚠️  WARNING: No RLS policies found!';
  ELSIF policy_count < 4 THEN
    RAISE NOTICE '   ⚠️  WARNING: Expected 4 policies (SELECT, INSERT, UPDATE, DELETE)';
  ELSE
    RAISE NOTICE '   ✅ Policy count looks good';
  END IF;
END $$;

-- 6. Sample data check (if any exists)
DO $$
DECLARE
  comment_count integer;
BEGIN
  SELECT COUNT(*) INTO comment_count FROM public.workspace_comments;
  RAISE NOTICE '   Existing comments: %', comment_count;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '   ⚠️  Could not count comments: %', SQLERRM;
END $$;

ROLLBACK;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================';
  RAISE NOTICE '📝 Next Steps:';
  RAISE NOTICE '================================';
  RAISE NOTICE '';
  RAISE NOTICE 'If issues were found, run:';
  RAISE NOTICE '  psql $DATABASE_URL -f scripts/fix_workspace_comments_rls.sql';
  RAISE NOTICE '';
END $$;

