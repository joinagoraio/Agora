-- Security Policy Verification Script for Supabase SQL Editor
-- Run this to verify all security policies are correctly configured
--
-- This script checks for:
--   1. Presence of secure RLS policies
--   2. Absence of vulnerable policies
--   3. Helper function existence and configuration
--   4. Storage bucket policies

-- =============================================================================
-- 1. RLS ENABLED CHECK
-- =============================================================================
-- Check if RLS is enabled on all critical tables
SELECT
    '1. RLS ENABLED CHECK' as section,
    '' as spacer;

SELECT
    tablename,
    CASE
        WHEN rowsecurity THEN '✅ ENABLED'
        ELSE '❌ DISABLED - CRITICAL ISSUE!'
    END as rls_status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles',
    'spaces',
    'space_members',
    'workspaces',
    'workspace_members',
    'documents',
    'document_embeddings',
    'document_pages',
    'messages',
    'conversations',
    'workspace_invitations',
    'invitations',
    'shared_links'
  )
ORDER BY tablename;

-- =============================================================================
-- 2. CRITICAL: DOCUMENTS TABLE POLICIES
-- =============================================================================
SELECT '' as spacer, '2. CRITICAL: DOCUMENTS TABLE POLICIES' as section;

SELECT
    policyname,
    cmd as operation,
    CASE
        WHEN policyname LIKE '%System can%' AND (qual = 'true' OR with_check = 'true')
            THEN '❌ VULNERABLE - MUST FIX'
        WHEN policyname LIKE '%Workspace members%' OR policyname LIKE '%Workspace admins%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status,
    LEFT(COALESCE(qual, 'N/A'), 60) as using_clause,
    LEFT(COALESCE(with_check, 'N/A'), 60) as check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'documents'
ORDER BY cmd, policyname;

-- =============================================================================
-- 3. CRITICAL: MESSAGES TABLE POLICIES
-- =============================================================================
SELECT '' as spacer, '3. CRITICAL: MESSAGES TABLE POLICIES' as section;

SELECT
    policyname,
    cmd as operation,
    CASE
        WHEN policyname LIKE '%System can%' AND (qual = 'true' OR with_check = 'true')
            THEN '❌ VULNERABLE - MUST FIX'
        WHEN policyname LIKE '%Workspace members%' OR policyname LIKE '%conversation%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'messages'
ORDER BY cmd, policyname;

-- =============================================================================
-- 4. CRITICAL: PROFILES TABLE POLICIES
-- =============================================================================
SELECT '' as spacer, '4. CRITICAL: PROFILES TABLE POLICIES' as section;

SELECT
    policyname,
    cmd as operation,
    CASE
        WHEN policyname LIKE '%Public%' AND qual = 'true'
            THEN '❌ VULNERABLE - Exposes all profiles'
        WHEN policyname LIKE '%connected%' OR policyname LIKE '%workspace%' OR policyname LIKE '%space%'
            THEN '✅ SECURE - Restricted visibility'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
ORDER BY cmd, policyname;

-- =============================================================================
-- 5. DOCUMENT EMBEDDINGS POLICIES
-- =============================================================================
SELECT '' as spacer, '5. DOCUMENT EMBEDDINGS POLICIES' as section;

SELECT
    policyname,
    cmd as operation,
    CASE
        WHEN policyname LIKE '%System can%' AND (qual = 'true' OR with_check = 'true')
            THEN '❌ VULNERABLE - MUST FIX'
        WHEN policyname LIKE '%Workspace%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'document_embeddings'
ORDER BY cmd, policyname;

-- =============================================================================
-- 6. WORKSPACE INVITATIONS POLICIES
-- =============================================================================
SELECT '' as spacer, '6. WORKSPACE INVITATIONS POLICIES' as section;

SELECT
    policyname,
    cmd as operation,
    CASE
        WHEN qual = 'true' AND cmd = 'SELECT'
            THEN '❌ VULNERABLE - Allows enumeration'
        WHEN policyname LIKE '%admin%' OR policyname LIKE '%email%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'workspace_invitations'
ORDER BY cmd, policyname;

-- =============================================================================
-- 7. SHARED LINKS POLICIES
-- =============================================================================
SELECT '' as spacer, '7. SHARED LINKS POLICIES' as section;

SELECT
    policyname,
    cmd as operation,
    CASE
        WHEN qual = 'true' AND cmd = 'SELECT'
            THEN '⚠️  WARNING - May expose tokens'
        WHEN policyname LIKE '%creator%' OR policyname LIKE '%workspace%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'shared_links'
ORDER BY cmd, policyname;

-- =============================================================================
-- 8. HELPER FUNCTIONS CHECK
-- =============================================================================
SELECT '' as spacer, '8. HELPER FUNCTIONS CHECK' as section;

