-- What the room asked during a demo, and the summary made from it. Kept after the demo authority is
-- ended, so the feedback for improving Agora survives; only platform admins can read it.
create table if not exists public.demo_feedback_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pack_id uuid references public.platform_demo_packs(id) on delete set null,
  space_id uuid,
  workspace_id uuid,
  demo_name text,
  source text not null check (source in ('ask', 'questions')),
  source_id text,
  step_id text,
  language text,
  question text not null,
  answer text
);

-- Empty source ids never clash, so spoken questions (which have none) are all kept.
drop index if exists public.idx_demo_feedback_source;
create unique index if not exists idx_demo_feedback_source on public.demo_feedback_log (source, source_id);
create index if not exists idx_demo_feedback_space on public.demo_feedback_log (space_id, created_at);

create table if not exists public.demo_digests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pack_id uuid references public.platform_demo_packs(id) on delete set null,
  space_id uuid,
  workspace_id uuid,
  demo_name text,
  language text,
  entries integer not null default 0,
  body_markdown text not null
);

create index if not exists idx_demo_digests_pack on public.demo_digests (pack_id, created_at desc);
create index if not exists idx_demo_digests_space on public.demo_digests (space_id, created_at desc);

alter table public.demo_feedback_log enable row level security;
alter table public.demo_digests enable row level security;

drop policy if exists "Super admins read demo feedback" on public.demo_feedback_log;
create policy "Super admins read demo feedback" on public.demo_feedback_log
  for select using (public.is_super_admin(auth.uid()));

drop policy if exists "Super admins read demo digests" on public.demo_digests;
create policy "Super admins read demo digests" on public.demo_digests
  for select using (public.is_super_admin(auth.uid()));
