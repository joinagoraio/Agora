-- ❌❌❌ THIS FILE IS DEPRECATED AND INSECURE - DO NOT USE ❌❌❌
--
-- AGORA Complete Database Migration (DEPRECATED)
--
-- ⚠️  CRITICAL WARNING: THIS FILE IS OUTDATED AND CONTAINS SECURITY VULNERABILITIES ⚠️
--
-- This file does NOT include critical security fixes and contains vulnerable RLS policies.
-- Using this file will result in an INSECURE database.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- FOR NEW DEPLOYMENTS:
-- ════════════════════════════════════════════════════════════════════════════════
--   1. Run migrations sequentially: 000_enable_extensions.sql → 001_create_core_schema.sql → ... → 030_workspace_memberships.sql
--   2. Run scripts/verify_security_policies.sql to verify your setup
--   3. See scripts/README.md for complete deployment guide
--
-- ════════════════════════════════════════════════════════════════════════════════
-- IF YOU ALREADY RAN THIS FILE:
-- ════════════════════════════════════════════════════════════════════════════════
--   1. Run scripts/verify_security_policies.sql to check for vulnerabilities
--   2. If vulnerabilities found, run scripts/fix_vulnerable_policies.sql
--   3. Re-run verification to confirm all issues are resolved
--
-- ════════════════════════════════════════════════════════════════════════════════
-- WHY IS THIS FILE DEPRECATED?
-- ════════════════════════════════════════════════════════════════════════════════
--   - Contains vulnerable RLS policies (e.g., "System can..." policies with qual='true')
--   - Missing workspace-scoped access controls
--   - Missing helper functions with SECURITY DEFINER
--   - Does not include recent security hardening
--   - Sequential migrations are the officially supported method
--
-- This file is kept for reference only. Last updated: 2024-11-20 (INSECURE VERSION)
--
-- ❌❌❌ DO NOT RUN THIS FILE IN PRODUCTION ❌❌❌

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Ensure required enums exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status') THEN
    CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
  END IF;
END;
$$;

-- Step 2: Create core tables
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','nl')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS space_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(space_id, user_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status invitation_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('google_drive', 'notion', 'confluence', 'sharepoint', 'dropbox', 'direct_upload')),
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error', 'syncing')),
  last_sync_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connector_id, external_id)
);

CREATE TABLE IF NOT EXISTS document_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate existing conversations table if it has created_by instead of user_id
DO $$
BEGIN
  -- Check if created_by column exists and user_id doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'created_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'user_id'
  ) THEN
    -- Rename created_by to user_id
    ALTER TABLE conversations RENAME COLUMN created_by TO user_id;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate existing messages table if it has metadata instead of sources
DO $$
BEGIN
  -- Check if metadata column exists and sources doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'metadata'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'sources'
  ) THEN
    -- Rename metadata to sources
    ALTER TABLE messages RENAME COLUMN metadata TO sources;
    -- Set default to empty array
    ALTER TABLE messages ALTER COLUMN sources SET DEFAULT '[]';
    -- Update any existing NULL values to empty array
    UPDATE messages SET sources = '[]' WHERE sources IS NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shared_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS idx_space_members_space_id ON space_members(space_id);
