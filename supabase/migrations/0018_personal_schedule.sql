-- 0018_personal_schedule.sql — personal_items owner-only (docs/14 §3.2.5).
-- Additive, idempotent: rerunnable via IF NOT EXISTS + DROP POLICY IF EXISTS.
-- Personal writes require login only (no trip-membership check); rows are
-- visible exclusively to their owner.

create table if not exists public.personal_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 5),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  address text check (address is null or char_length(address) <= 200),
  links jsonb not null default '[]',
  costs jsonb not null default '[]',
  category itinerary_category not null default 'other',
  start_time timestamptz,
  duration_min int check (duration_min is null or (duration_min between 5 and 720)),
  image_url text,
  image_source text,
  image_fetched_at timestamptz,
  status itinerary_status not null default 'planned',
  sort_order int not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists personal_items_owner_day_idx
  on public.personal_items (owner_id, trip_id, day_number, sort_order);
create index if not exists personal_items_trip_day_idx
  on public.personal_items (trip_id, day_number);

alter table public.personal_items enable row level security;
grant select, insert, update, delete on public.personal_items to authenticated;
revoke all on public.personal_items from anon;

drop policy if exists personal_items_select on public.personal_items;
create policy personal_items_select on public.personal_items for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists personal_items_insert on public.personal_items;
create policy personal_items_insert on public.personal_items for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists personal_items_update on public.personal_items;
create policy personal_items_update on public.personal_items for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists personal_items_delete on public.personal_items;
create policy personal_items_delete on public.personal_items for delete to authenticated
  using (owner_id = (select auth.uid()));

-- updated_at trigger (idempotent).
do $$
begin
  begin
    create trigger trg_personal_items_updated_at before update on public.personal_items
      for each row execute function public.set_updated_at();
  exception when duplicate_object then null;
  end;
end $$;

-- Realtime: per-user channel (RLS already blocks other rows).
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.personal_items';
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
