-- Projecten: één rij per project, met het volledige plan als JSON-document.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  data jsonb not null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- een plan van 300 muren en 500 meubels is ruim onder 2 MB; dit vangt ongelukken op
  constraint projects_data_size check (pg_column_size(data) < 10485760)
);

create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);

-- updated_at automatisch bijwerken
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- Row Level Security: iedereen ziet en wijzigt enkel zijn eigen projecten.
alter table public.projects enable row level security;

create policy "Eigen projecten bekijken" on public.projects
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Eigen projecten aanmaken" on public.projects
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Eigen projecten wijzigen" on public.projects
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Eigen projecten verwijderen" on public.projects
  for delete to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.projects from anon;
