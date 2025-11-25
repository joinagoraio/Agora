-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create enum types
create type user_role as enum ('owner', 'admin', 'member', 'viewer');
create type invitation_status as enum ('pending', 'accepted', 'declined', 'expired');
create type connector_type as enum ('google_drive', 'notion', 'confluence', 'sharepoint', 'dropbox');
create type connector_status as enum ('active', 'inactive', 'error');
create type document_status as enum ('processing', 'ready', 'error');

-- Spaces (tenant/organization level)
create table if not exists public.spaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  language text not null default 'en' check (language in ('en','nl')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Space members (multi-tenancy)
create table if not exists public.space_members (
  id uuid primary key default uuid_generate_v4(),
  space_id uuid references public.spaces(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role user_role not null default 'member',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(space_id, user_id)
);

-- Invitations
create table if not exists public.invitations (
  id uuid primary key default uuid_generate_v4(),
  space_id uuid references public.spaces(id) on delete cascade not null,
  email text not null,
  role user_role not null default 'member',
  status invitation_status not null default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  token text unique not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Workspace members (workspace-scoped access)
create table if not exists public.workspace_members (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null check (role in ('admin', 'member', 'viewer')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(workspace_id, user_id)
);

-- Workspace invitations
create table if not exists public.workspace_invitations (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  email text not null,
  role text not null check (role in ('admin', 'member', 'viewer')),
  status invitation_status not null default 'pending',
  token text unique not null,
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamp with time zone not null,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Workspaces (sub-spaces within a space)
create table if not exists public.workspaces (
  id uuid primary key default uuid_generate_v4(),
  space_id uuid references public.spaces(id) on delete cascade not null,
  name text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Document Connectors
create table if not exists public.connectors (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name text not null,
  type connector_type not null,
  config jsonb not null default '{}'::jsonb,
  status connector_status not null default 'active',
  last_sync_at timestamp with time zone,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Documents (synced from connectors)
create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  connector_id uuid references public.connectors(id) on delete cascade not null,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  title text not null,
  content text,
  external_id text not null,
  external_url text,
  metadata jsonb default '{}'::jsonb,
  status document_status not null default 'processing',
  synced_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(connector_id, external_id)
);

-- Document Embeddings (for RAG)
create table if not exists public.document_embeddings (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references public.documents(id) on delete cascade not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  unique(document_id, chunk_index)
);

-- Conversations (chat history)
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Messages (chat messages)
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  sources jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now()
);

-- Shared Links (public access)
create table if not exists public.shared_links (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  token text unique not null,
  expires_at timestamp with time zone,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- Create indexes for performance
create index idx_space_members_space_id on public.space_members(space_id);
create index idx_space_members_user_id on public.space_members(user_id);
create index idx_workspace_members_workspace_id on public.workspace_members(workspace_id);
create index idx_workspace_members_user_id on public.workspace_members(user_id);
create index idx_workspaces_space_id on public.workspaces(space_id);
create index idx_connectors_workspace_id on public.connectors(workspace_id);
create index idx_documents_connector_id on public.documents(connector_id);
create index idx_documents_workspace_id on public.documents(workspace_id);
create index idx_document_embeddings_document_id on public.document_embeddings(document_id);
create index idx_conversations_workspace_id on public.conversations(workspace_id);
create index idx_conversations_user_id on public.conversations(user_id);
create index idx_messages_conversation_id on public.messages(conversation_id);
create index idx_invitations_token on public.invitations(token);
create index idx_workspace_invitations_workspace_id on public.workspace_invitations(workspace_id);
create index idx_workspace_invitations_email on public.workspace_invitations(email);
create index idx_workspace_invitations_token on public.workspace_invitations(token);
create index idx_shared_links_token on public.shared_links(token);
