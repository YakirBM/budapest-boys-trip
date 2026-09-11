-- 0003_planning.sql — places, day_plans, day_notes, note_reactions, itinerary_items, reservations
-- (docs/03 §4.2 + audit gaps: places lat/lng/gmaps_place_id/tags/source, extended
-- place_type, itinerary duration_min/travel_min_to_next/poll_id).
-- day_notes + note_reactions (Today feed, doc 06-features/00) are created here because
-- they are day-scoped planning data; documented in docs/03 §13.

create table public.places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  google_maps_url text,
  url text,
  image_url text,
  type place_type not null default 'other',
  lat numeric(9,6),                                  -- approx anchors carry verify note (rule 5)
  lng numeric(9,6),
  gmaps_place_id text,
  tags text[] not null default '{}',
  est_price numeric(12,2),
  price_currency char(3) not null default 'HUF',
  district text,                                     -- e.g. 'VII. kerület'
  opening_hours jsonb,                               -- {"mon":["10:00","18:00"], ...}
  needs_reservation boolean not null default false,
  suggested_by uuid references auth.users(id) on delete set null,
  note text,
  source text,                                       -- rule 5: provenance of coords/prices
  status place_status not null default 'idea',
  last_verified_at timestamptz,
  price_source price_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.day_plans (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_number int not null check (day_number between 1 and 5),
  date date not null,
  title text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (trip_id, day_number)
);

-- Today-feed notes ("יצאנו", "מאחר ב-X דקות", user notes) + emoji reactions.
create table public.day_notes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_plan_id uuid not null references public.day_plans(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  note_kind text not null default 'user',            -- 'user' | 'system' quick-action entries
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.note_reactions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.day_notes(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  kind reaction_kind not null default 'like',
  body text,                                         -- null for like; required for comment
  created_at timestamptz not null default now(),
  check (kind <> 'comment' or body is not null)
);

create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  day_plan_id uuid not null references public.day_plans(id) on delete cascade,
  place_id uuid references public.places(id) on delete set null,
  title text not null,
  category itinerary_category not null default 'other',
  start_time timestamptz not null,                   -- zero-ambiguity rule 4
  end_time timestamptz,
  leave_by timestamptz,                              -- "leave now" hint
  duration_min int,                                  -- feasibility engine dwell estimate
  travel_min_to_next int,                            -- user-entered; Maps check link in UI
  poll_id uuid,                                      -- FK to polls added in 0006 (created later)
  address text,
  est_cost_per_person numeric(12,2),
  est_cost_group numeric(12,2),
  currency char(3) not null default 'HUF',
  status itinerary_status not null default 'planned',
  owner_id uuid references auth.users(id) on delete set null,  -- responsible member
  is_required boolean not null default false,        -- flights / hotel check-in
  backup_item_id uuid references public.itinerary_items(id) on delete set null,  -- rain plan
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (end_time is null or end_time > start_time)
);

-- Booking confirmations. ref_masked only; full refs are NOT stored in the MVP
-- (full_ref_encrypted deliberately omitted until a key-management ADR exists).
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  itinerary_item_id uuid references public.itinerary_items(id) on delete set null,
  provider text not null,
  ref_masked text,
  status reservation_status not null default 'pending',
  cost numeric(12,2),
  currency char(3) not null default 'HUF',
  document_id uuid,                                  -- FK added in 0008 (documents created later)
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
