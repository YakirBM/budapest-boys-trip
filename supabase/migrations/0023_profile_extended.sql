-- 0023_profile_extended.sql — full profile edit for the live header (docs/14 §1.5).
-- Additive/nullable only. profiles already has phone + avatar_url (0002_core);
-- this adds full address, storage avatar path, and ICE emergency contact.
-- Private columns (address/ice) are readable only by the row owner; the app
-- must use v_profile_private or the updateMyProfileAction for them and never
-- render them in shared views (docs/04).

alter table public.profiles
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists avatar_path text,
  add column if not exists ice_name text,
  add column if not exists ice_phone text;

-- Private self-only view for the profile form (owner row only).
create or replace view public.v_profile_private as
select id, full_name, heb_name, phone, avatar_url, avatar_path, birth_date,
       citizenships, address_line, city, country, ice_name, ice_phone,
       created_at, updated_at
from public.profiles
where id = auth.uid();

-- Private avatars bucket (no public access, docs/04 T4).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880,
  array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = excluded.public;

do $$
declare c int;
begin
  select count(*) into c from storage.buckets where id = 'avatars' and public = true;
  if c > 0 then
    raise exception 'BUCKET MISCONFIGURATION: public buckets are forbidden (docs/04 T4)';
  end if;
end $$;

-- Own avatar path only: {user_id}/...
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
