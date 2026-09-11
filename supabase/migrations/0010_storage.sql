-- 0010_storage.sql — private buckets, storage_trip_id(), storage.objects policies
-- (docs/03 §7, docs/04 §6). Hard rule 2: no public buckets. Hard rule T4: a
-- migration-time assertion fails the run if a bucket is public.
-- doc 06-features/07 / BUILD_STATUS: the trip is photos-only — video/mp4 is NOT
-- accepted in trip-media (image mime types only).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('trip-media',     'trip-media',     false, 26214400,  -- 25 MB
   array['image/jpeg','image/png','image/webp','image/heic']),
  ('trip-documents', 'trip-documents', false, 10485760,  -- 10 MB
   array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set file_size_limit     = excluded.file_size_limit,
                               allowed_mime_types  = excluded.allowed_mime_types,
                               public              = excluded.public;

-- Fail loudly (T4) if either bucket ended up public after the insert/update.
do $$
declare c int;
begin
  select count(*) into c from storage.buckets
   where id in ('trip-media','trip-documents') and public = true;
  if c > 0 then
    raise exception 'BUCKET MISCONFIGURATION: public buckets are forbidden (docs/04 T4)';
  end if;
end $$;

-- Parse `trips/{trip_id}/...` out of a storage object path. Never cast unvalidated
-- text to uuid (throws) — validate the shape first.
create or replace function public.storage_trip_id(p_path text)
returns uuid language plpgsql stable as $$
declare v text;
begin
  if (storage.foldername(p_path))[1] <> 'trips' then return null; end if;
  v := (storage.foldername(p_path))[2];
  if v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return v::uuid;
end $$;

-- An INSERT policy is required for uploads...
create policy storage_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('trip-media','trip-documents') and is_active_trip_member(storage_trip_id(name)));
-- ...and a SELECT policy is ALSO required (Supabase HEADs the object first —
-- a missing SELECT policy makes uploads fail silently on some client versions).
create policy storage_select on storage.objects for select to authenticated using (
  bucket_id in ('trip-media','trip-documents') and is_trip_member(storage_trip_id(name)));
-- Delete: trip owner, or the owner of the user-folder the object lives in
-- (path segment 3 = {user_id} under trips/{trip_id}/{kind}/{user_id}/...).
create policy storage_delete on storage.objects for delete to authenticated using (
  bucket_id in ('trip-media','trip-documents')
  and (is_trip_owner(storage_trip_id(name)) or (storage.foldername(name))[3] = auth.uid()::text));

-- Clients never get permanent URLs: signed URLs with TTL 1 hour (max 24h for
-- boarding passes on the flight day). trip-documents is signed-URL-only and never
-- rendered in shared views (rule 3).
