-- 0022_media_organization.sql — Memory Wall organization (docs/14 §6, Tab 4).
-- Additive + idempotent. Reconciled with 0001…0016 + the 20260911* media migrations:
--   * media_albums was created in 20260911081817_media_library_metadata.sql with
--     (id, trip_id, name, description, created_by, created_at, updated_at).
--     This migration adds visibility / owner_id / cover_item_id only.
--   * media_items was created in 0007_media.sql (visibility 'group'/'private',
--     tagged_member_ids uuid[], linked_place_id uuid FK places, day_number, …)
--     and extended in 20260911081817 (title, original_filename, album_id,
--     tags text[]). This migration adds people / place_id / address_text /
--     taken_at / lat / lng only — never re-adds existing columns.
--   * people[] / place_id intentionally mirror the legacy tagged_member_ids /
--     linked_place_id (kept so the existing upload pipeline + server actions keep
--     working during rollout). Backfilled below so old and new readers agree.
--   * No storage changes: trip-media stays private (asserted, docs/04 T4).
--   * Photo GPS (lat/lng/taken_at) is stored ONLY from the user-uploaded file
--     when the user confirms it in the upload/edit sheet (see
--     media.locationNote); never from device Locate-me. Canvas re-encode still
--     strips embedded EXIF before anything reaches storage.

-- ---------------------------------------------------------------------------
-- media_albums additions
-- ---------------------------------------------------------------------------
alter table public.media_albums
  add column if not exists visibility text not null default 'shared',
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists cover_item_id uuid;

-- Column may pre-exist as nullable from a partial run: backfill + enforce.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'media_albums'
      and column_name = 'visibility' and is_nullable = 'YES'
  ) then
    update public.media_albums set visibility = 'shared' where visibility is null;
    alter table public.media_albums alter column visibility set not null;
  end if;
end $$;

alter table public.media_albums alter column visibility set default 'shared';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'media_albums_visibility_allowed') then
    alter table public.media_albums
      add constraint media_albums_visibility_allowed check (visibility in ('shared', 'private'));
  end if;
end $$;

-- Default the album owner to its creator so legacy rows have an owner.
update public.media_albums set owner_id = created_by where owner_id is null;

-- Cover pointer (display hint only; visibility filtering stays row-based).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'media_albums_cover_item_fkey') then
    alter table public.media_albums
      add constraint media_albums_cover_item_fkey
      foreign key (cover_item_id) references public.media_items(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- media_items additions
-- ---------------------------------------------------------------------------
alter table public.media_items
  add column if not exists people uuid[] not null default '{}',
  add column if not exists place_id uuid references public.places(id) on delete set null,
  add column if not exists address_text text,
  add column if not exists taken_at timestamptz,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'media_items_address_len') then
    alter table public.media_items
      add constraint media_items_address_len
      check (address_text is null or char_length(address_text) between 1 and 240);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'media_items_lat_range') then
    alter table public.media_items
      add constraint media_items_lat_range
      check (lat is null or (lat between -90 and 90));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'media_items_lng_range') then
    alter table public.media_items
      add constraint media_items_lng_range
      check (lng is null or (lng between -180 and 180));
  end if;
end $$;

-- Backfill new mirrors from legacy columns (idempotent: only fills empties).
update public.media_items
set people = tagged_member_ids
where people = '{}' and coalesce(cardinality(tagged_member_ids), 0) > 0;

update public.media_items
set place_id = linked_place_id
where place_id is null and linked_place_id is not null;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists media_items_place_new on public.media_items (place_id)
  where status = 'active';
create index if not exists media_items_people on public.media_items using gin (people)
  where status = 'active';
create index if not exists media_items_taken on public.media_items (taken_at desc)
  where status = 'active';
create index if not exists media_items_geo on public.media_items (lat, lng)
  where status = 'active' and lat is not null and lng is not null;
create index if not exists media_albums_visibility on public.media_albums (trip_id, visibility);
create index if not exists media_albums_owner on public.media_albums (owner_id);
create index if not exists media_albums_cover on public.media_albums (cover_item_id)
  where cover_item_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: private-album items are owner/member-only; shared albums stay trip-wide.
-- A private album is visible to its creator/owner, the item uploader, or the
-- trip owner. Album membership is intentionally NOT a separate table in v1.
-- ---------------------------------------------------------------------------
drop policy if exists media_albums_select on public.media_albums;
create policy media_albums_select on public.media_albums for select to authenticated
  using (
    is_trip_member(trip_id)
    and (
      visibility = 'shared'
      or created_by = (select auth.uid())
      or owner_id = (select auth.uid())
      or is_trip_owner(trip_id)
    )
  );

