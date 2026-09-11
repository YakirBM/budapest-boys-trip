-- ============================================================================
-- rls-tests.sql — RLS positive/negative test suite (T-040, docs/03 §12, docs/04 §11)
--
-- RUN MODE: psql "$DATABASE_URL" -f supabase/rls-tests.sql
-- MUST run as a role that can INSERT INTO auth.users — the hosted Supabase
-- `postgres` role. Run on a clean dev/staging database AFTER migrations
-- 0001–0013 + seed.sql, when the seeded counts asserted below are exact
-- (places = 17, checklists = 7, checklist_items = 44, ...).
--
-- The synthetic auth users use the ALLOWLISTED emails (the enforce_allowed_email
-- trigger would reject anything else); their memberships are created by the
-- handle_new_user trigger, which also creates 8 flight_passengers rows and
-- claims trip ownership for the owner. Teardown removes everything the script
-- created. Do NOT run against a database with real member accounts.
--
-- Postgres RLS semantics asserted here:
--   * SELECT denial                       → zero rows returned (RLS filters, no error)
--   * INSERT denial                       → error 42501 insufficient_privilege
--   * UPDATE/DELETE denial (no policy)    → zero rows affected
--   * non-allowlisted signup              → trigger exception (P0001)
-- ============================================================================

\set ON_ERROR_STOP on

create extension if not exists pgcrypto;  -- crypt()/gen_salt() for fake passwords

-- Fixed identifiers ----------------------------------------------------------
-- trip      00000000-0000-4000-8000-000000000001
-- userA     11111111-1111-4111-8111-111111111111  (Yakir, owner)
-- userB     22222222-2222-4222-8222-222222222222  (Aharon, member)
-- userY     33333333-3333-4333-8333-333333333333  (Yehonatan, member)
-- userBar   44444444-4444-4444-8444-444444444444  (Bar, member)
-- userC     55555555-5555-4555-8555-555555555555  (Roei email, pending)

-- ============================================================================
-- 0) Test helpers (session temp — invoker rights, so they run as current role)
-- ============================================================================
create or replace function pg_temp.assert_eq(p_actual bigint, p_expected bigint, p_label text)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL [%]: expected %, got %', p_label, p_expected, p_actual;
  end if;
  raise notice 'PASS [%]', p_label;
end $$;

