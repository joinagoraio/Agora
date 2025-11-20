-- 031_critical_rls_fixes.sql
-- Locks down overly permissive policies identified during the 2025-11-20 audit.
-- Run this script after deploying 030_workspace_memberships.sql.

BEGIN;

SET LOCAL search_path TO public;

-- Tighten EXECUTE privileges on helper functions used by RLS policies
DO $$
DECLARE
  fn RECORD;
  role_name TEXT;
  roles TEXT[] := ARRAY['anon', 'authenticated', 'service_role'];
BEGIN
  FOR fn IN
    SELECT oid::regprocedure AS procname
    FROM pg_proc
    WHERE proname IN ('is_space_member', 'is_space_admin', 'is_workspace_member', 'is_workspace_admin')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.procname);
    FOREACH role_name IN ARRAY roles LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', fn.procname, role_name);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Documents: prevent cross-workspace inserts/updates
DROP POLICY IF EXISTS "System can insert documents" ON public.documents;
DROP POLICY IF EXISTS "System can update documents" ON public.documents;

CREATE POLICY "Workspace members can insert documents"
  ON public.documents FOR INSERT
  WITH CHECK (is_workspace_member(documents.workspace_id, auth.uid()));

CREATE POLICY "Workspace admins can update documents"
  ON public.documents FOR UPDATE
  USING (is_workspace_admin(documents.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_admin(documents.workspace_id, auth.uid()));

-- Document embeddings: align CRUD with document workspace permissions
DROP POLICY IF EXISTS "System can insert embeddings" ON public.document_embeddings;
DROP POLICY IF EXISTS "System can delete embeddings" ON public.document_embeddings;

CREATE POLICY "Workspace members can insert embeddings"
  ON public.document_embeddings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_embeddings.document_id
        AND is_workspace_member(d.workspace_id, auth.uid())
    )
  );

CREATE POLICY "Workspace admins can delete embeddings"
  ON public.document_embeddings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_embeddings.document_id
        AND is_workspace_admin(d.workspace_id, auth.uid())
    )
  );

-- Document pages: remove blanket system policies (table is optional)
DO $doc_pages$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'document_pages'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "System can insert document pages" ON public.document_pages';
    EXECUTE 'DROP POLICY IF EXISTS "System can update document pages" ON public.document_pages';
    EXECUTE 'DROP POLICY IF EXISTS "System can delete document pages" ON public.document_pages';

    EXECUTE $pol$
      CREATE POLICY "Workspace members can insert document pages"
        ON public.document_pages FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_pages.document_id
              AND is_workspace_member(d.workspace_id, auth.uid())
          )
        );
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "Workspace admins can update document pages"
        ON public.document_pages FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_pages.document_id
              AND is_workspace_admin(d.workspace_id, auth.uid())
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_pages.document_id
              AND is_workspace_admin(d.workspace_id, auth.uid())
          )
        );
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "Workspace admins can delete document pages"
        ON public.document_pages FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_pages.document_id
              AND is_workspace_admin(d.workspace_id, auth.uid())
          )
        );
    $pol$;
  ELSE
    RAISE NOTICE 'Skipping document_pages policy remediation (table not found)';
  END IF;
END;
$doc_pages$;

-- Messages: require membership before inserts
DROP POLICY IF EXISTS "System can insert messages" ON public.messages;

CREATE POLICY "Workspace members can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          c.user_id = auth.uid()
          OR is_workspace_member(c.workspace_id, auth.uid())
        )
    )
  );

-- Profiles: restrict visibility to users within shared spaces
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Users can view connected profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = profiles.id
    OR EXISTS (
      SELECT 1
      FROM space_members sm_self
      JOIN space_members sm_target ON sm_self.space_id = sm_target.space_id
      WHERE sm_self.user_id = auth.uid()
        AND sm_target.user_id = profiles.id
    )
  );

-- Workspace invitations: remove auth-only enumeration policies
DROP POLICY IF EXISTS "Workspace invitees can view by token" ON public.workspace_invitations;
DROP POLICY IF EXISTS "Workspace invitees can update their invitations" ON public.workspace_invitations;

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

CREATE POLICY "Workspace invitees can update their invitation"
  ON public.workspace_invitations FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(p.email) = lower(workspace_invitations.email)
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(p.email) = lower(workspace_invitations.email)
    )
  );

-- Shared links: require conversation ownership/admin access
DROP POLICY IF EXISTS "Anyone can view shared links by token" ON public.shared_links;
DROP POLICY IF EXISTS "Conversation creators can create shared links" ON public.shared_links;
DROP POLICY IF EXISTS "Creators can delete shared links" ON public.shared_links;

CREATE POLICY "Conversation owners can create shared links"
  ON public.shared_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = shared_links.conversation_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Conversation owners and workspace admins can view shared links"
  ON public.shared_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = shared_links.conversation_id
        AND (
          c.user_id = auth.uid()
          OR is_workspace_admin(c.workspace_id, auth.uid())
        )
    )
  );

CREATE POLICY "Conversation owners and workspace admins can delete shared links"
  ON public.shared_links FOR DELETE
  USING (
    shared_links.created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = shared_links.conversation_id
        AND is_workspace_admin(c.workspace_id, auth.uid())
    )
  );

-- Storage bucket policies: remove public document access
DO $storage$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public can read documents'
  ) THEN
    EXECUTE 'DROP POLICY "Public can read documents" ON storage.objects';
  END IF;

  -- Ensure workspace-scoped read policy exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Workspace members can read documents'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Workspace members can read documents"
        ON storage.objects FOR SELECT
        USING (
          bucket_id = 'documents'
          AND (storage.foldername(name))[1] = 'workspaces'
          AND EXISTS (
            SELECT 1 FROM public.workspaces w
            WHERE w.id::text = (storage.foldername(name))[2]
              AND is_workspace_member(w.id, auth.uid())
          )
        );
    $pol$;
  END IF;
END;
$storage$;

COMMIT;

