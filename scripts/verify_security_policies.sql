-- Security Policy Verification Script
-- Run this in your Supabase SQL Editor to verify all security policies are correctly configured
--
-- This script checks for:
--   1. Presence of secure RLS policies
--   2. Absence of vulnerable policies
--   3. Helper function existence and configuration
--   4. Storage bucket policies

\echo '=== AGORA SECURITY POLICY VERIFICATION ==='
\echo ''
\echo 'Checking RLS policies on critical tables...'
\echo ''

-- Check if RLS is enabled on all critical tables
\echo '1. RLS ENABLED CHECK'
\echo '-------------------'
SELECT
    schemaname,
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

\echo ''
\echo '2. CRITICAL: DOCUMENTS TABLE POLICIES'
\echo '-------------------------------------'
-- Check documents table for vulnerable policies
SELECT
    policyname,
    cmd,
    CASE
        WHEN policyname LIKE '%System can%' AND (qual = 'true' OR with_check = 'true')
            THEN '❌ VULNERABLE - MUST FIX'
        WHEN policyname LIKE '%Workspace members%' OR policyname LIKE '%Workspace admins%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status,
    LEFT(qual, 50) as using_clause,
    LEFT(with_check, 50) as check_clause
FROM pg_policies
WHERE tablename = 'documents'
ORDER BY cmd, policyname;

\echo ''
\echo '3. CRITICAL: MESSAGES TABLE POLICIES'
\echo '------------------------------------'
SELECT
    policyname,
    cmd,
    CASE
        WHEN policyname LIKE '%System can%' AND (qual = 'true' OR with_check = 'true')
            THEN '❌ VULNERABLE - MUST FIX'
        WHEN policyname LIKE '%Workspace members%' OR policyname LIKE '%conversation%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status
FROM pg_policies
WHERE tablename = 'messages'
ORDER BY cmd, policyname;

\echo ''
\echo '4. CRITICAL: PROFILES TABLE POLICIES'
\echo '------------------------------------'
SELECT
    policyname,
    cmd,
    CASE
        WHEN policyname LIKE '%Public%' AND with_check = 'true'
            THEN '❌ VULNERABLE - Exposes all profiles'
        WHEN policyname LIKE '%connected%' OR policyname LIKE '%workspace%' OR policyname LIKE '%space%'
            THEN '✅ SECURE - Restricted visibility'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

\echo ''
\echo '5. DOCUMENT EMBEDDINGS POLICIES'
\echo '-------------------------------'
SELECT
    policyname,
    cmd,
    CASE
        WHEN policyname LIKE '%System can%' AND (qual = 'true' OR with_check = 'true')
            THEN '❌ VULNERABLE - MUST FIX'
        WHEN policyname LIKE '%Workspace%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status
FROM pg_policies
WHERE tablename = 'document_embeddings'
ORDER BY cmd, policyname;

\echo ''
\echo '6. WORKSPACE INVITATIONS POLICIES'
\echo '---------------------------------'
SELECT
    policyname,
    cmd,
    CASE
        WHEN qual = 'true' AND cmd = 'SELECT'
            THEN '❌ VULNERABLE - Allows enumeration'
        WHEN policyname LIKE '%admin%' OR policyname LIKE '%email%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status
FROM pg_policies
WHERE tablename = 'workspace_invitations'
ORDER BY cmd, policyname;

\echo ''
\echo '7. SHARED LINKS POLICIES'
\echo '-----------------------'
SELECT
    policyname,
    cmd,
    CASE
        WHEN qual = 'true' AND cmd = 'SELECT'
            THEN '⚠️  WARNING - May expose tokens'
        WHEN policyname LIKE '%creator%' OR policyname LIKE '%workspace%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status
FROM pg_policies
WHERE tablename = 'shared_links'
ORDER BY cmd, policyname;

\echo ''
\echo '8. HELPER FUNCTIONS CHECK'
\echo '------------------------'
-- Check that security helper functions exist
SELECT
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as parameters,
    CASE p.prosecdef
        WHEN true THEN '✅ SECURITY DEFINER (correct)'
        ELSE '❌ NOT SECURITY DEFINER'
    END as security_mode,
    CASE
        WHEN p.proname IN ('is_space_member', 'is_space_admin', 'is_workspace_member', 'is_workspace_admin')
            THEN '✅ EXISTS'
        ELSE '⚠️  UNEXPECTED'
    END as status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname LIKE 'is_%member' OR p.proname LIKE 'is_%admin'
ORDER BY p.proname;

\echo ''
\echo '9. VULNERABLE POLICY DETECTION'
\echo '------------------------------'
-- Detect any policies with 'true' as the only condition (very permissive)
SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
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

\echo ''
\echo '10. STORAGE BUCKET POLICIES'
\echo '--------------------------'
-- Check storage.objects policies
SELECT
    policyname,
    CASE
        WHEN policyname LIKE '%Public%' OR policyname LIKE '%Anyone%'
            THEN '❌ VULNERABLE - Public access'
        WHEN policyname LIKE '%Workspace members%' OR policyname LIKE '%authenticated%'
            THEN '✅ SECURE'
        ELSE '⚠️  REVIEW NEEDED'
    END as security_status,
    LEFT(with_check, 60) as policy_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%document%'
ORDER BY policyname;

\echo ''
\echo '=== SUMMARY ==='
\echo ''

-- Overall security score
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
    vulnerable_policies,
    total_policies,
    CASE
        WHEN vulnerable_policies = 0 THEN '✅ SECURE - No vulnerable policies detected'
        WHEN vulnerable_policies <= 2 THEN '⚠️  WARNING - Some vulnerable policies found'
        ELSE '❌ CRITICAL - Multiple vulnerable policies detected'
    END as overall_status,
    CASE
        WHEN vulnerable_policies = 0 THEN 'Your database is properly secured!'
        ELSE 'Run the remediation script to fix vulnerable policies'
    END as recommendation
FROM policy_check;

\echo ''
\echo '=== KEY INDICATORS ==='
\echo ''
\echo 'Look for these signs of a secure database:'
\echo '  ✅ All tables have RLS enabled'
\echo '  ✅ Documents table uses "Workspace members/admins" policies'
\echo '  ✅ Messages table checks conversation membership'
\echo '  ✅ Profiles table restricts visibility to connected users'
\echo '  ✅ NO policies with "System can" + "true" conditions'
\echo '  ✅ Helper functions use SECURITY DEFINER'
\echo '  ✅ Storage policies check workspace membership'
\echo ''
\echo 'Signs of vulnerability:'
\echo '  ❌ Policies with name "System can..." and qual/with_check = "true"'
\echo '  ❌ Profiles policy named "Public profiles are viewable by everyone"'
\echo '  ❌ Storage policy named "Public can read documents"'
\echo '  ❌ Workspace invitations SELECT policy with qual = "true"'
\echo ''
\echo 'Run complete!'