create or replace function pg_temp.expect_denied(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL [%]: statement unexpectedly succeeded', p_label;
exception
  when insufficient_privilege then raise notice 'PASS [%]: denied (42501)', p_label;
  when raise_exception        then raise notice 'PASS [%]: rejected by DB trigger', p_label;
end $$;

create or replace function pg_temp.expect_rows_affected(p_sql text, p_expected bigint, p_label text)
returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_expected then
    raise exception 'FAIL [%]: expected % affected rows, got %', p_label, p_expected, n;
  end if;
  raise notice 'PASS [%]: % rows affected', p_label, n;
end $$;

-- Shorthand: statement must affect ZERO rows (silent RLS denial on UPDATE/DELETE).
create or replace function pg_temp.expect_no_rows_affected(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  perform pg_temp.expect_rows_affected(p_sql, 0, p_label);
end $$;

-- ============================================================================
-- 1) Cleanup any leftovers from a previous run (FK-safe order)
-- ============================================================================
delete from public.app_events          where actor_id in (
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555');
delete from public.expense_splits      where expense_id in (
  select id from public.expenses where title like 'RLS-TEST%');
delete from public.expenses            where title like 'RLS-TEST%';
delete from public.polls               where question like 'RLS-TEST%';
delete from public.media_items         where caption like 'RLS-TEST%';
delete from public.documents           where title like 'RLS-TEST%';
delete from public.insurance_policies  where insurer = 'RLS-TEST Insurer';
delete from public.emergency_profiles  where ice_name = 'RLS-TEST ICE';
delete from public.safety_notices      where destination like 'RLS-TEST%';
delete from public.day_notes           where body like 'RLS-TEST%';
delete from public.places              where name like 'RLS-TEST%';
delete from auth.users                 where id in (
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555');

-- ============================================================================
-- 2) Signup-trigger tests + fixtures (as postgres; owner bypasses RLS)
-- ============================================================================
-- Non-allowlisted signup must be rejected by the DB (T7).
select pg_temp.expect_denied(
  'insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
     confirmation_token, recovery_token, email_change, email_change_token_new)
   values (''00000000-0000-0000-0000-000000000000'',
     ''99999999-9999-4999-8999-999999999999'', ''authenticated'', ''authenticated'',
     ''stranger-not-allowed@example.com'', crypt(''x'', gen_salt(''bf'')),
     now(), now(), now(), ''{}'', ''{}'', '''', '''', '''', '''')',
  'T7: non-allowlisted signup rejected');

-- Allowlisted synthetic members (trigger creates profile + membership + passengers).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111',
   'authenticated','authenticated','yakir.b.m.ite@gmail.com', crypt('rls-test-only', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-4222-8222-222222222222',
   'authenticated','authenticated','aharonml123@gmail.com', crypt('rls-test-only', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-4333-8333-333333333333',
   'authenticated','authenticated','jonatannheh@gmail.com', crypt('rls-test-only', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','44444444-4444-4444-8444-444444444444',
   'authenticated','authenticated','barjohan25.11@gmail.com', crypt('rls-test-only', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','55555555-5555-4555-8555-555555555555',
   'authenticated','authenticated','roeiduv@gmail.com', crypt('rls-test-only', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '')
on conflict do nothing;

-- Trigger artifacts (C1/C2 encodings).
select pg_temp.assert_eq((select count(*) from public.profiles), 5,
  'trigger: 5 profiles created');
select pg_temp.assert_eq((select count(*) from public.profiles
   where id = '11111111-1111-4111-8111-111111111111' and full_name = 'Yakir Elazar Ben Menashe'), 1,
  'trigger: profile full_name from allowed_emails.display_name');
select pg_temp.assert_eq((select count(*) from public.trip_members), 5,
  'trigger: 5 trip_members created');
select pg_temp.assert_eq((select count(*) from public.trip_members
   where user_id = '11111111-1111-4111-8111-111111111111'
     and role = 'owner' and status = 'active'), 1,
  'trigger: owner role + active from allowlist');
select pg_temp.assert_eq((select created_by from public.trips
   where id = '00000000-0000-4000-8000-000000000001'), '11111111-1111-4111-8111-111111111111',
  'C1: first allowlisted owner claimed the seeded trip');
select pg_temp.assert_eq((select count(*) from public.trip_members
   where user_id = '55555555-5555-4555-8555-555555555555' and status = 'pending'), 1,
  'trigger: Roei pending member');
select pg_temp.assert_eq((select count(*) from public.flight_passengers), 8,
  'C2: 8 flight_passengers (4 active members × 2 flights), created by trigger');
select pg_temp.assert_eq((select count(*) from public.flight_passengers
   where member_id = '55555555-5555-4555-8555-555555555555'), 0,
  'C2: pending member gets no flight_passengers');
select pg_temp.assert_eq((select count(*) from public.flight_passengers
   where eticket_serial_masked = '4210•••••06'), 2,
  'C3: masked serial (never full) propagated to both flights');

-- Business fixtures for the RLS assertions below.
insert into public.insurance_policies (id, user_id, insurer, policy_no_masked) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'RLS-TEST Insurer', 'POL•••••');

insert into public.documents (id, trip_id, owner_id, document_type, title, storage_path, is_private) values
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'passport', 'RLS-TEST passport B',
   'trips/00000000-0000-4000-8000-000000000001/documents/22222222-2222-4222-8222-222222222222/p.jpg',
   true);

insert into public.emergency_profiles (user_id, ice_name, ice_phone, visibility) values
  ('22222222-2222-4222-8222-222222222222', 'RLS-TEST ICE', '+972500000000', 'emergency_only');

insert into public.media_items (id, trip_id, uploader_id, storage_path, media_type, caption, visibility, status) values
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222',
   'trips/00000000-0000-4000-8000-000000000001/media/22222222-2222-4222-8222-222222222222/private.jpg',
   'image', 'RLS-TEST private media', 'private', 'active'),
  ('aaaaaaaa-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222',
   'trips/00000000-0000-4000-8000-000000000001/media/22222222-2222-4222-8222-222222222222/group.jpg',
   'image', 'RLS-TEST group media', 'group', 'active');

-- Personal expense of A (owner-only visibility).
insert into public.expenses (id, trip_id, title, amount, currency, amount_base_huf, paid_by, is_personal, status) values
  ('aaaaaaaa-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001',
   'RLS-TEST personal expense', 100, 'HUF', 100,
   '11111111-1111-4111-8111-111111111111', true, 'confirmed');

-- Settlement fixtures = docs/03 §9 worked example (400/200/120, equal ×4).
insert into public.expenses (id, trip_id, title, amount, currency, amount_base_huf, paid_by, is_personal, status) values
  ('aaaaaaaa-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001',
   'RLS-TEST apartment', 400, 'HUF', 400, '11111111-1111-4111-8111-111111111111', false, 'confirmed'),
  ('aaaaaaaa-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001',
   'RLS-TEST dinner', 200, 'HUF', 200, '22222222-2222-4222-8222-222222222222', false, 'confirmed'),
  ('aaaaaaaa-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001',
   'RLS-TEST taxi', 120, 'HUF', 120, '33333333-3333-4333-8333-333333333333', false, 'confirmed');

insert into public.expense_splits (expense_id, member_id, method, computed_amount)
select e.id, m.uid, 'equal', 100
  from public.expenses e
 cross join (values
   ('11111111-1111-4111-8111-111111111111'::uuid),
   ('22222222-2222-4222-8222-222222222222'::uuid),
   ('33333333-3333-4333-8333-333333333333'::uuid),
   ('44444444-4444-4444-8444-444444444444'::uuid)) as m(uid)
 where e.title like 'RLS-TEST %' and not e.is_personal and e.status = 'confirmed';

-- Owner-delete target + poll fixtures (deadline already past).
insert into public.places (id, trip_id, name, type) values
  ('aaaaaaaa-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001',
   'RLS-TEST place', 'other');

insert into public.polls (id, trip_id, question, status, deadline, quorum_rule, created_by) values
  ('aaaaaaaa-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000001',
   'RLS-TEST poll majority', 'open', now() - interval '1 hour', 'majority',
   '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000001',
   'RLS-TEST poll zero-votes', 'open', now() - interval '1 hour', 'majority',
   '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000001',
   'RLS-TEST poll tie', 'open', now() - interval '1 hour', 'majority',
   '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-0000-4000-8000-000000000034', '00000000-0000-4000-8000-000000000001',
   'RLS-TEST poll unanimous w/ abstentions', 'open', now() - interval '1 hour', 'unanimous',
   '11111111-1111-4111-8111-111111111111');

insert into public.poll_options (id, poll_id, label, sort_order) values
  ('aaaaaaaa-0000-4000-8000-000000000041', 'aaaaaaaa-0000-4000-8000-000000000031', 'opt A1', 10),
  ('aaaaaaaa-0000-4000-8000-000000000042', 'aaaaaaaa-0000-4000-8000-000000000031', 'opt A2', 20),
  ('aaaaaaaa-0000-4000-8000-000000000043', 'aaaaaaaa-0000-4000-8000-000000000032', 'opt B1', 10),
  ('aaaaaaaa-0000-4000-8000-000000000044', 'aaaaaaaa-0000-4000-8000-000000000033', 'opt C1', 10),
  ('aaaaaaaa-0000-4000-8000-000000000045', 'aaaaaaaa-0000-4000-8000-000000000033', 'opt C2', 20),
  ('aaaaaaaa-0000-4000-8000-000000000046', 'aaaaaaaa-0000-4000-8000-000000000034', 'opt D1', 10);

insert into public.votes (trip_id, poll_id, option_id, member_id) values
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000031', 'aaaaaaaa-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111'),
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000031', 'aaaaaaaa-0000-4000-8000-000000000041', '22222222-2222-4222-8222-222222222222'),
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000031', 'aaaaaaaa-0000-4000-8000-000000000042', '33333333-3333-4333-8333-333333333333'),
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000033', 'aaaaaaaa-0000-4000-8000-000000000044', '11111111-1111-4111-8111-111111111111'),
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000033', 'aaaaaaaa-0000-4000-8000-000000000045', '22222222-2222-4222-8222-222222222222'),
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000034', 'aaaaaaaa-0000-4000-8000-000000000046', '11111111-1111-4111-8111-111111111111'),
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000034', 'aaaaaaaa-0000-4000-8000-000000000046', '22222222-2222-4222-8222-222222222222');

-- ============================================================================
-- 3) Group A — ANONYMOUS denial
-- ============================================================================
begin;
set local role anon;
select pg_temp.assert_eq((select count(*) from public.trips), 0,    'anon: trips invisible');
select pg_temp.assert_eq((select count(*) from public.expenses), 0, 'anon: expenses invisible');
select pg_temp.assert_eq((select count(*) from public.places), 0,   'anon: places invisible');
select pg_temp.expect_denied(
  'insert into public.trips (id, name, start_date, end_date) values (gen_random_uuid(), ''RLS-TEST'', current_date, current_date)',
  'anon: INSERT into trips denied');
rollback;

-- ============================================================================
-- Helper to impersonate an authenticated member inside a transaction
-- ============================================================================
create or replace function pg_temp.become(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;

-- ============================================================================
-- 4) Group B — member (owner) positive reads: shared trip data + seed counts
-- ============================================================================
begin;
set local role authenticated;
select pg_temp.become('11111111-1111-4111-8111-111111111111');
select pg_temp.assert_eq((select count(*) from public.trips), 1,
  'owner: reads the trip');
select pg_temp.assert_eq((select count(*) from public.places), 17,
  'owner: 17 places (5 anchors + 12 idea bank)');
select pg_temp.assert_eq((select count(*) from public.day_plans), 5,
  'owner: 5 day plans');
select pg_temp.assert_eq((select count(*) from public.flights), 2,
  'owner: 2 flights');
select pg_temp.assert_eq((select count(*) from public.checklists), 7,
  'owner: 7 checklists');
select pg_temp.assert_eq((select count(*) from public.checklist_items), 44,
  'owner: 44 checklist items');
select pg_temp.assert_eq((select count(*) from public.checklist_item_blocks), 2,
  'owner: check-in→boarded chain readable');
select pg_temp.assert_eq((select count(*) from public.transit_tickets), 6,
  'owner: 6 transit tickets');
select pg_temp.assert_eq((select count(*) from public.transit_anchor_stations), 4,
  'owner: 4 anchor stations');
select pg_temp.assert_eq((select count(*) from public.emergency_contacts), 3,
  'owner: 3 emergency contacts');
select pg_temp.assert_eq((select count(*) from public.profiles), 5,
  'owner: co-member profiles visible (basics)');
select pg_temp.assert_eq((select count(*) from public.allowed_emails), 0,
  'SECURITY: allowed_emails has no policies → invisible to members');
rollback;

-- ============================================================================
-- 5) Group C — private-data isolation (rule 3)
-- ============================================================================
begin;
set local role authenticated;
select pg_temp.become('11111111-1111-4111-8111-111111111111');  -- A vs B's rows
select pg_temp.assert_eq((select count(*) from public.insurance_policies), 0,
  'A cannot read B insurance_policies');
select pg_temp.assert_eq((select count(*) from public.documents), 0,
  'A cannot read B documents (private)');
select pg_temp.assert_eq((select count(*) from public.emergency_profiles), 0,
  'A cannot read B emergency_profile (emergency_only via direct reads)');
select pg_temp.assert_eq((select count(*) from public.media_items
   where caption = 'RLS-TEST private media'), 0,
  'A cannot read B private media');
select pg_temp.assert_eq((select count(*) from public.media_items
   where caption = 'RLS-TEST group media'), 1,
  'A CAN read B group media');
rollback;

begin;
set local role authenticated;
select pg_temp.become('22222222-2222-4222-8222-222222222222');  -- B sees own rows
select pg_temp.assert_eq((select count(*) from public.insurance_policies), 1,
  'B reads own insurance');
select pg_temp.assert_eq((select count(*) from public.documents), 1,
  'B reads own documents');
select pg_temp.assert_eq((select count(*) from public.emergency_profiles), 1,
  'B reads own emergency profile');
select pg_temp.assert_eq((select count(*) from public.media_items
   where caption = 'RLS-TEST private media'), 1,
  'B reads own private media');
rollback;

-- ============================================================================
-- 6) Group D — personal-expense isolation
-- ============================================================================
begin;
set local role authenticated;
select pg_temp.become('22222222-2222-4222-8222-222222222222');
select pg_temp.assert_eq((select count(*) from public.expenses
   where title = 'RLS-TEST personal expense'), 0,
  'B cannot see A''s personal expense');
