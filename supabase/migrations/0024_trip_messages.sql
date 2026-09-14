-- 0024_trip_messages.sql — private group chat and attachments.
-- All rows belong to the one trip and are visible only to its members.

create table if not exists public.trip_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'image', 'video', 'file')),
  body text check (body is null or char_length(body) <= 2000),
  media_path text,
  media_name text,
  media_mime text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint trip_messages_has_content check (
    nullif(btrim(coalesce(body, '')), '') is not null or media_path is not null
  )
);

create index if not exists trip_messages_feed_idx
  on public.trip_messages (trip_id, created_at desc);

alter table public.trip_messages enable row level security;
grant select, insert, update, delete on public.trip_messages to authenticated;
revoke all on public.trip_messages from anon;

drop policy if exists trip_messages_select on public.trip_messages;
create policy trip_messages_select on public.trip_messages for select to authenticated
  using (is_trip_member(trip_id));

drop policy if exists trip_messages_insert on public.trip_messages;
create policy trip_messages_insert on public.trip_messages for insert to authenticated
  with check (author_id = (select auth.uid()) and is_active_trip_member(trip_id));

drop policy if exists trip_messages_update on public.trip_messages;
create policy trip_messages_update on public.trip_messages for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and is_active_trip_member(trip_id));

drop policy if exists trip_messages_delete on public.trip_messages;
create policy trip_messages_delete on public.trip_messages for delete to authenticated
  using (author_id = (select auth.uid()) or is_trip_owner(trip_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media', 'chat-media', false, 26214400,
  array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] is not null
    and is_trip_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] is not null
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and is_active_trip_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.trip_messages';
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;