CREATE INDEX IF NOT EXISTS idx_space_members_user_id ON space_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_space_id ON workspaces(space_id);
CREATE INDEX IF NOT EXISTS idx_connectors_workspace_id ON connectors(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_connector_id ON documents(connector_id);
CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id ON document_embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_id ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_workspace_id ON workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON workspace_invitations(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token ON workspace_invitations(token);
CREATE INDEX IF NOT EXISTS idx_shared_links_token ON shared_links(token);

-- Vector similarity search index (drop and recreate if exists)
DROP INDEX IF EXISTS document_embeddings_embedding_idx;
CREATE INDEX document_embeddings_embedding_idx ON document_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Step 4: Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_links ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS Policies
-- Note: If policies already exist, you may see errors. You can drop them first or ignore the errors.

-- Drop existing functions if they exist (for idempotency)
-- Query system catalog to find and drop all versions of these functions
DO $$
DECLARE
  func_record RECORD;
BEGIN
  -- Drop all versions of is_space_member
  FOR func_record IN 
    SELECT oid::regprocedure as func_name
    FROM pg_proc
    WHERE proname = 'is_space_member'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_name || ' CASCADE';
  END LOOP;
  
  -- Drop all versions of is_space_admin
  FOR func_record IN 
    SELECT oid::regprocedure as func_name
    FROM pg_proc
    WHERE proname = 'is_space_admin'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_name || ' CASCADE';
  END LOOP;

  -- Drop all versions of is_workspace_member
  FOR func_record IN 
    SELECT oid::regprocedure as func_name
    FROM pg_proc
    WHERE proname = 'is_workspace_member'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_name || ' CASCADE';
  END LOOP;

  -- Drop all versions of is_workspace_admin
  FOR func_record IN 
    SELECT oid::regprocedure as func_name
    FROM pg_proc
    WHERE proname = 'is_workspace_admin'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_name || ' CASCADE';
  END LOOP;
END $$;

-- Create a security definer function to check space membership without recursion
CREATE OR REPLACE FUNCTION is_space_member(space_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is owner
  IF EXISTS (SELECT 1 FROM spaces WHERE id = space_uuid AND owner_id = user_uuid) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user is a member (bypass RLS using security definer)
  IF EXISTS (
    SELECT 1 FROM space_members 
    WHERE space_id = space_uuid 
    AND user_id = user_uuid
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Create a security definer function to check if user is space admin/owner
CREATE OR REPLACE FUNCTION is_space_admin(space_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is owner
  IF EXISTS (SELECT 1 FROM spaces WHERE id = space_uuid AND owner_id = user_uuid) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user is admin/owner member (bypass RLS using security definer)
  IF EXISTS (
    SELECT 1 FROM space_members 
    WHERE space_id = space_uuid 
    AND user_id = user_uuid
    AND role IN ('owner', 'admin')
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Workspace access helpers
CREATE OR REPLACE FUNCTION is_workspace_member(workspace_uuid UUID, user_uuid UUID)
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
    SELECT 1 FROM workspace_members
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

CREATE OR REPLACE FUNCTION is_workspace_admin(workspace_uuid UUID, user_uuid UUID)
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
    SELECT 1 FROM workspace_members
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

-- Drop existing policies if they exist (for idempotency)
DO $$ 
BEGIN
  -- Profiles policies
  DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
  DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
  
  -- Spaces policies
  DROP POLICY IF EXISTS "Users can view their spaces" ON spaces;
  DROP POLICY IF EXISTS "Users can create spaces" ON spaces;
  DROP POLICY IF EXISTS "Owners and admins can update spaces" ON spaces;
  DROP POLICY IF EXISTS "Owners can delete spaces" ON spaces;
  
  -- Space members policies
  DROP POLICY IF EXISTS "Members can view space members" ON space_members;
  DROP POLICY IF EXISTS "Admins can add members" ON space_members;
  DROP POLICY IF EXISTS "Admins can update members" ON space_members;
  DROP POLICY IF EXISTS "Admins can remove members" ON space_members;
  
  -- Invitations policies
  DROP POLICY IF EXISTS "Admins can view invitations" ON invitations;
  DROP POLICY IF EXISTS "Admins can create invitations" ON invitations;
  DROP POLICY IF EXISTS "Anyone can view invitation by token" ON invitations;
  DROP POLICY IF EXISTS "Invitees can update their invitation" ON invitations;
  
  -- Workspaces policies
  DROP POLICY IF EXISTS "Space members can view workspaces" ON workspaces;
  DROP POLICY IF EXISTS "Space members can create workspaces" ON workspaces;
  DROP POLICY IF EXISTS "Admins can update workspaces" ON workspaces;
  DROP POLICY IF EXISTS "Admins can delete workspaces" ON workspaces;

  -- Workspace members policies
  DROP POLICY IF EXISTS "Workspace members can view workspace members" ON workspace_members;
  DROP POLICY IF EXISTS "Workspace admins manage workspace members" ON workspace_members;

  -- Workspace invitations policies
  DROP POLICY IF EXISTS "Workspace admins can view workspace invitations" ON workspace_invitations;
  DROP POLICY IF EXISTS "Workspace admins can create workspace invitations" ON workspace_invitations;
  DROP POLICY IF EXISTS "Workspace admins can update workspace invitations" ON workspace_invitations;
  DROP POLICY IF EXISTS "Workspace invitees can view by token" ON workspace_invitations;
  DROP POLICY IF EXISTS "Workspace invitees can update their invitations" ON workspace_invitations;
  
  -- Connectors policies
  DROP POLICY IF EXISTS "Workspace members can view connectors" ON connectors;
  DROP POLICY IF EXISTS "Workspace members can create connectors" ON connectors;
  DROP POLICY IF EXISTS "Creators and admins can update connectors" ON connectors;
  DROP POLICY IF EXISTS "Creators and admins can delete connectors" ON connectors;
  
  -- Documents policies
  DROP POLICY IF EXISTS "Workspace members can view documents" ON documents;
  DROP POLICY IF EXISTS "System can insert documents" ON documents;
  DROP POLICY IF EXISTS "System can update documents" ON documents;
  DROP POLICY IF EXISTS "Admins can delete documents" ON documents;
  
  -- Document embeddings policies
  DROP POLICY IF EXISTS "Workspace members can view embeddings" ON document_embeddings;
  DROP POLICY IF EXISTS "System can insert embeddings" ON document_embeddings;
  DROP POLICY IF EXISTS "System can delete embeddings" ON document_embeddings;
  
  -- Conversations policies
  DROP POLICY IF EXISTS "Workspace members can view conversations" ON conversations;
  DROP POLICY IF EXISTS "Workspace members can create conversations" ON conversations;
  DROP POLICY IF EXISTS "Creators can update conversations" ON conversations;
  DROP POLICY IF EXISTS "Creators and admins can delete conversations" ON conversations;
  
  -- Messages policies
  DROP POLICY IF EXISTS "Conversation members can view messages" ON messages;
  DROP POLICY IF EXISTS "System can insert messages" ON messages;
  
  -- Shared links policies
  DROP POLICY IF EXISTS "Anyone can view shared links by token" ON shared_links;
  DROP POLICY IF EXISTS "Conversation creators can create shared links" ON shared_links;
  DROP POLICY IF EXISTS "Creators can delete shared links" ON shared_links;
END $$;

-- Profiles: Users can read all profiles, update their own
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Spaces: Members can view their spaces
CREATE POLICY "Users can view their spaces"
  ON spaces FOR SELECT
  USING (
    owner_id = auth.uid()
    OR is_space_member(id, auth.uid())
  );

CREATE POLICY "Users can create spaces"
  ON spaces FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners and admins can update spaces"
  ON spaces FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = spaces.id
      AND space_members.user_id = auth.uid()
      AND space_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners can delete spaces"
  ON spaces FOR DELETE
  USING (owner_id = auth.uid());

-- Space Members: Members can view members of their spaces
-- Fixed: Use security definer function to avoid recursion
CREATE POLICY "Members can view space members"
  ON space_members FOR SELECT
  USING (is_space_member(space_id, auth.uid()));

CREATE POLICY "Admins can add members"
  ON space_members FOR INSERT
  WITH CHECK (is_space_admin(space_id, auth.uid()));

CREATE POLICY "Admins can update members"
  ON space_members FOR UPDATE
  USING (is_space_admin(space_id, auth.uid()));

CREATE POLICY "Admins can remove members"
  ON space_members FOR DELETE
  USING (is_space_admin(space_id, auth.uid()));

-- Invitations: Admins can manage invitations
CREATE POLICY "Admins can view invitations"
  ON invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = invitations.space_id
      AND space_members.user_id = auth.uid()
      AND space_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can create invitations"
  ON invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = invitations.space_id
      AND space_members.user_id = auth.uid()
      AND space_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Anyone can view invitation by token"
  ON invitations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Invitees can update their invitation"
  ON invitations FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Workspaces: workspace-level access
CREATE POLICY "Workspace access can view workspaces"
  ON workspaces FOR SELECT
  USING (is_workspace_member(workspaces.id, auth.uid()));

CREATE POLICY "Space members can create workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = workspaces.space_id
      AND space_members.user_id = auth.uid()
      AND space_members.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Workspace admins can update workspaces"
  ON workspaces FOR UPDATE
  USING (is_workspace_admin(workspaces.id, auth.uid()));

CREATE POLICY "Workspace admins can delete workspaces"
  ON workspaces FOR DELETE
  USING (is_workspace_admin(workspaces.id, auth.uid()));

-- Workspace members table policies
CREATE POLICY "Workspace members can view workspace members"
  ON workspace_members FOR SELECT
  USING (is_workspace_member(workspace_members.workspace_id, auth.uid()));

CREATE POLICY "Workspace admins manage workspace members"
  ON workspace_members FOR ALL
  USING (is_workspace_admin(workspace_members.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_admin(workspace_members.workspace_id, auth.uid()));

-- Workspace invitations policies
CREATE POLICY "Workspace admins can view workspace invitations"
  ON workspace_invitations FOR SELECT
  USING (is_workspace_admin(workspace_invitations.workspace_id, auth.uid()));

CREATE POLICY "Workspace admins can create workspace invitations"
  ON workspace_invitations FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_invitations.workspace_id, auth.uid()));

CREATE POLICY "Workspace admins can update workspace invitations"
  ON workspace_invitations FOR UPDATE
  USING (is_workspace_admin(workspace_invitations.workspace_id, auth.uid()))
  WITH CHECK (is_workspace_admin(workspace_invitations.workspace_id, auth.uid()));

CREATE POLICY "Workspace invitees can view by token"
  ON workspace_invitations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Workspace invitees can update their invitations"
  ON workspace_invitations FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Connectors: Workspace access
CREATE POLICY "Workspace access can view connectors"
  ON connectors FOR SELECT
  USING (is_workspace_member(connectors.workspace_id, auth.uid()));

CREATE POLICY "Workspace members can create connectors"
  ON connectors FOR INSERT
  WITH CHECK (is_workspace_member(connectors.workspace_id, auth.uid()));

CREATE POLICY "Creators and admins can update connectors"
  ON connectors FOR UPDATE
  USING (
    created_by = auth.uid()
    OR is_workspace_admin(connectors.workspace_id, auth.uid())
  );

CREATE POLICY "Creators and admins can delete connectors"
  ON connectors FOR DELETE
  USING (
    created_by = auth.uid()
    OR is_workspace_admin(connectors.workspace_id, auth.uid())
  );

-- Documents: Workspace access controls
CREATE POLICY "Workspace access can view documents"
  ON documents FOR SELECT
  USING (is_workspace_member(documents.workspace_id, auth.uid()));

CREATE POLICY "System can insert documents"
  ON documents FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update documents"
  ON documents FOR UPDATE
  USING (true);

CREATE POLICY "Workspace admins can delete documents"
  ON documents FOR DELETE
  USING (is_workspace_admin(documents.workspace_id, auth.uid()));

-- Document Embeddings: Same as documents
CREATE POLICY "Workspace access can view embeddings"
  ON document_embeddings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_embeddings.document_id
        AND is_workspace_member(d.workspace_id, auth.uid())
    )
  );

CREATE POLICY "System can insert embeddings"
  ON document_embeddings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can delete embeddings"
  ON document_embeddings FOR DELETE
  USING (true);

-- Conversations: Workspace access
CREATE POLICY "Workspace access can view conversations"
  ON conversations FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_workspace_member(conversations.workspace_id, auth.uid())
  );

CREATE POLICY "Workspace members can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND is_workspace_member(conversations.workspace_id, auth.uid())
  );

CREATE POLICY "Creators can update conversations"
  ON conversations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Creators and admins can delete conversations"
  ON conversations FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_workspace_admin(conversations.workspace_id, auth.uid())
  );

