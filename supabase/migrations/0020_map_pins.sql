-- 0020_map_pins.sql — shared map_pins with realtime + offline (docs/14 §3.3.3).
-- Additive, idempotent. Budapest bounds lat 47.2–47.7 / lng 18.8–19.4.
-- Shared by design (no private pins in v1).

create table if not exists public.map_pins (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  lat double precision not null check (lat between 47.2 and 47.7),
  lng double precision not null check (lng between 18.8 and 19.4),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  note text check (note is null or char_length(note) <= 280),
  kind text not null default 'custom'
    check (kind in ('custom', 'meeting', 'food', 'warning')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists map_pins_trip_idx
  on public.map_pins (trip_id, created_at desc);

alter table public.map_pins enable row level security;
grant select, insert, update, delete on public.map_pins to authenticated;
revoke all on public.map_pins from anon;

drop policy if exists map_pins_select on public.map_pins;
create policy map_pins_select on public.map_pins for select to authenticated
  using (is_trip_member(trip_id));

drop policy if exists map_pins_insert on public.map_pins;
create policy map_pins_insert on public.map_pins for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and is_active_trip_member(trip_id)
  );

drop policy if exists map_pins_update on public.map_pins;
create policy map_pins_update on public.map_pins for update to authenticated
  using (
    created_by = (select auth.uid())
    or is_trip_owner(trip_id)
  )
  with check (
    created_by = (select auth.uid())
    or is_trip_owner(trip_id)
  );

drop policy if exists map_pins_delete on public.map_pins;
create policy map_pins_delete on public.map_pins for delete to authenticated
  using (
    created_by = (select auth.uid())
    or is_trip_owner(trip_id)
  );

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.map_pins';
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