select pg_temp.assert_eq((select count(*) from public.expenses), 3,
  'B sees exactly the 3 shared expenses');
select pg_temp.assert_eq((select count(*) from public.expense_splits), 12,
  'B sees splits of shared expenses only (3×4)');
rollback;

begin;
set local role authenticated;
select pg_temp.become('11111111-1111-4111-8111-111111111111');
select pg_temp.assert_eq((select count(*) from public.expenses
   where title = 'RLS-TEST personal expense'), 1,
  'payer sees own personal expense');
rollback;

-- ============================================================================
-- 7) Group E — writes + owner-only deletes
-- ============================================================================
begin;
set local role authenticated;
select pg_temp.become('22222222-2222-4222-8222-222222222222');
insert into public.expenses (id, trip_id, title, amount, currency, amount_base_huf, paid_by, is_personal, status)
values ('aaaaaaaa-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001',
        'RLS-TEST shared expense B', 50, 'HUF', 50,
        '22222222-2222-4222-8222-222222222222', false, 'confirmed');
select pg_temp.assert_eq((select count(*) from public.expenses
   where title = 'RLS-TEST shared expense B'), 1,
  'active member can insert shared expense');
select pg_temp.expect_no_rows_affected(
  'delete from public.expenses where paid_by = ''11111111-1111-4111-8111-111111111111''',
  'member cannot delete another member''s expense');
