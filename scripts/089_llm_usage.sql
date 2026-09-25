-- Token use and cost of each AI call, so a programme or a demo can show what it cost.
create table if not exists public.llm_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  space_id uuid references public.spaces(id) on delete set null,
  kind text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6)
);

create index if not exists idx_llm_usage_space on public.llm_usage (space_id, created_at desc);
create index if not exists idx_llm_usage_workspace on public.llm_usage (workspace_id, created_at desc);

alter table public.llm_usage enable row level security;

drop policy if exists "Super admins read llm usage" on public.llm_usage;
create policy "Super admins read llm usage" on public.llm_usage
  for select using (public.is_super_admin(auth.uid()));
