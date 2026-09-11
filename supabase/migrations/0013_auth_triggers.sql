-- 0013_auth_triggers.sql — signup allowlist enforcement, profile/membership/passenger
-- creation on signup, ownership claim, realtime publication (docs/04 §2, docs/09).
-- Triggers on auth.users are supported on hosted Supabase when created by `postgres`.
--
-- Encoded audit resolutions:
--   * T7  — non-allowlisted signups are rejected by the DB (enforce_allowed_email).
--   * C1  — first allowlisted OWNER claims the seeded trip (trips.created_by).
--   * C2  — flight_passengers are NOT seeded; the trigger creates one row per
--           flight for every ACTIVE member, with the masked serial from
--           allowed_emails.ticket_serial_masked (full serials are never stored).
--   * C3  — masked serials only ('4210•••••06' style).

-- ---------------------------------------------------------------------------
-- (1) Reject signups for emails not present in allowed_emails (docs/04 §2).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(new.email)
  ) then
    raise exception 'Signup not allowed for this email';
  end if;
  return new;
end;
$$;

do $$
begin
  execute $fn$
    create trigger enforce_allowed_email_before_insert
      before insert on auth.users
      for each row execute function public.enforce_allowed_email()
  $fn$;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- (2) On first verified login: create profile + trip membership (+ passengers).
-- Idempotent via ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := new.email;
  v_allowed public.allowed_emails%rowtype;
  v_trip    uuid := '00000000-0000-4000-8000-000000000001';  -- the single seeded trip (docs/09)
begin
  if v_email is null then
    return new;  -- phone-only accounts are not used by this app
  end if;

  select * into v_allowed from public.allowed_emails where email = v_email;
  if not found then
    return new;  -- enforce_allowed_email already rejected non-allowlisted emails
  end if;

  -- Profile: full_name comes from the allowlist (member spreadsheet via docs/09).
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(v_allowed.display_name, v_email))
  on conflict (id) do nothing;

  -- Trip membership: role + status copied from the allowlist.
  -- Roei stays 'pending' (reads allowed, writes denied) until the group decision lands.
  insert into public.trip_members (trip_id, user_id, role, status, active_from)
  values (v_trip, new.id,
          coalesce(v_allowed.role, 'member'),
          coalesce(v_allowed.member_status, 'pending'),
          case when coalesce(v_allowed.member_status, 'pending') = 'active'
               then current_date end)
  on conflict (trip_id, user_id) do nothing;

  -- C1: the first signed-up allowlisted owner claims the seeded trip.
  if v_allowed.role = 'owner' then
    update public.trips set created_by = new.id
     where id = v_trip and created_by is null;
  end if;

  -- C2: active (= booked) members become passengers on BOTH flights; the masked
  -- e-ticket serial travels with them. Full serials live only in the private
  -- e-ticket PDF in trip-documents.
  if coalesce(v_allowed.member_status, 'pending') = 'active' then
    insert into public.flight_passengers (flight_id, member_id, eticket_serial_masked)
    select f.id, new.id, v_allowed.ticket_serial_masked
      from public.flights f
     where f.trip_id = v_trip
    on conflict (flight_id, member_id) do nothing;
  end if;

  return new;
end;
$$;

do $$
begin
  execute $fn$
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user()
  $fn$;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- (3) Realtime: add tables to the supabase_realtime publication. Duplicate-safe.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['expenses','checklist_items','polls','poll_options','votes',
    'media_items','media_reactions','itinerary_items','places','flight_passengers',
    'accommodations','day_notes','safety_notices']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;   -- already in the publication
      when undefined_object then null;   -- publication missing (non-Supabase target)
    end;
  end loop;
end $$;
