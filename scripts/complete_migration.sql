-- AGORA Complete Database Migration
-- Run this script in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Step 1: Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Step 2: Create core tables
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
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

CREATE TABLE IF NOT EXISTS connectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('google_drive', 'notion', 'confluence', 'sharepoint', 'dropbox')),
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
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create indexes
CREATE INDEX idx_space_members_space_id ON space_members(space_id);
CREATE INDEX idx_space_members_user_id ON space_members(user_id);
CREATE INDEX idx_workspaces_space_id ON workspaces(space_id);
CREATE INDEX idx_connectors_workspace_id ON connectors(workspace_id);
CREATE INDEX idx_documents_connector_id ON documents(connector_id);
CREATE INDEX idx_documents_workspace_id ON documents(workspace_id);
CREATE INDEX idx_document_embeddings_document_id ON document_embeddings(document_id);
CREATE INDEX idx_conversations_workspace_id ON conversations(workspace_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_shared_links_token ON shared_links(token);

-- Vector similarity search index
CREATE INDEX ON document_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Step 4: Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_links ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS Policies

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
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = spaces.id
      AND space_members.user_id = auth.uid()
    )
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
CREATE POLICY "Members can view space members"
  ON space_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM space_members sm
      WHERE sm.space_id = space_members.space_id
      AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can add members"
  ON space_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM space_members sm
      WHERE sm.space_id = space_members.space_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update members"
  ON space_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM space_members sm
      WHERE sm.space_id = space_members.space_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can remove members"
  ON space_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM space_members sm
      WHERE sm.space_id = space_members.space_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

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

-- Workspaces: Space members can view workspaces
CREATE POLICY "Space members can view workspaces"
  ON workspaces FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = workspaces.space_id
      AND space_members.user_id = auth.uid()
    )
  );

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

CREATE POLICY "Admins can update workspaces"
  ON workspaces FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = workspaces.space_id
      AND space_members.user_id = auth.uid()
      AND space_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete workspaces"
  ON workspaces FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM space_members
      WHERE space_members.space_id = workspaces.space_id
      AND space_members.user_id = auth.uid()
      AND space_members.role IN ('owner', 'admin')
    )
  );

-- Connectors: Workspace members can view connectors
CREATE POLICY "Workspace members can view connectors"
  ON connectors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = connectors.workspace_id
      AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can create connectors"
  ON connectors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = connectors.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Creators and admins can update connectors"
  ON connectors FOR UPDATE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = connectors.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Creators and admins can delete connectors"
  ON connectors FOR DELETE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = connectors.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

-- Documents: Workspace members can view documents
CREATE POLICY "Workspace members can view documents"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = documents.workspace_id
      AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert documents"
  ON documents FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update documents"
  ON documents FOR UPDATE
  USING (true);

CREATE POLICY "Admins can delete documents"
  ON documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = documents.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

-- Document Embeddings: Same as documents
CREATE POLICY "Workspace members can view embeddings"
  ON document_embeddings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN workspaces w ON w.id = d.workspace_id
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE d.id = document_embeddings.document_id
      AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert embeddings"
  ON document_embeddings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can delete embeddings"
  ON document_embeddings FOR DELETE
  USING (true);

-- Conversations: Workspace members can view conversations
CREATE POLICY "Workspace members can view conversations"
  ON conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = conversations.workspace_id
      AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = conversations.workspace_id
      AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators can update conversations"
  ON conversations FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Creators and admins can delete conversations"
  ON conversations FOR DELETE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE w.id = conversations.workspace_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
    )
  );

-- Messages: Conversation members can view messages
CREATE POLICY "Conversation members can view messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN workspaces w ON w.id = c.workspace_id
      JOIN space_members sm ON sm.space_id = w.space_id
      WHERE c.id = messages.conversation_id
      AND sm.user_id = auth.uid()
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
      AND c.created_by = auth.uid()
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

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spaces_updated_at BEFORE UPDATE ON spaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_space_members_updated_at BEFORE UPDATE ON space_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_connectors_updated_at BEFORE UPDATE ON connectors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 7: Create function to automatically create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Migration complete!
-- You can now use AGORA with full multi-tenant support.
