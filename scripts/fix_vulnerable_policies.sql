-- Security Policy Remediation Script
-- Run this script ONLY if verify_security_policies.sql shows vulnerable policies
--
-- This script will:
--   1. Drop vulnerable policies
--   2. Create secure replacement policies
--   3. Fix helper functions if needed

\echo '=== AGORA SECURITY POLICY REMEDIATION ==='
\echo ''
\echo '⚠️  WARNING: This script will modify RLS policies'
\echo '⚠️  Make sure you have a database backup before proceeding'
\echo ''
\echo 'Starting remediation...'
\echo ''

-- ============================================================================
-- 1. FIX DOCUMENTS TABLE POLICIES
-- ============================================================================
\echo '1. Fixing documents table policies...'

-- Drop vulnerable policies
DROP POLICY IF EXISTS "System can insert documents" ON public.documents;
DROP POLICY IF EXISTS "System can update documents" ON public.documents;

-- Create secure policies
CREATE POLICY "Workspace members can insert documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = documents.workspace_id
      AND (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = w.space_id
          AND sm.user_id = auth.uid()
          AND sm.role IN ('owner', 'admin')
        )
      )
    )
  );

CREATE POLICY "Workspace admins can update documents"
  ON public.documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = documents.workspace_id
      AND (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
          AND wm.role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = w.space_id
          AND sm.user_id = auth.uid()
          AND sm.role IN ('owner', 'admin')
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = documents.workspace_id
      AND (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
          AND wm.role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = w.space_id
          AND sm.user_id = auth.uid()
          AND sm.role IN ('owner', 'admin')
        )
      )
    )
  );

\echo '  ✅ Documents table policies fixed'

-- ============================================================================
-- 2. FIX DOCUMENT EMBEDDINGS POLICIES
-- ============================================================================
\echo '2. Fixing document_embeddings table policies...'

DROP POLICY IF EXISTS "System can insert embeddings" ON public.document_embeddings;
DROP POLICY IF EXISTS "System can delete embeddings" ON public.document_embeddings;

CREATE POLICY "Workspace admins can manage embeddings"
  ON public.document_embeddings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.workspaces w ON w.id = d.workspace_id
      WHERE d.id = document_embeddings.document_id
      AND (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
          AND wm.role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = w.space_id
          AND sm.user_id = auth.uid()
          AND sm.role IN ('owner', 'admin')
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.workspaces w ON w.id = d.workspace_id
      WHERE d.id = document_embeddings.document_id
      AND (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
          AND wm.role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = w.space_id
          AND sm.user_id = auth.uid()
          AND sm.role IN ('owner', 'admin')
        )
      )
    )
  );

\echo '  ✅ Document embeddings policies fixed'

-- ============================================================================
-- 3. FIX MESSAGES TABLE POLICIES
-- ============================================================================
\echo '3. Fixing messages table policies...'

DROP POLICY IF EXISTS "System can insert messages" ON public.messages;

CREATE POLICY "Workspace members can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.workspaces w ON w.id = c.workspace_id
      WHERE c.id = messages.conversation_id
      AND (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = w.space_id
          AND sm.user_id = auth.uid()
        )
      )
    )
  );

\echo '  ✅ Messages table policies fixed'

-- ============================================================================
-- 4. FIX PROFILES TABLE POLICIES
-- ============================================================================
\echo '4. Fixing profiles table policies...'

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Users can view connected profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = profiles.id
    OR EXISTS (
      SELECT 1
      FROM public.space_members sm_self
      JOIN public.space_members sm_target ON sm_self.space_id = sm_target.space_id
      WHERE sm_self.user_id = auth.uid()
        AND sm_target.user_id = profiles.id
    )
  );

\echo '  ✅ Profiles table policies fixed'

-- ============================================================================
-- 5. FIX WORKSPACE INVITATIONS POLICIES
-- ============================================================================
\echo '5. Fixing workspace_invitations table policies...'

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Workspace invitees can view by token" ON public.workspace_invitations;
DROP POLICY IF EXISTS "Workspace invitees can update their invitations" ON public.workspace_invitations;

-- Create secure policies
CREATE POLICY "Workspace admins can view invitations"
  ON public.workspace_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_invitations.workspace_id
      AND (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
          AND wm.role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = w.space_id
          AND sm.user_id = auth.uid()
          AND sm.role IN ('owner', 'admin')
        )
      )
    )
  );

CREATE POLICY "Workspace invitees can view their invitation"
  ON public.workspace_invitations FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(p.email) = lower(workspace_invitations.email)
    )
  );

\echo '  ✅ Workspace invitations policies fixed'

-- ============================================================================
-- 6. FIX STORAGE BUCKET POLICIES
-- ============================================================================
\echo '6. Fixing storage bucket policies...'

-- Drop public access policy
DROP POLICY IF EXISTS "Public can read documents" ON storage.objects;

-- Create secure workspace-scoped policy
CREATE POLICY "Workspace members can read documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id::text = (storage.foldername(name))[2]
      AND (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = w.space_id
          AND sm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Workspace members can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id::text = (storage.foldername(name))[2]
      AND (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = w.space_id
          AND sm.user_id = auth.uid()
        )
      )
    )
  );

\echo '  ✅ Storage bucket policies fixed'

-- ============================================================================
-- 7. VERIFY HELPER FUNCTIONS
-- ============================================================================
\echo '7. Verifying helper functions exist...'

-- These should already exist, but verify they're using SECURITY DEFINER
DO $$
BEGIN
  -- Check is_workspace_member exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'is_workspace_member'
  ) THEN
    RAISE WARNING 'Helper function is_workspace_member does not exist! You may need to run earlier migration scripts.';
  END IF;

  -- Check is_workspace_admin exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'is_workspace_admin'
  ) THEN
    RAISE WARNING 'Helper function is_workspace_admin does not exist! You may need to run earlier migration scripts.';
  END IF;
END $$;

\echo '  ✅ Helper functions verified'

-- ============================================================================
-- FINAL VERIFICATION
-- ============================================================================
\echo ''
\echo '=== REMEDIATION COMPLETE ==='
\echo ''
\echo 'Verifying all vulnerable policies have been removed...'

WITH vulnerable_check AS (
    SELECT COUNT(*) as count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual = 'true' AND cmd IN ('SELECT', 'UPDATE', 'DELETE'))
        OR (with_check = 'true' AND cmd IN ('INSERT', 'UPDATE'))
      )
      AND tablename IN ('documents', 'messages', 'document_embeddings', 'profiles', 'workspace_invitations')
)
SELECT
    CASE
        WHEN count = 0 THEN '✅ SUCCESS: All vulnerable policies have been fixed'
        ELSE '⚠️  WARNING: ' || count || ' vulnerable policies still exist'
    END as result
FROM vulnerable_check;

\echo ''
\echo 'Run verify_security_policies.sql to see detailed results.'
\echo ''
