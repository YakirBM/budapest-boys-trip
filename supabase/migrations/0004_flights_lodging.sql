-- 0004_flights_lodging.sql — flights, flight_passengers, accommodations (docs/03 §4.3)
-- Audit extensions: flights.source/last_verified_at (rule 5),
-- flight_passengers.checkin_done_at/addons, accommodation lifecycle (C10) +
-- doc 06-features/03 arrival/access columns.
create table public.flights (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  direction flight_direction not null,
  airline text not null default 'Arkia',
  flight_no text not null,                           -- IZ291 / IZ292
  dep_airport text not null,
  dep_terminal text,
  arr_airport text not null,
  dep_time timestamptz not null,
  arr_time timestamptz,                              -- NULL until verified — never invent (rule 5)
  arr_time_verified boolean not null default false,
  booking_ref_masked text,                           -- '1385•••93' only — full ref never stored in seed/DB dumps
  status flight_status not null default 'scheduled',
  notes text,
  source text,                                       -- e.g. 'Arkia e-ticket res 1385•••93'
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (trip_id, direction)
);

-- One row per member per flight. NOT seeded: rows are created automatically for
-- both flights by the handle_new_user trigger (audit C2 — members sign up after seed).
create table public.flight_passengers (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid not null references public.flights(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  eticket_serial_masked text,                        -- masked only (C3)
  seat text,
  checked_in boolean not null default false,
  checkin_done_at timestamptz,
  addons jsonb,                                      -- baggage/seat extras from the booking
  boarding_pass_doc_id uuid,                         -- FK added in 0008
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (flight_id, member_id)
);

create table public.accommodations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  status accommodation_status not null default 'candidate',  -- C10: candidates exist pre-booking
  address text,                                      -- C10: nullable; enforced when booked (CHECK below)
  lat numeric(9,6),
  lng numeric(9,6),
  check_in_at timestamptz,
  check_out_at timestamptz,
  booking_ref_masked text,
  host_name text,
  host_phone text,
  host_contact_url text,
  wifi_ssid text,
  wifi_password text,                                -- semi-sensitive; trip-member RLS only
  access_instructions text,
  -- doc 06-features/03 columns:
  url text,
  platform text,                                     -- Booking.com / Airbnb / direct
  beds int,
  door_code text,
  floor_label text,
  apartment_label text,
  intercom text,
  late_checkin_notes text,
  tourist_tax_pct numeric(5,2),
  tourist_tax_verified_at timestamptz,
  nearest_transit_stop text,
  walk_to_deak_min int,                              -- walk minutes to Deák Ferenc tér
  total_price numeric(12,2),
  currency char(3) not null default 'HUF',
  deposit numeric(12,2),
  paid_by uuid references auth.users(id) on delete set null,
  split_done boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (check_out_at is null or check_in_at is null or check_out_at > check_in_at),
  check (status <> 'booked' or address is not null)  -- C10: booked ⇒ address known (offline-first rule 6)
);
