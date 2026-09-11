-- Prevent direct REST writes from linking an owned media row to metadata from
-- another trip. The UI validates UUID shapes; RLS is the durable scope boundary.
drop policy media_insert on public.media_items;
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
    and not exists (
      select 1 from unnest(tagged_member_ids) as tagged(user_id)
      where not exists (
        select 1 from public.trip_members member
        where member.trip_id = media_items.trip_id
          and member.user_id = tagged.user_id
          and member.status = 'active'
      )
    )
  );

drop policy media_update on public.media_items;
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
    and not exists (
      select 1 from unnest(tagged_member_ids) as tagged(user_id)
      where not exists (
        select 1 from public.trip_members member
        where member.trip_id = media_items.trip_id
          and member.user_id = tagged.user_id
          and member.status = 'active'
      )
    )
  );