SELECT
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as parameters,
    CASE p.prosecdef
        WHEN true THEN '✅ SECURITY DEFINER'
        ELSE '❌ NOT SECURITY DEFINER'
    END as security_mode,
    CASE
        WHEN p.proname IN ('is_space_member', 'is_space_admin', 'is_workspace_member', 'is_workspace_admin')
            THEN '✅ REQUIRED FUNCTION'
        ELSE '⚠️  OTHER'
    END as status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'is_%member' OR p.proname LIKE 'is_%admin')
ORDER BY p.proname;

-- =============================================================================
-- 9. VULNERABLE POLICY DETECTION
-- =============================================================================
SELECT '' as spacer, '9. VULNERABLE POLICY DETECTION' as section;

SELECT
    tablename,
    policyname,
    cmd as operation,
    '❌ VULNERABLE' as status,
    'Policy allows all authenticated users' as issue
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    (qual = 'true' AND cmd IN ('SELECT', 'UPDATE', 'DELETE'))
    OR (with_check = 'true' AND cmd IN ('INSERT', 'UPDATE'))
  )
  AND tablename IN (
    'documents',
    'messages',
    'document_embeddings',
    'profiles',
    'workspace_invitations',
    'conversations'
  )
ORDER BY tablename, cmd;

-- =============================================================================
-- 10. STORAGE BUCKET POLICIES
-- =============================================================================
SELECT '' as spacer, '10. STORAGE BUCKET POLICIES' as section;

SELECT
    policyname,
    CASE
        WHEN policyname LIKE '%Public%' OR policyname LIKE '%Anyone%'
            THEN '❌ VULNERABLE - Public access'
        WHEN policyname LIKE '%Workspace members%' OR policyname LIKE '%authenticated%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status,
    LEFT(COALESCE(with_check, qual, 'N/A'), 70) as policy_condition
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (policyname LIKE '%document%' OR bucket_id = 'documents')
ORDER BY policyname;

-- =============================================================================
-- SUMMARY
-- =============================================================================
SELECT '' as spacer, '=== SECURITY SUMMARY ===' as section;

WITH policy_check AS (
    SELECT
        COUNT(*) FILTER (
            WHERE (qual = 'true' OR with_check = 'true')
            AND tablename IN ('documents', 'messages', 'document_embeddings', 'profiles')
        ) as vulnerable_policies,
        COUNT(*) FILTER (
            WHERE tablename IN ('documents', 'messages', 'document_embeddings', 'profiles')
        ) as total_policies
    FROM pg_policies
    WHERE schemaname = 'public'
)
SELECT
    vulnerable_policies as "Vulnerable Policies",
    total_policies as "Total Policies Checked",
    CASE
        WHEN vulnerable_policies = 0 THEN '✅ SECURE - No vulnerable policies detected'
        WHEN vulnerable_policies <= 2 THEN '⚠️  WARNING - Some vulnerable policies found'
        ELSE '❌ CRITICAL - Multiple vulnerable policies detected'
    END as "Overall Status",
    CASE
        WHEN vulnerable_policies = 0 THEN '✅ Your database is properly secured!'
        ELSE '❌ Run fix_vulnerable_policies.sql to remediate'
    END as "Recommendation"
FROM policy_check;

-- =============================================================================
-- INTERPRETATION GUIDE
-- =============================================================================
SELECT '' as spacer, '=== HOW TO INTERPRET RESULTS ===' as section;

SELECT
    '✅ SECURE' as indicator,
    'Policy correctly restricts access - Good!' as meaning
UNION ALL
SELECT
    '❌ VULNERABLE',
    'Policy allows unrestricted access - MUST FIX!'
UNION ALL
SELECT
    '⚠️  WARNING',
    'Policy may need review or has minor issues'
UNION ALL
SELECT
    '✅ ENABLED',
    'RLS is active on this table - Good!'
UNION ALL
SELECT
    '❌ DISABLED',
    'RLS is NOT active - CRITICAL SECURITY ISSUE!';

-- =============================================================================
-- WHAT TO DO NEXT
-- =============================================================================
SELECT '' as spacer, '=== NEXT STEPS ===' as section;

WITH vulnerability_count AS (
    SELECT COUNT(*) as count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual = 'true' OR with_check = 'true')
      AND tablename IN ('documents', 'messages', 'document_embeddings', 'profiles')
)
SELECT
    CASE
        WHEN count = 0 THEN '✅ All checks passed! Your database is secure.'
        WHEN count <= 2 THEN '⚠️  Found ' || count || ' vulnerable policies. Review and fix recommended.'
        ELSE '❌ Found ' || count || ' vulnerable policies. Run fix_vulnerable_policies.sql immediately!'
    END as action_required
FROM vulnerability_count;

-- End of verification script
