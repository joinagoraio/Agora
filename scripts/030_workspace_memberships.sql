-- 030_workspace_memberships.sql
-- Introduce workspace-scoped memberships and invitations

-- Ensure invitation_status enum exists (needed for workspace_invitations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'invitation_status'
  ) THEN
    CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');
  END IF;
END;
$$;

-- 1. Create workspace_members table (if it does not exist)
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- 2. Create workspace_invitations table (if it does not exist)
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status invitation_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_workspace_id ON public.workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON public.workspace_invitations(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token ON public.workspace_invitations(token);

-- 4. Enable RLS
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- 5. Helper functions for workspace access control
DROP FUNCTION IF EXISTS public.is_workspace_member(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_workspace_admin(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.is_workspace_member(workspace_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  space_uuid UUID;
  creator_uuid UUID;
BEGIN
  SELECT space_id, created_by INTO space_uuid, creator_uuid FROM workspaces WHERE id = workspace_uuid;
  IF space_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF creator_uuid = user_uuid THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = workspace_uuid
      AND user_id = user_uuid
  ) THEN
    RETURN TRUE;
  END IF;

  IF is_space_admin(space_uuid, user_uuid) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(workspace_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  space_uuid UUID;
  creator_uuid UUID;
BEGIN
  SELECT space_id, created_by INTO space_uuid, creator_uuid FROM workspaces WHERE id = workspace_uuid;
  IF space_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF creator_uuid = user_uuid THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = workspace_uuid
      AND user_id = user_uuid
      AND role = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  IF is_space_admin(space_uuid, user_uuid) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 6. Drop outdated policies so we can recreate them with workspace-level awareness
DO $$
DECLARE
  has_workspaces BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces'
  );
  has_connectors BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'connectors'
  );
  has_documents BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'documents'
  );
  has_document_embeddings BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_embeddings'
  );
  has_conversations BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversations'
  );
  has_messages BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages'
  );
BEGIN
  IF has_workspaces THEN
    EXECUTE 'DROP POLICY IF EXISTS "Space members can view workspaces" ON public.workspaces';
    EXECUTE 'DROP POLICY IF EXISTS "Space members can create workspaces" ON public.workspaces';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can update workspaces" ON public.workspaces';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can delete workspaces" ON public.workspaces';
  END IF;

  IF has_connectors THEN
    EXECUTE 'DROP POLICY IF EXISTS "Workspace members can view connectors" ON public.connectors';
    EXECUTE 'DROP POLICY IF EXISTS "Workspace members can create connectors" ON public.connectors';
    EXECUTE 'DROP POLICY IF EXISTS "Creators and admins can update connectors" ON public.connectors';
    EXECUTE 'DROP POLICY IF EXISTS "Creators and admins can delete connectors" ON public.connectors';
  END IF;

  IF has_documents THEN
    EXECUTE 'DROP POLICY IF EXISTS "Workspace members can view documents" ON public.documents';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can delete documents" ON public.documents';
  END IF;

  IF has_document_embeddings THEN
    EXECUTE 'DROP POLICY IF EXISTS "Workspace members can view embeddings" ON public.document_embeddings';
  END IF;

  IF has_conversations THEN
    EXECUTE 'DROP POLICY IF EXISTS "Workspace members can view conversations" ON public.conversations';
    EXECUTE 'DROP POLICY IF EXISTS "Workspace members can create conversations" ON public.conversations';
    EXECUTE 'DROP POLICY IF EXISTS "Creators and admins can delete conversations" ON public.conversations';
  END IF;

  IF has_messages THEN
    EXECUTE 'DROP POLICY IF EXISTS "Conversation members can view messages" ON public.messages';
  END IF;
END;
$$;

-- 7. Recreate policies with workspace-level checks
CREATE POLICY "Workspace access can view workspaces"
  ON public.workspaces FOR SELECT
  USING (is_workspace_member(workspaces.id, auth.uid()));

CREATE POLICY "Space members can create workspaces"
  ON public.workspaces FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = workspaces.space_id
        AND space_members.user_id = auth.uid()
        AND space_members.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Workspace admins can update workspaces"
  ON public.workspaces FOR UPDATE
  USING (is_workspace_admin(workspaces.id, auth.uid()));

CREATE POLICY "Workspace admins can delete workspaces"
  ON public.workspaces FOR DELETE
  USING (is_workspace_admin(workspaces.id, auth.uid()));

CREATE POLICY "Workspace access can view connectors"
  ON public.connectors FOR SELECT
  USING (is_workspace_member(connectors.workspace_id, auth.uid()));

CREATE POLICY "Workspace members can create connectors"
  ON public.connectors FOR INSERT
  WITH CHECK (is_workspace_member(connectors.workspace_id, auth.uid()));