select pg_temp.expect_no_rows_affected(
  'delete from public.places where name like ''Deák%''',
  'member cannot delete (owner-only) seed places');
select pg_temp.expect_denied(
  'insert into public.expenses (id, trip_id, title, amount, is_personal, paid_by) values (gen_random_uuid(), ''00000000-0000-4000-8000-000000000001'', ''RLS-TEST spoof'', 1, true, ''11111111-1111-4111-8111-111111111111'')',
  'member cannot insert a PERSONAL expense paid by someone else');
select pg_temp.expect_denied(
  'insert into public.votes (trip_id, poll_id, option_id, member_id) values (''00000000-0000-4000-8000-000000000001'', ''aaaaaaaa-0000-4000-8000-000000000031'', ''aaaaaaaa-0000-4000-8000-000000000041'', ''11111111-1111-4111-8111-111111111111'')',
  'member cannot cast a vote as someone else');
rollback;

begin;
set local role authenticated;
select pg_temp.become('11111111-1111-4111-8111-111111111111');
select pg_temp.expect_rows_affected(
  'delete from public.places where name = ''RLS-TEST place''', 1,
  'owner can delete (owner-only table places)');
rollback;

-- ============================================================================
-- 8) Group F — app_events append-only audit
-- ============================================================================
begin;
set local role authenticated;
select pg_temp.become('11111111-1111-4111-8111-111111111111');
insert into public.app_events (trip_id, actor_id, action, entity, entity_id)
values ('00000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        'view.emergency_profile', 'emergency_profiles',
        '22222222-2222-4222-8222-222222222222');