drop policy if exists media_albums_insert on public.media_albums;
create policy media_albums_insert on public.media_albums for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and is_active_trip_member(trip_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

drop policy if exists media_albums_update on public.media_albums;
create policy media_albums_update on public.media_albums for update to authenticated
  using (created_by = (select auth.uid()) and is_active_trip_member(trip_id))
  with check (
    created_by = (select auth.uid())
    and is_active_trip_member(trip_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

-- media_items select: legacy private-item rule + private-album rule.
drop policy if exists media_select on public.media_items;
create policy media_select on public.media_items for select to authenticated
  using (
    status = 'active'
    and is_trip_member(trip_id)
    and (visibility = 'group' or uploader_id = (select auth.uid()))
    and (
      album_id is null
      or exists (
        select 1 from public.media_albums album
        where album.id = media_items.album_id
          and (
            album.visibility = 'shared'
            or album.created_by = (select auth.uid())
            or album.owner_id = (select auth.uid())
            or media_items.uploader_id = (select auth.uid())
            or is_trip_owner(album.trip_id)
          )
      )
    )
  );

-- media_items insert/update: keep the 20260911083601 trip-scope guards and
-- extend them to the new place_id / people mirrors.
drop policy if exists media_insert on public.media_items;
create policy media_insert on public.media_items for insert to authenticated
  with check (
    uploader_id = (select auth.uid())
    and is_active_trip_member(trip_id)
    and (album_id is null or exists (
      select 1 from public.media_albums album
      where album.id = album_id and album.trip_id = media_items.trip_id
    ))
    and (linked_place_id is null or exists (
      select 1 from public.places place
      where place.id = linked_place_id and place.trip_id = media_items.trip_id
    ))
    and (place_id is null or exists (
      select 1 from public.places place
      where place.id = place_id and place.trip_id = media_items.trip_id
    ))
    and not exists (
      select 1 from unnest(tagged_member_ids) as tagged(user_id)
      where not exists (
        select 1 from public.trip_members member
        where member.trip_id = media_items.trip_id
          and member.user_id = tagged.user_id
          and member.status = 'active'
      )
    )
    and not exists (
      select 1 from unnest(people) as tagged(user_id)
      where not exists (
        select 1 from public.trip_members member
        where member.trip_id = media_items.trip_id
          and member.user_id = tagged.user_id
          and member.status = 'active'
      )
    )
  );

drop policy if exists media_update on public.media_items;
create policy media_update on public.media_items for update to authenticated
  using (uploader_id = (select auth.uid()) and is_active_trip_member(trip_id))
  with check (
    uploader_id = (select auth.uid())
    and is_active_trip_member(trip_id)
    and (album_id is null or exists (
      select 1 from public.media_albums album
      where album.id = album_id and album.trip_id = media_items.trip_id
    ))
    and (linked_place_id is null or exists (
      select 1 from public.places place
      where place.id = linked_place_id and place.trip_id = media_items.trip_id
    ))
    and (place_id is null or exists (
      select 1 from public.places place
      where place.id = place_id and place.trip_id = media_items.trip_id
    ))
    and not exists (
      select 1 from unnest(tagged_member_ids) as tagged(user_id)
      where not exists (
        select 1 from public.trip_members member
        where member.trip_id = media_items.trip_id
          and member.user_id = tagged.user_id
          and member.status = 'active'
      )
    )
    and not exists (
      select 1 from unnest(people) as tagged(user_id)
      where not exists (
        select 1 from public.trip_members member
        where member.trip_id = media_items.trip_id
          and member.user_id = tagged.user_id
          and member.status = 'active'
      )
    )
  );

-- Reactions follow the same album-aware visibility as their media row.
drop policy if exists media_reactions_select on public.media_reactions;
create policy media_reactions_select on public.media_reactions for select to authenticated
  using (exists (
    select 1 from public.media_items m
    where m.id = media_reactions.media_id
      and m.status = 'active' and is_trip_member(m.trip_id)
      and (m.visibility = 'group' or m.uploader_id = (select auth.uid()))
      and (
        m.album_id is null
        or exists (
          select 1 from public.media_albums album
          where album.id = m.album_id
            and (
              album.visibility = 'shared'
              or album.created_by = (select auth.uid())
              or album.owner_id = (select auth.uid())
              or m.uploader_id = (select auth.uid())
              or is_trip_owner(album.trip_id)
            )
        )
      )
  ));

-- ---------------------------------------------------------------------------
-- Guardrail (docs/04 T4): trip-media must stay private. Read-only assertion.
-- ---------------------------------------------------------------------------
do $$
declare c int;
begin
  select count(*) into c from storage.buckets
   where id = 'trip-media' and public = true;
  if c > 0 then
    raise exception 'BUCKET MISCONFIGURATION: public buckets are forbidden (docs/04 T4)';
  end if;
end $$;
