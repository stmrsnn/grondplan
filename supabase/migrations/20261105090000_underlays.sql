-- Onderleggers: foto's en pdf's (als afbeelding) om over te trekken.
-- Privé: elke gebruiker leest en schrijft enkel in zijn eigen map <user-id>/…
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onderleggers', 'onderleggers', false, 15728640, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Eigen onderleggers bekijken" on storage.objects
  for select to authenticated
  using (bucket_id = 'onderleggers' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Eigen onderleggers opladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'onderleggers' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Eigen onderleggers verwijderen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'onderleggers' and (storage.foldername(name))[1] = (select auth.uid())::text);