select pg_temp.assert_eq((select count(*) from public.app_events
   where action = 'view.emergency_profile' and actor_id = '11111111-1111-4111-8111-111111111111'), 1,
  'audit row inserted');
select pg_temp.expect_no_rows_affected(
  'update public.app_events set action = ''tampered''',
  'app_events immutable: UPDATE denied (0 rows)');
select pg_temp.expect_no_rows_affected(
  'delete from public.app_events',
  'app_events immutable: DELETE denied (0 rows)');
rollback;

begin;
set local role authenticated;
select pg_temp.become('22222222-2222-4222-8222-222222222222');
select pg_temp.assert_eq((select count(*) from public.app_events
   where actor_id = '11111111-1111-4111-8111-111111111111'), 0,
  'non-actor member cannot read another''s audit rows');
rollback;

-- ============================================================================
-- 9) Group G — close_expired_polls resolution (docs/06-features/09 rule 5)
-- ============================================================================
begin;
set local role authenticated;
select pg_temp.become('22222222-2222-4222-8222-222222222222');
select public.close_expired_polls();
select pg_temp.assert_eq((select count(*) from public.polls
   where question like 'RLS-TEST poll%' and status = 'closed'
     and closed_reason = 'deadline' and closed_at is not null), 4,
  'all 4 expired polls closed by deadline reconcile');
