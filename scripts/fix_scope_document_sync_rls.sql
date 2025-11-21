-- Fix RLS policies to allow service_role to sync space documents to workspaces
-- 
-- Problem: The security audit scripts (031_critical_rls_fixes.sql, fix_vulnerable_policies.sql)
-- dropped the permissive "System can manage documents" policy and replaced it with user-based
-- policies that check auth.uid(). This blocks the admin client (service_role) from inserting
-- inherited documents when syncing space documents to workspaces.
--
-- Solution: Add explicit policies that allow service_role to manage documents and sources
-- for the scope document sync feature.

BEGIN;

\echo '=== Fixing RLS for Space Document Sync ==='

-- ============================================================================
-- 1. DOCUMENTS TABLE - Allow service_role to insert/update inherited documents
-- ============================================================================

\echo '1. Adding service_role policies for documents table...'

-- Drop if exists (idempotent)
DROP POLICY IF EXISTS "Service role can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Service role can update documents" ON public.documents;

-- Allow service_role to INSERT documents (for scope document sync)
-- Note: service_role bypasses RLS by default in Supabase, but having explicit
-- policies makes the intent clear and works even if RLS bypass is changed
CREATE POLICY "Service role can insert documents"
  ON public.documents
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow service_role to UPDATE documents (for scope document sync updates)
CREATE POLICY "Service role can update documents"
  ON public.documents
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

\echo '   ✓ Documents policies created for service_role'

-- ============================================================================
-- 2. SOURCES TABLE - Allow service_role to create workspace_generated sources
-- ============================================================================

\echo '2. Adding service_role policies for sources table...'

-- Drop if exists (idempotent)
DROP POLICY IF EXISTS "Service role can insert sources" ON public.sources;
DROP POLICY IF EXISTS "Service role can select sources" ON public.sources;

-- Allow service_role to INSERT sources (for creating workspace_generated sources)
CREATE POLICY "Service role can insert sources"
  ON public.sources
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow service_role to SELECT sources (for checking if source exists)
CREATE POLICY "Service role can select sources"
  ON public.sources
  FOR SELECT
  TO service_role
  USING (true);

\echo '   ✓ Sources policies created for service_role'

-- ============================================================================
-- 3. DOCUMENT_PAGES TABLE - Allow service_role to manage content
-- ============================================================================

\echo '3. Adding service_role policies for document_pages table...'

-- Drop if exists (idempotent)
DROP POLICY IF EXISTS "Service role can manage document_pages" ON public.document_pages;

-- Allow service_role to manage document pages (for scope document sync content)
CREATE POLICY "Service role can manage document_pages"
  ON public.document_pages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

\echo '   ✓ Document_pages policies created for service_role'

-- ============================================================================
-- 4. VERIFY POLICIES
-- ============================================================================

\echo ''
\echo '=== Verification ==='

\echo 'Documents INSERT policies:'
SELECT 
  policyname,
  roles::text as roles,
  cmd
FROM pg_policies
WHERE tablename = 'documents' 
  AND cmd = 'INSERT'
ORDER BY policyname;

\echo ''
\echo 'Sources INSERT policies:'
SELECT 
  policyname,
  roles::text as roles,
  cmd
FROM pg_policies
WHERE tablename = 'sources' 
  AND cmd = 'INSERT'
ORDER BY policyname;

\echo ''
\echo 'Document_pages policies:'
SELECT 
  policyname,
  roles::text as roles,
  cmd
FROM pg_policies
WHERE tablename = 'document_pages'
ORDER BY policyname;

COMMIT;

\echo ''
\echo '=== ✓ RLS Fix Complete ==='
\echo ''
\echo 'The service_role can now:'
\echo '  - Insert inherited documents when syncing from spaces'
\echo '  - Create workspace_generated sources'
\echo '  - Manage document pages for full-text content'
\echo ''
\echo 'Next steps:'
\echo '  1. Try uploading a document to a space with workspaces'
\echo '  2. Check logs for [ScopeDocuments] messages'
\echo '  3. Run scripts/diagnose_upload_sync_issue.sql to verify sync worked'
\echo ''

