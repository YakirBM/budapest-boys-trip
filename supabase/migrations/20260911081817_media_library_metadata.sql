-- Add virtual albums and searchable, editable metadata without moving private
-- storage objects. Existing media rows remain valid with nullable metadata.

create table public.media_albums (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 240),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index media_albums_trip_name_unique
  on public.media_albums (trip_id, lower(btrim(name)));
create index media_albums_trip_created on public.media_albums (trip_id, created_at desc);

alter table public.media_items
  add column title text check (title is null or char_length(title) <= 120),
  add column original_filename text check (original_filename is null or char_length(original_filename) <= 180),
  add column album_id uuid references public.media_albums(id) on delete set null,
  add column tags text[] not null default '{}' check (cardinality(tags) <= 20);

create index media_items_album on public.media_items (album_id) where status = 'active';
create index media_items_place on public.media_items (linked_place_id) where status = 'active';
create index media_items_tags on public.media_items using gin (tags) where status = 'active';

alter table public.media_albums enable row level security;
grant select, insert, update, delete on public.media_albums to authenticated;
revoke all on public.media_albums from anon;

create policy media_albums_select on public.media_albums for select to authenticated
  using (is_trip_member(trip_id));
create policy media_albums_insert on public.media_albums for insert to authenticated
  with check (created_by = (select auth.uid()) and is_active_trip_member(trip_id));
create policy media_albums_update on public.media_albums for update to authenticated
  using (created_by = (select auth.uid()) and is_active_trip_member(trip_id))
  with check (created_by = (select auth.uid()) and is_active_trip_member(trip_id));
create policy media_albums_delete on public.media_albums for delete to authenticated
  using (created_by = (select auth.uid()) and is_active_trip_member(trip_id));

drop policy media_update on public.media_items;
create policy media_update on public.media_items for update to authenticated
  using (uploader_id = (select auth.uid()) and is_active_trip_member(trip_id))
  with check (uploader_id = (select auth.uid()) and is_active_trip_member(trip_id));

create trigger media_albums_set_updated_at
  before update on public.media_albums
  for each row execute function public.set_updated_at();
