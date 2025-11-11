-- Drop and recreate space_members policies to avoid calling helper functions

-- Drop existing policies on space_members that cause recursion
drop policy if exists "Users can view members of their spaces" on public.space_members;
drop policy if exists "Space admins can insert members" on public.space_members;
drop policy if exists "Space admins can update members" on public.space_members;
drop policy if exists "Space admins can delete members" on public.space_members;

-- Recreate space_members policies WITHOUT using helper functions to avoid recursion
-- These policies use direct subqueries instead of calling is_space_member() or has_space_role()

create policy "Users can view members of their spaces"
  on public.space_members for select
  using (
    exists (
      select 1 from public.space_members sm
      where sm.space_id = space_members.space_id
      and sm.user_id = auth.uid()
    )
  );

create policy "Space admins can insert members"
  on public.space_members for insert
  with check (
    exists (
      select 1 from public.space_members sm
      where sm.space_id = space_members.space_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin')
    )
  );

create policy "Space admins can update members"
  on public.space_members for update
  using (
    exists (
      select 1 from public.space_members sm
      where sm.space_id = space_members.space_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin')
    )
  );

create policy "Space admins can delete members"
  on public.space_members for delete
  using (
    exists (
      select 1 from public.space_members sm
      where sm.space_id = space_members.space_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin')
    )
  );

-- Drop existing helper functions
drop function if exists public.is_space_member(uuid);
drop function if exists public.has_space_role(uuid, user_role);

-- Updated helper functions to use plpgsql and SECURITY DEFINER

-- Recreate helper functions with SECURITY DEFINER to bypass RLS
-- This prevents infinite recursion when RLS policies call these functions

create or replace function public.is_space_member(space_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.space_members
    where space_members.space_id = is_space_member.space_id
    and space_members.user_id = auth.uid()
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.has_space_role(space_id uuid, required_role user_role)
returns boolean as $$
begin
  return exists (
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
end;
$$ language plpgsql security definer set search_path = public;

-- Grant execute permissions to authenticated users
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.has_space_role(uuid, user_role) to authenticated;
