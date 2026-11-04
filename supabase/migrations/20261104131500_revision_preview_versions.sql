-- Revisienummer (wijzigingen in twee vensters herkennen), miniatuur voor de projectkaart
-- en een versiegeschiedenis per project (hoogstens 50 versies).
alter table public.projects
  add column revision integer not null default 1,
  add column preview jsonb,
  add constraint projects_preview_size check (preview is null or pg_column_size(preview) < 65536);

create or replace function public.bump_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger projects_bump_revision
before update on public.projects
for each row execute function public.bump_revision();

create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  constraint project_versions_data_size check (pg_column_size(data) < 10485760)
);

create index project_versions_project_created_idx on public.project_versions (project_id, created_at desc);
create index project_versions_owner_idx on public.project_versions (owner_id);

alter table public.project_versions enable row level security;

create policy "Eigen versies bekijken" on public.project_versions
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Eigen versies aanmaken" on public.project_versions
  for insert to authenticated with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );
create policy "Eigen versies verwijderen" on public.project_versions
  for delete to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.project_versions from anon;

create or replace function public.trim_project_versions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.project_versions v
  where v.project_id = new.project_id
    and v.id not in (
      select id from public.project_versions
      where project_id = new.project_id
      order by created_at desc
      limit 50
    );
  return null;
end;
$$;

revoke execute on function public.trim_project_versions() from public, anon, authenticated;

create trigger project_versions_trim
after insert on public.project_versions
for each row execute function public.trim_project_versions();
