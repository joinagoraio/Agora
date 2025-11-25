-- Allow users to update their own profile (needed for language preference)
begin;

grant update on public.profiles to authenticated;

drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

commit;

