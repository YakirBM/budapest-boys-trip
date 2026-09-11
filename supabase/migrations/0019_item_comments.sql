-- 0019_item_comments.sql — item_comments for group|personal|place (docs/14 §3.2.5 + §3.4.1).
-- Additive, idempotent. 280-char limit. 'place' kind included from the start
-- (Phase 3 extension folded in to keep the check constraint stable).

create table if not exists public.item_comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  item_id uuid not null,
  item_kind text not null check (item_kind in ('group', 'personal', 'place')),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

create index if not exists item_comments_item_idx
  on public.item_comments (item_kind, item_id, created_at desc);
create index if not exists item_comments_trip_idx
  on public.item_comments (trip_id, created_at desc);

alter table public.item_comments enable row level security;
grant select, insert, update, delete on public.item_comments to authenticated;
revoke all on public.item_comments from anon;

-- Reads: trip members read group + place threads; personal threads readable by
-- the personal-item owner or the comment author.
drop policy if exists item_comments_select on public.item_comments;
create policy item_comments_select on public.item_comments for select to authenticated
  using (
    is_trip_member(trip_id)
    and (
      item_kind in ('group', 'place')
      or author_id = (select auth.uid())
      or exists (
        select 1 from public.personal_items pi
        where pi.id = item_comments.item_id
          and pi.owner_id = (select auth.uid())
      )
    )
  );

drop policy if exists item_comments_insert on public.item_comments;
create policy item_comments_insert on public.item_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and is_active_trip_member(trip_id)
  );

drop policy if exists item_comments_update on public.item_comments;
create policy item_comments_update on public.item_comments for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists item_comments_delete on public.item_comments;
create policy item_comments_delete on public.item_comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or is_trip_owner(trip_id)
  );

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.item_comments';
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
