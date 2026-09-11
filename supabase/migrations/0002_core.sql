-- 0002_core.sql — trips, allowed_emails, profiles, trip_members (docs/03 §4.1)
-- C1 (BUILD_STATUS audit): trips.created_by is NULLABLE — the seed trip exists
-- before any auth user; the first allowlisted owner claims it via trigger (0013).
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default 'Budapest',
  country text not null default 'HU',
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  tz_primary text not null default 'Europe/Budapest',   -- IANA tz where the trip happens
  tz_secondary text not null default 'Asia/Jerusalem',  -- IANA tz, home reference
  base_currency char(3) not null default 'HUF',
  created_by uuid references auth.users(id) on delete set null,  -- set null if owner account is deleted (doc 04 §9)
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Signup allowlist, pre-seeded with the 5 known emails (docs/09-import-and-seed.md).
-- Extended per audit: display_name/role/member_status/ticket_serial_masked drive the
-- signup triggers in 0013_auth_triggers.sql. Full e-ticket serials are NEVER stored
-- (masked only, e.g. '4210•••••06'). No client RLS policies: service-role managed;
-- users must never be able to enumerate the allowlist.
create table public.allowed_emails (
  email citext primary key,
  display_name text,
  role member_role not null default 'member',
  member_status member_status not null default 'active',
  ticket_serial_masked text,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,  -- = auth.users.id
  full_name text not null,
  heb_name text,
  phone text,
  avatar_url text,
  birth_date date,
  citizenships text[] not null default '{IL}',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'member',
  status member_status not null default 'pending',
  sort_order int not null default 0,
  active_from date,                                    -- date the member became active (cost-splitting base)
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (trip_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Membership helper functions (docs/03 §5) — relocated from 0001: these are
-- LANGUAGE SQL functions referencing trip_members, so they can only be created
-- after the core tables exist (SQL bodies validate referenced relations).
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Helper functions (docs/03 §5)
-- SECURITY DEFINER so RLS policy checks bypass RLS on trip_members (no recursion).
-- ---------------------------------------------------------------------------
create or replace function public.is_trip_member(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_members
                 where trip_id = p_trip and user_id = auth.uid()
                   and status in ('active','pending'));
$$;  -- pending members may READ (needed to accept an invite)

create or replace function public.is_active_trip_member(p_trip uuid)  -- required for WRITES
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_members
                 where trip_id = p_trip and user_id = auth.uid() and status = 'active');
$$;

create or replace function public.is_trip_owner(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_members
                 where trip_id = p_trip and user_id = auth.uid()
                   and role = 'owner' and status = 'active');
$$;

create or replace function public.current_member_id(p_trip uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.trip_members
  where trip_id = p_trip and user_id = auth.uid() limit 1;
$$;

