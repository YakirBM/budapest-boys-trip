-- 0007_media.sql — media_items, media_reactions + expenses.receipt FK (docs/03 §4.6)
-- Audit extensions: sha256, tagged_member_ids, original/mime/bytes originals,
-- is_moment_of_day (+ partial unique index), extended media_status for the
-- client-side compression pipeline (doc 06-features/07).
create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,                        -- trips/{trip_id}/media/{user_id}/{file}
  thumbnail_path text,
  original_path text,                                -- pre-compression original (private, short retention)
  media_type media_type not null,
  sha256 text,                                       -- dedupe / integrity
  mime_original text,
  mime_stored text not null default 'image/webp',    -- pipeline transcodes to webp (doc 07)
  bytes_original bigint,
  size_bytes bigint,
  width int,
  height int,
  capture_time timestamptz,
  uploaded_at timestamptz not null default now(),
  day_number int check (day_number between 1 and 5),
  linked_place_id uuid references public.places(id) on delete set null,
  tagged_member_ids uuid[] not null default '{}',
  caption text,
  visibility media_visibility not null default 'group',  -- C4: doc 03 wins: 'group'/'private'
  is_moment_of_day boolean not null default false,   -- max one per (trip, day) — index below
  status media_status not null default 'active',     -- soft delete: hide, keep object
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (not is_moment_of_day or day_number is not null)
);

-- exactly one "moment of the day" per trip-day (NULL day_number rows never conflict)
create unique index media_items_one_moment_per_day
  on public.media_items (trip_id, day_number)
  where is_moment_of_day;

create table public.media_reactions (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media_items(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  kind reaction_kind not null,
  body text,                                         -- null for like; required for comment
  created_at timestamptz not null default now(),
  check (kind <> 'comment' or body is not null)
);

create unique index media_reactions_one_like           -- one like per member per media;
  on public.media_reactions (media_id, member_id)      -- multiple comments allowed
  where kind = 'like';

alter table public.expenses add constraint expenses_receipt_fkey
  foreign key (receipt_media_id) references public.media_items(id) on delete set null;
