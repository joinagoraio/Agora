-- Demo packs carry the authority type, the headings each interest is worked up under,
-- and the interests the loaded programme starts with.
alter table public.platform_demo_packs
  add column if not exists space_type text,
  add column if not exists workup_headings jsonb not null default '[]'::jsonb,
  add column if not exists focus_interests text[] not null default '{}';

alter table public.platform_demo_packs
  drop constraint if exists platform_demo_packs_space_type_check;
alter table public.platform_demo_packs
  add constraint platform_demo_packs_space_type_check
  check (space_type is null or space_type in ('national', 'regional', 'municipal', 'party', 'other'));
