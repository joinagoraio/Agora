-- Fix RLS policies to allow service_role to sync space documents to workspaces
-- 
-- This version is designed for Supabase SQL Editor (no psql meta-commands)
--
-- Problem: The security audit scripts dropped the permissive "System can manage documents" 
-- policy and replaced it with user-based policies that check auth.uid(). This blocks the 
-- admin client (service_role) from inserting inherited documents when syncing space 
-- documents to workspaces.
--
-- Solution: Add explicit policies that allow service_role to manage documents and sources
-- for the scope document sync feature.

-- ============================================================================
-- 1. DOCUMENTS TABLE - Allow service_role to insert/update inherited documents
-- ============================================================================

-- Drop if exists (idempotent)
DROP POLICY IF EXISTS "Service role can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Service role can update documents" ON public.documents;

-- Allow service_role to INSERT documents (for scope document sync)
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

-- ============================================================================
-- 2. SOURCES TABLE - Allow service_role to create workspace_generated sources
-- ============================================================================

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

-- ============================================================================
-- 3. DOCUMENT_PAGES TABLE - Allow service_role to manage content (if exists)
-- ============================================================================

-- Only apply if document_pages table exists (it's optional)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'document_pages'
  ) THEN
    -- Drop if exists (idempotent)
    EXECUTE 'DROP POLICY IF EXISTS "Service role can manage document_pages" ON public.document_pages';
    
    -- Allow service_role to manage document pages (for scope document sync content)
    EXECUTE $$pol$
      CREATE POLICY "Service role can manage document_pages"
        ON public.document_pages
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)
    $$pol$;
    
    RAISE NOTICE 'Added service_role policy for document_pages table';
  ELSE
    RAISE NOTICE 'document_pages table does not exist, skipping';
  END IF;
END $$;

-- ============================================================================
-- 4. VERIFY - Show the created policies
-- ============================================================================

SELECT 
  'Documents INSERT policies' as check_type,
  policyname,
  roles::text as roles,
  cmd
FROM pg_policies
WHERE tablename = 'documents' 
  AND cmd = 'INSERT'
ORDER BY policyname;

SELECT 
  'Sources INSERT policies' as check_type,
  policyname,
  roles::text as roles,
  cmd
FROM pg_policies
WHERE tablename = 'sources' 
  AND cmd = 'INSERT'
ORDER BY policyname;

-- Only show document_pages policies if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'document_pages'
  ) THEN
    RAISE NOTICE 'Document_pages policies:';
    PERFORM policyname, roles::text, cmd
    FROM pg_policies
    WHERE tablename = 'document_pages'
    ORDER BY policyname;
  END IF;
END $$;

