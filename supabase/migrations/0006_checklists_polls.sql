-- 0006_checklists_polls.sql — checklists, checklist_items, checklist_item_blocks,
-- polls, poll_options, votes (docs/03 §4.5 + audit C5 + doc 06-features/09 gaps).
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  scope checklist_scope not null default 'group',
  owner_id uuid references auth.users(id) on delete cascade,  -- required for personal/assigned
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  title text not null,
  description text,
  type text,                                         -- free classification: doc/purchase/pack/safety/...
  assignee_id uuid references auth.users(id) on delete set null,  -- null = group/"whoever gets to it"
  due_at timestamptz,
  priority checklist_priority not null default 'normal',
  status checklist_item_status not null default 'not_started',
  blocked_by_id uuid references public.checklist_items(id) on delete set null,  -- single-link compat
  link text,                                         -- deep link; no tokens/identifying params (docs/04)
  attachment_path text,                              -- private bucket only; signed URLs
  reminder_offset_minutes int,                       -- minutes before due_at; null = no reminder
  created_by uuid references auth.users(id) on delete set null,
  sort_order int not null default 0,
  done_by uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Multi-blocker dependency graph (audit C5): a blocked item cannot be marked done
-- until all rows here (and blocked_by_id) are done. blocked_by_id kept for
-- single-link compatibility.
create table public.checklist_item_blocks (
  item_id uuid not null references public.checklist_items(id) on delete cascade,
  blocked_by_item_id uuid not null references public.checklist_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, blocked_by_item_id),
  check (item_id <> blocked_by_item_id)
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  question text not null,
  status poll_status not null default 'open',
  deadline timestamptz not null,
  quorum_rule quorum_rule not null default 'majority',
  anonymous_until_close boolean not null default false,  -- display-level only (doc 06-features/09 rule 3)
  created_by uuid not null references auth.users(id) on delete restrict,
  decided_option_id uuid,                            -- FK to poll_options added below (circular)
  decision_note text,
  closed_at timestamptz,
  closed_reason text,                                -- 'deadline' | 'manual' | null
  winner_item_id uuid references public.itinerary_items(id) on delete set null,  -- convert target
  overridden_by uuid references auth.users(id) on delete set null,  -- owner tie-break log
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  est_cost numeric(12,2),
  currency char(3) not null default 'HUF',
  distance_note text,
  time_note text,
  travel_min int,
  time_needed_min int,
  availability_note text,
  source text,                                       -- rule 5: price/time provenance
  last_verified_at timestamptz,
  place_id uuid references public.places(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (id, poll_id)   -- enables the composite FK on votes
);

alter table public.polls add constraint polls_decided_option_fkey
  foreign key (decided_option_id) references public.poll_options(id) on delete set null;

alter table public.itinerary_items add constraint itinerary_items_poll_fkey
  foreign key (poll_id) references public.polls(id) on delete set null;

-- trip_id is denormalized so policies can gate on trip membership directly; the
-- explicit policies in 0009 additionally cross-check votes.trip_id = polls.trip_id
-- (documented in docs/03 §13).
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null,
  member_id uuid not null references auth.users(id) on delete cascade,
  voted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (poll_id, member_id),                       -- one vote per member per poll (changeable until deadline)
  foreign key (option_id, poll_id) references public.poll_options (id, poll_id)
    on delete cascade   -- option must belong to the voted poll
);
