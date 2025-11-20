-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    coalesce(new.raw_user_meta_data->>'avatar_url', null)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Trigger to auto-create profile on signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Function to auto-update updated_at timestamps
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Add updated_at triggers to tables
create trigger set_updated_at before update on public.spaces
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.space_members
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.invitations
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.workspace_members
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.workspace_invitations
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.workspaces
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.connectors
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.documents
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.conversations
  for each row execute function public.handle_updated_at();

-- Function to auto-add creator as space owner
create or replace function public.handle_new_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Add the creator as an owner of the space
  insert into public.space_members (space_id, user_id, role)
  values (new.id, auth.uid(), 'owner');
  
  return new;
end;
$$;

-- Trigger to auto-add space owner on space creation
drop trigger if exists on_space_created on public.spaces;
create trigger on_space_created
  after insert on public.spaces
  for each row
  execute function public.handle_new_space();
