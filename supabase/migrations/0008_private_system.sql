-- 0008_private_system.sql — documents (+ deferred FKs), emergency_profiles,
-- insurance_policies, app_events, weather_cache (docs/03 §4.7) + transport/safety
-- tables from the feature-driven gap list (docs/03 §13):
-- transit_tickets, transit_anchor_stations, transit_favorite_lines, preferred_routes,
-- emergency_contacts, safety_notices.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_type document_type not null,
  title text not null,
  storage_path text not null,                        -- trips/{trip_id}/documents/{user_id}/{file}
  mime text,
  bytes bigint,
  is_private boolean not null default true,          -- passports / insurance always true
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Deferred FKs declared now that documents exists (docs/03 §4.2/§4.3/§4.7).
alter table public.reservations add constraint reservations_document_fkey
  foreign key (document_id) references public.documents(id) on delete set null;
alter table public.flight_passengers add constraint flight_passengers_boarding_pass_fkey
  foreign key (boarding_pass_doc_id) references public.documents(id) on delete set null;

-- Medical data is opt-in (rule 3). Lists stored as jsonb arrays of free-text entries;
-- absence of the row is the default. Every read must be audited (see app_events).
create table public.emergency_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  allergies jsonb,
  medications jsonb,
  conditions jsonb,
  blood_type text,                                   -- nullable by design
  ice_name text not null,                            -- in-case-of-emergency contact
  ice_phone text not null,
  visibility share_scope not null default 'emergency_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insurer text not null,
  policy_no_masked text,                             -- masked only (rule: no full policy numbers)
  emergency_phone text,
  valid_until date,
  document_id uuid references public.documents(id) on delete set null,
  user_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Audit log, incl. every medical-profile view (rule 3). Append-only (no UPDATE/DELETE policies).
create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,                              -- e.g. 'view.emergency_profile'
  entity text not null,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table public.weather_cache (                   -- single-city trip: no trip_id
  day date not null,
  temp_min numeric(4,1),
  temp_max numeric(4,1),
  precip_prob int check (precip_prob between 0 and 100),
  wind numeric(5,1),
  sunset_time timestamptz,
  source text not null,
  fetched_at timestamptz not null default now(),    -- C8: staleness badge (docs 00/08)
  created_at timestamptz not null default now(),
  unique (day, source)
);
-- exchange_rates and weather_cache: written only by Edge Functions (service role).

-- ---------------------------------------------------------------------------
-- Transport hub (doc 06-features/04) — tickets, anchor stations, favorite lines,
-- preferred routes. Prices are never seeded as facts (rule 5): verified=false.
-- ---------------------------------------------------------------------------
create table public.transit_tickets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  code text not null,                                -- 'single' | 'block10' | '24h' | '72h' | 'group_24h' | '100e'
  name_he text not null,
  name_en text,
  price_huf numeric(12,2),                           -- NULL unless verified (100E estimate is flagged)
  validity_text text,
  notes text,
  verified boolean not null default false,
  source text not null default 'bkk.hu',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (trip_id, code)
);

create table public.transit_anchor_stations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  role transit_anchor_role not null,
  name_he text not null,
  name_en text,
  lines text[] not null default '{}',                -- e.g. {M1,M2,M3}
  place_id uuid references public.places(id) on delete set null,
  lat numeric(9,6),
  lng numeric(9,6),
  notes text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (trip_id, role)
);

create table public.transit_favorite_lines (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  line_code text not null,                           -- e.g. 'M1', '100E', '4/6'
  line_type text not null check (line_type in ('metro','tram','bus','night','train')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (trip_id, line_code)
);

create table public.preferred_routes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  origin_label text not null,
  destination_label text not null,
  mode text not null,                                -- free text, e.g. 'walk' | 'transit' | 'taxi'
  note text,
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (trip_id, origin_label, destination_label, mode)
);

-- ---------------------------------------------------------------------------
-- Safety (doc 06-features/08)
-- ---------------------------------------------------------------------------
create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  label text not null,
  phone text not null,
  kind text not null check (kind in ('emergency','airline','consular','other')),
  source text,                                       -- rule 5: provenance
  last_verified_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- "I'm heading out / back" safety pings.
create table public.safety_notices (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  destination text,
  expected_return timestamptz,
  notified_member_ids uuid[] not null default '{}',
  status safety_notice_status not null default 'active',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Attach set_updated_at triggers to every table with an updated_at column
-- (all tables now exist). Idempotent; complements the identical block in 0001.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'updated_at'
  loop
    begin
      execute format('create trigger trg_%s_updated_at before update on public.%I
                      for each row execute function public.set_updated_at()', t, t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
