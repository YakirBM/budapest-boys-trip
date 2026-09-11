-- 0014_seed_structural.sql — signup-critical structural seed (docs/03 §10, docs/09).
-- (Originally written as 0013_seed_structural.sql; renumbered so the auth-trigger
-- migration stays directly before seeding. Content unchanged.)
-- Contains ONLY the rows that must exist before any user signs up: the single trip,
-- the 5 allowlisted emails (drives enforce_allowed_email + handle_new_user), and the
-- 5 day plans. The full seed (flights, places, checklists, transit, emergency
-- contacts) lives in supabase/seed.sql — which is a superset of this file and
-- equally idempotent (fixed UUIDs + ON CONFLICT DO NOTHING everywhere); it is also
-- mirrored as 0015_seed_bulk.sql so `supabase db push` applies it.
--
-- Hard rules encoded here: full reservation numbers and full e-ticket serials are
-- NEVER stored — masked forms only ('1385•••93', '4210•••••06').

-- ---------------------------------------------------------------------------
-- Trip (single trip; the whole app assumes exactly this id)
-- ---------------------------------------------------------------------------
insert into public.trips (
  id, name, city, country, start_date, end_date,
  tz_primary, tz_secondary, base_currency, created_by
) values (
  '00000000-0000-4000-8000-000000000001',
  'Budapest 2026',
  'Budapest',
  'HU',
  '2026-10-04',
  '2026-10-08',
  'Europe/Budapest',   -- UTC+2 on trip dates (CEST until late Oct)
  'Asia/Jerusalem',    -- UTC+3 on trip dates (IDT until late Oct)
  'HUF',
  null                 -- C1: no user exists yet; first allowlisted owner claims it
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Signup allowlist — EXACTLY these 5 (source: Personal-info.xlsx, last_verified 2026-09-11).
-- member_status gates writes (is_active_trip_member); ticket_serial_masked feeds
-- flight_passengers at signup. Masked serials only — full serials never stored.
-- ---------------------------------------------------------------------------
insert into public.allowed_emails (email, display_name, role, member_status, ticket_serial_masked, invited_by) values
  ('yakir.b.m.ite@gmail.com', 'Yakir Elazar Ben Menashe', 'owner',  'active',  '4210•••••06', null),
  ('aharonml123@gmail.com',   'Aharon Meyer Lawrence',    'member', 'active',  '4210•••••95', null),
  ('jonatannheh@gmail.com',   'Yehonatan Winestate',      'member', 'active',  '4210•••••73', null),
  ('barjohan25.11@gmail.com', 'Bar Mevorach Johan',       'member', 'active',  '4210•••••84', null),
  ('roeiduv@gmail.com',       'Roei',                     'member', 'pending', null,          null)
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Day plans 1–5 (2026-10-04 → 2026-10-08, no gaps)
-- ---------------------------------------------------------------------------
insert into public.day_plans (id, trip_id, day_number, date, title) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 1, '2026-10-04', 'Arrival'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 2, '2026-10-05', 'Full day'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 3, '2026-10-06', 'Full day'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 4, '2026-10-07', 'Full day'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 5, '2026-10-08', 'Departure')
on conflict (id) do nothing;