CREATE POLICY "Creators and admins can update connectors"
  ON public.connectors FOR UPDATE
  USING (
    created_by = auth.uid()
    OR is_workspace_admin(connectors.workspace_id, auth.uid())
  );

CREATE POLICY "Creators and admins can delete connectors"
  ON public.connectors FOR DELETE
  USING (
    created_by = auth.uid()
    OR is_workspace_admin(connectors.workspace_id, auth.uid())
  );

CREATE POLICY "Workspace access can view documents"
  ON public.documents FOR SELECT
  USING (is_workspace_member(documents.workspace_id, auth.uid()));

CREATE POLICY "Workspace admins can delete documents"
  ON public.documents FOR DELETE
  USING (is_workspace_admin(documents.workspace_id, auth.uid()));

CREATE POLICY "Workspace access can view embeddings"
  ON public.document_embeddings FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM documents d
      WHERE d.id = document_embeddings.document_id
        AND is_workspace_member(d.workspace_id, auth.uid())
    )
  );

CREATE POLICY "Workspace access can view conversations"
  ON public.conversations FOR SELECT
  USING (is_workspace_member(conversations.workspace_id, auth.uid()));

CREATE POLICY "Workspace members can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (is_workspace_member(conversations.workspace_id, auth.uid()));

CREATE POLICY "Creators and admins can delete conversations"
  ON public.conversations FOR DELETE
  USING (
    conversations.user_id = auth.uid()
    OR is_workspace_admin(conversations.workspace_id, auth.uid())
  );

CREATE POLICY "Workspace access can view messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND is_workspace_member(c.workspace_id, auth.uid())
    )
  );

-- 8. Policies for workspace_members table
DROP POLICY IF EXISTS "Workspace members can view workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Workspace admins manage workspace members" ON public.workspace_members;

CREATE POLICY "Workspace members can view workspace members"
  ON public.workspace_members FOR SELECT
  USING (is_workspace_member(workspace_members.workspace_id, auth.uid()));

CREATE POLICY "Workspace admins manage workspace members"
  ON public.workspace_members FOR ALL
  USING (is_workspace_admin(workspace_members.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_admin(workspace_members.workspace_id, auth.uid()));

-- 9. Policies for workspace_invitations table
DROP POLICY IF EXISTS "Workspace admins can view workspace invitations" ON public.workspace_invitations;
DROP POLICY IF EXISTS "Workspace admins can create workspace invitations" ON public.workspace_invitations;
DROP POLICY IF EXISTS "Workspace admins can update workspace invitations" ON public.workspace_invitations;
DROP POLICY IF EXISTS "Workspace invitees can view by token" ON public.workspace_invitations;

CREATE POLICY "Workspace admins can view workspace invitations"
  ON public.workspace_invitations FOR SELECT
  USING (is_workspace_admin(workspace_invitations.workspace_id, auth.uid()));

CREATE POLICY "Workspace admins can create workspace invitations"
  ON public.workspace_invitations FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_invitations.workspace_id, auth.uid()));

CREATE POLICY "Workspace admins can update workspace invitations"
  ON public.workspace_invitations FOR UPDATE
  USING (is_workspace_admin(workspace_invitations.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_admin(workspace_invitations.workspace_id, auth.uid()));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'workspace_invitations' AND policyname = 'Workspace invitees can view by token'
  ) THEN
    EXECUTE 'CREATE POLICY "Workspace invitees can view by token" ON public.workspace_invitations FOR SELECT USING (auth.uid() IS NOT NULL);';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'workspace_invitations' AND policyname = 'Workspace invitees can update their invitations'
  ) THEN
    EXECUTE 'CREATE POLICY "Workspace invitees can update their invitations" ON public.workspace_invitations FOR UPDATE USING (auth.uid() IS NOT NULL);';
  END IF;
END;
$$;

-- 10. Updated triggers for new tables
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_workspace_members_updated_at ON public.workspace_members;
CREATE TRIGGER update_workspace_members_updated_at
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_workspace_invitations_updated_at ON public.workspace_invitations;
CREATE TRIGGER update_workspace_invitations_updated_at
  BEFORE UPDATE ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. Backfill workspace memberships from existing space memberships
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT
  w.id,
  sm.user_id,
  CASE
    WHEN sm.role IN ('owner', 'admin') THEN 'admin'
    WHEN sm.role = 'member' THEN 'member'
    ELSE 'viewer'
  END AS role
FROM public.workspaces w
JOIN public.space_members sm ON sm.space_id = w.space_id
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- 12. Ensure existing workspace creators retain admin access
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT
  w.id,
  w.created_by,
  'admin'
FROM public.workspaces w
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Script complete