-- Messages: Conversation members can view messages
CREATE POLICY "Workspace access can view messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          c.user_id = auth.uid()
          OR is_workspace_member(c.workspace_id, auth.uid())
        )
    )
  );

CREATE POLICY "System can insert messages"
  ON messages FOR INSERT
  WITH CHECK (true);

-- Shared Links: Public access to shared conversations
CREATE POLICY "Anyone can view shared links by token"
  ON shared_links FOR SELECT
  USING (true);

CREATE POLICY "Conversation creators can create shared links"
  ON shared_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = shared_links.conversation_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators can delete shared links"
  ON shared_links FOR DELETE
  USING (created_by = auth.uid());

-- Step 6: Create triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist (for idempotency)
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_spaces_updated_at ON spaces;
DROP TRIGGER IF EXISTS update_space_members_updated_at ON space_members;
DROP TRIGGER IF EXISTS update_workspace_members_updated_at ON workspace_members;
DROP TRIGGER IF EXISTS update_workspaces_updated_at ON workspaces;
DROP TRIGGER IF EXISTS update_connectors_updated_at ON connectors;
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
DROP TRIGGER IF EXISTS update_workspace_invitations_updated_at ON workspace_invitations;
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spaces_updated_at BEFORE UPDATE ON spaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_space_members_updated_at BEFORE UPDATE ON space_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workspace_members_updated_at BEFORE UPDATE ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_connectors_updated_at BEFORE UPDATE ON connectors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workspace_invitations_updated_at BEFORE UPDATE ON workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 7: Create function to automatically create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, language)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL),
    CASE
      WHEN LOWER(COALESCE(NEW.raw_user_meta_data->>'language', NEW.raw_user_meta_data->>'preferred_language')) IN ('en', 'nl')
        THEN LOWER(COALESCE(NEW.raw_user_meta_data->>'language', NEW.raw_user_meta_data->>'preferred_language'))
      ELSE 'en'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Migration complete!
-- You can now use AGORA with full multi-tenant support.
