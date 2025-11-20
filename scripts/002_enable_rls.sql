-- Enable Row Level Security on all tables
alter table public.spaces enable row level security;
alter table public.profiles enable row level security;
alter table public.space_members enable row level security;
alter table public.invitations enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.connectors enable row level security;
alter table public.documents enable row level security;
alter table public.document_embeddings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.shared_links enable row level security;

-- Profiles policies
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Helper function to check space membership
create or replace function public.is_space_member(space_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.space_members
    where space_members.space_id = is_space_member.space_id
    and space_members.user_id = auth.uid()
  );
$$ language sql security definer;

-- Helper function to check space role
create or replace function public.has_space_role(space_id uuid, required_role user_role)
returns boolean as $$
  select exists (
    select 1 from public.space_members
    where space_members.space_id = has_space_role.space_id
    and space_members.user_id = auth.uid()
    and (
      case required_role
        when 'owner' then space_members.role = 'owner'
        when 'admin' then space_members.role in ('owner', 'admin')
        when 'member' then space_members.role in ('owner', 'admin', 'member')
        when 'viewer' then space_members.role in ('owner', 'admin', 'member', 'viewer')
      end
    )
  );
$$ language sql security definer;

-- Helper functions for workspace membership
create or replace function public.is_workspace_member(workspace_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.workspaces
    where workspaces.id = is_workspace_member.workspace_id
      and (workspaces.created_by = auth.uid())
  )
  or exists (
    select 1 from public.workspace_members
    where workspace_members.workspace_id = is_workspace_member.workspace_id
      and workspace_members.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.workspaces
    where workspaces.id = is_workspace_member.workspace_id
      and public.has_space_role(workspaces.space_id, 'admin')
  );
$$ language sql security definer;

create or replace function public.is_workspace_admin(workspace_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.workspaces
    where workspaces.id = is_workspace_admin.workspace_id
      and (
        workspaces.created_by = auth.uid()
        or public.has_space_role(workspaces.space_id, 'admin')
      )
  )
  or exists (
    select 1 from public.workspace_members
    where workspace_members.workspace_id = is_workspace_admin.workspace_id
      and workspace_members.user_id = auth.uid()
      and workspace_members.role = 'admin'
  );
$$ language sql security definer;

-- Spaces policies
create policy "Users can view spaces they are members of"
  on public.spaces for select
  using (public.is_space_member(id));

create policy "Space owners can update their spaces"
  on public.spaces for update
  using (public.has_space_role(id, 'owner'));

create policy "Authenticated users can create spaces"
  on public.spaces for insert
  with check (auth.uid() is not null);

create policy "Space owners can delete their spaces"
  on public.spaces for delete
  using (public.has_space_role(id, 'owner'));

-- Space members policies
create policy "Users can view members of their spaces"
  on public.space_members for select
  using (public.is_space_member(space_id));

create policy "Space admins can insert members"
  on public.space_members for insert
  with check (public.has_space_role(space_id, 'admin'));

create policy "Space admins can update members"
  on public.space_members for update
  using (public.has_space_role(space_id, 'admin'));

create policy "Space admins can delete members"
  on public.space_members for delete
  using (public.has_space_role(space_id, 'admin'));

-- Invitations policies
create policy "Users can view invitations for their spaces"
  on public.invitations for select
  using (public.is_space_member(space_id) or email = (select email from public.profiles where id = auth.uid()));

create policy "Space admins can create invitations"
  on public.invitations for insert
  with check (public.has_space_role(space_id, 'admin'));

create policy "Space admins can update invitations"
  on public.invitations for update
  using (public.has_space_role(space_id, 'admin'));

create policy "Space admins can delete invitations"
  on public.invitations for delete
  using (public.has_space_role(space_id, 'admin'));

-- Workspaces policies
create policy "Workspace access can view workspaces"
  on public.workspaces for select
  using (public.is_workspace_member(id));

create policy "Space members can create workspaces"
  on public.workspaces for insert
  with check (public.has_space_role(space_id, 'member'));

create policy "Workspace admins can update workspaces"
  on public.workspaces for update
  using (public.is_workspace_admin(id));

create policy "Workspace admins can delete workspaces"
  on public.workspaces for delete
  using (public.is_workspace_admin(id));

-- Connectors policies
create policy "Workspace access can view connectors"
  on public.connectors for select
  using (public.is_workspace_member(connectors.workspace_id));

create policy "Workspace members can create connectors"
  on public.connectors for insert
  with check (public.is_workspace_member(connectors.workspace_id));

create policy "Workspace admins or creators can update connectors"
  on public.connectors for update
  using (public.is_workspace_admin(connectors.workspace_id) or created_by = auth.uid());

create policy "Workspace admins or creators can delete connectors"
  on public.connectors for delete
  using (public.is_workspace_admin(connectors.workspace_id) or created_by = auth.uid());

-- Documents policies
create policy "Workspace access can view documents"
  on public.documents for select
  using (public.is_workspace_member(documents.workspace_id));

create policy "System can manage documents"
  on public.documents for all
  using (true)
  with check (true);

-- Document embeddings policies
create policy "Workspace access can view embeddings"
  on public.document_embeddings for select
  using (exists (
    select 1 from public.documents
    where documents.id = document_embeddings.document_id
      and public.is_workspace_member(documents.workspace_id)
  ));

-- Conversations policies
create policy "Workspace access can view conversations"
  on public.conversations for select
  using (user_id = auth.uid() or public.is_workspace_member(conversations.workspace_id));

create policy "Workspace members can create conversations"
  on public.conversations for insert
  with check (user_id = auth.uid() and public.is_workspace_member(conversations.workspace_id));

create policy "Users can update their own conversations"
  on public.conversations for update
  using (user_id = auth.uid());

create policy "Creators or admins can delete conversations"
  on public.conversations for delete
  using (user_id = auth.uid() or public.is_workspace_admin(conversations.workspace_id));

-- Messages policies
create policy "Workspace access can view messages"
  on public.messages for select
  using (exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
      and (conversations.user_id = auth.uid() or public.is_workspace_member(conversations.workspace_id))
  ));

create policy "Users can create messages in their conversations"
  on public.messages for insert
  with check (exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
    and conversations.user_id = auth.uid()
  ));

-- Workspace members policies
create policy "Workspace members can view workspace members"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

create policy "Workspace admins manage workspace members"
  on public.workspace_members for all
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- Workspace invitations policies
create policy "Workspace admins can manage workspace invitations"
  on public.workspace_invitations for all
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "Workspace invitees can view their invitations"
  on public.workspace_invitations for select
  using (auth.uid() is not null);

create policy "Workspace invitees can update their invitations"
  on public.workspace_invitations for update
  using (auth.uid() is not null);

-- Shared links policies (public access)
create policy "Anyone can view shared conversations via token"
  on public.shared_links for select
  using (expires_at is null or expires_at > now());

create policy "Users can create shared links for their conversations"
  on public.shared_links for insert
  with check (exists (
    select 1 from public.conversations
    where conversations.id = shared_links.conversation_id
    and conversations.user_id = auth.uid()
  ));

create policy "Users can delete their own shared links"
  on public.shared_links for delete
  using (created_by = auth.uid());