select pg_temp.assert_eq((select decided_option_id from public.polls
   where id = 'aaaaaaaa-0000-4000-8000-000000000031'), 'aaaaaaaa-0000-4000-8000-000000000041',
  'majority: strict majority of cast votes wins');
select pg_temp.assert_eq((select decided_option_id from public.polls
   where id = 'aaaaaaaa-0000-4000-8000-000000000032'), null,
  'zero votes → no auto-winner');
select pg_temp.assert_eq((select decided_option_id from public.polls
   where id = 'aaaaaaaa-0000-4000-8000-000000000033'), null,
  'tie → no auto-winner (owner decides)');
select pg_temp.assert_eq((select decided_option_id from public.polls
   where id = 'aaaaaaaa-0000-4000-8000-000000000034'), 'aaaaaaaa-0000-4000-8000-000000000046',
  'unanimous with abstentions (2/4 cast) resolves without deadlock');
rollback;

-- ============================================================================
-- 10) Group H — safety_notices (insert own / read members / update own)
-- ============================================================================
begin;
set local role authenticated;
select pg_temp.become('22222222-2222-4222-8222-222222222222');
insert into public.safety_notices (trip_id, member_id, destination, expected_return)
values ('00000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
        'RLS-TEST night out', now() + interval '3 hours');
select pg_temp.expect_rows_affected(
  'update public.safety_notices set destination = ''RLS-TEST night out (updated)''', 1,
  'member updates own safety notice');
select pg_temp.assert_eq((select count(*) from public.safety_notices), 1,
  'members read all safety notices');
rollback;

begin;
set local role authenticated;
select pg_temp.become('11111111-1111-4111-8111-111111111111');
select pg_temp.expect_no_rows_affected(
  'update public.safety_notices set destination = ''hijacked''',
  'other member cannot update a safety notice');
rollback;

-- day_notes: member writes own note; delete is owner-only
begin;
set local role authenticated;
select pg_temp.become('22222222-2222-4222-8222-222222222222');
insert into public.day_notes (trip_id, day_plan_id, author_id, body)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102',
        '22222222-2222-4222-8222-222222222222', 'RLS-TEST note');
commit;
begin;
set local role authenticated;
select pg_temp.become('11111111-1111-4111-8111-111111111111');
select pg_temp.assert_eq((select count(*) from public.day_notes), 1,
  'member reads day notes');
select pg_temp.expect_rows_affected(
  'delete from public.day_notes where author_id = ''22222222-2222-4222-8222-222222222222''', 1,
  'owner can delete a day note (owner-only delete)');
rollback;

-- ============================================================================
-- 11) Group I — pending member read-only; removed member fully denied
-- ============================================================================
begin;
set local role authenticated;
select pg_temp.become('55555555-5555-4555-8555-555555555555');
select pg_temp.assert_eq((select count(*) from public.trips), 1,
  'pending member CAN read (invite flow)');
select pg_temp.expect_denied(
  'insert into public.expenses (trip_id, title, amount, paid_by) values (''00000000-0000-4000-8000-000000000001'', ''RLS-TEST pending write'', 1, ''55555555-5555-4555-8555-555555555555'')',
  'pending member CANNOT write');
rollback;

delete from public.trip_members where user_id = '55555555-5555-4555-8555-555555555555';

begin;
set local role authenticated;
select pg_temp.become('55555555-5555-4555-8555-555555555555');
select pg_temp.assert_eq((select count(*) from public.trips), 0,
  'removed (non-member) authenticated user denied');
select pg_temp.expect_denied(
  'insert into public.expenses (trip_id, title, amount, paid_by) values (''00000000-0000-4000-8000-000000000001'', ''RLS-TEST outsider'', 1, ''55555555-5555-4555-8555-555555555555'')',
  'non-member INSERT denied');
rollback;

