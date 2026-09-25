-- A demo pack can carry a guided tour: the demo order, what to say, and where each step happens.
alter table public.platform_demo_packs
  add column if not exists tour jsonb;

-- Recorded narration for demo tours. Public, so the browser can play it without signing each file.
insert into storage.buckets (id, name, public)
values ('demo-narration', 'demo-narration', true)
on conflict (id) do nothing;
