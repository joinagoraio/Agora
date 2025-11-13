-- Add context scoping to conversations
alter table public.conversations
  add column if not exists context_type text not null default 'workspace',
  add column if not exists context_id uuid;

create index if not exists conversations_workspace_context_idx
  on public.conversations (workspace_id, context_type, context_id);