-- ============================================================================
-- 12) Group J — suggest_settlements matches the docs/03 §9 worked example
-- (Bar→Yakir 180 · Yehonatan→Yakir 40 · Yehonatan→Aharon 20)
-- ============================================================================
begin;
set local role authenticated;
select pg_temp.become('22222222-2222-4222-8222-222222222222');
select pg_temp.assert_eq((select count(*) from public.suggest_settlements(
   '00000000-0000-4000-8000-000000000001')), 3,
  'settlement: exactly n−1 = 3 transfers');
select pg_temp.assert_eq((select count(*) from public.suggest_settlements(
   '00000000-0000-4000-8000-000000000001')
   where (from_user, to_user, amount_base_huf) in (
     ('44444444-4444-4444-8444-444444444444'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 180),
     ('33333333-3333-4333-8333-333333333333'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 40),
     ('33333333-3333-4333-8333-333333333333'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 20))), 3,
  'settlement: transfers match the worked example');
select pg_temp.expect_denied(
  'select * from public.suggest_settlements(''aaaaaaaa-0000-4000-8000-0000000000ff''::uuid)',
  'settlement: non-member of trip rejected');
rollback;

-- ============================================================================
-- 13) Group K — storage buckets + path parsing
-- ============================================================================
select pg_temp.assert_eq((select count(*) from storage.buckets
   where id = 'trip-media' and public = false and file_size_limit = 26214400), 1,
  'bucket trip-media: private, 25 MB');
select pg_temp.assert_eq((select count(*) from storage.buckets
   where id = 'trip-documents' and public = false and file_size_limit = 10485760), 1,
  'bucket trip-documents: private, 10 MB');
select pg_temp.assert_eq((select count(*) from storage.buckets
   where id = 'trip-media'
     and 'image/jpeg' = any(allowed_mime_types) and 'image/webp' = any(allowed_mime_types)
     and not ('video/mp4' = any(allowed_mime_types))), 1,
  'bucket trip-media: images only — video/mp4 rejected');
select pg_temp.assert_eq((select count(*) from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('storage_insert','storage_select','storage_delete')), 3,
  'storage.objects: INSERT+SELECT+DELETE policies present');
select pg_temp.assert_eq((select public.storage_trip_id(
   'trips/00000000-0000-4000-8000-000000000001/media/22222222-2222-4222-8222-222222222222/f.jpg')
   = '00000000-0000-4000-8000-000000000001'::uuid), true,
  'storage_trip_id parses trips/{trip_id}/... paths');
select pg_temp.assert_eq((select public.storage_trip_id('trips/not-a-uuid/x') is null), true,
  'storage_trip_id returns NULL for malformed uuid segment');
select pg_temp.assert_eq((select public.storage_trip_id('other/xxx/y') is null), true,
  'storage_trip_id returns NULL outside trips/ prefix');

-- ============================================================================
-- 14) Teardown (FK-safe order) + final summary
-- ============================================================================
delete from public.app_events          where actor_id in (
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555');
delete from public.expense_splits      where expense_id in (
  select id from public.expenses where title like 'RLS-TEST%');
delete from public.expenses            where title like 'RLS-TEST%';
delete from public.polls               where question like 'RLS-TEST%';
delete from public.media_items         where caption like 'RLS-TEST%';
delete from public.documents           where title like 'RLS-TEST%';
delete from public.insurance_policies  where insurer = 'RLS-TEST Insurer';
delete from public.emergency_profiles  where ice_name = 'RLS-TEST ICE';
delete from public.safety_notices      where destination like 'RLS-TEST%';
delete from public.day_notes           where body like 'RLS-TEST%';
delete from public.votes               where member_id in (
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444');
delete from public.places              where name like 'RLS-TEST%';
delete from auth.users                 where id in (
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555');

-- Post-teardown sanity: no residue from the test run.
select pg_temp.assert_eq((select count(*) from public.trip_members), 0,
  'teardown: no test memberships remain');
select pg_temp.assert_eq((select count(*) from public.flight_passengers), 0,
  'teardown: no test passengers remain');
select pg_temp.assert_eq((select count(*) from public.expenses
   where title like 'RLS-TEST%'), 0, 'teardown: no test expenses remain');

select 'ALL RLS TESTS PASSED' as result;
