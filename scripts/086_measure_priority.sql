-- Staff set a priority on each measure; drafting orders measures by it.
alter table public.programme_measures
  add column if not exists priority text,
  add column if not exists priority_reason text,
  add column if not exists prioritised_by uuid references auth.users (id) on delete set null,
  add column if not exists prioritised_at timestamptz;

alter table public.programme_measures
  drop constraint if exists programme_measures_priority_check;
alter table public.programme_measures
  add constraint programme_measures_priority_check
  check (priority is null or priority in ('high', 'medium', 'low'));
