-- 0021_checklist_groups.sql — Tab 2 life-phase groups (docs/14 §4).
--
-- Adds:
--   * public.checklists."group" text default 'preflight'
--     check ("group" in ('preflight','travelers','return'))
--   * public.checklist_items.position int default 1000
-- Backfills checklists."group" from the seeded titles (docs/06-features/06 +
-- 0015_seed_bulk.sql §4) and checklist_items.position from sort_order.
-- RLS parity: no new policies — the existing row-level policies on checklists
-- (0009_rls.sql trip-scoped loop) and checklist_items (parent-checklist join)
-- automatically cover the new columns (column additions never widen row
-- visibility). RLS stays enabled (verified below).
-- Idempotent: every statement guards with IF NOT EXISTS / pg_constraint checks
-- so `supabase db push` re-runs are safe. "group" is always double-quoted:
-- GROUP is a reserved keyword in Postgres.

-- ---------------------------------------------------------------------------
-- 1) checklists."group"
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'checklists' and column_name = 'group'
  ) then
    alter table public.checklists
      add column "group" text default 'preflight';
  end if;
end $$;

-- Check constraint (separate so re-runs don't duplicate it).
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'checklists_group_check'
  ) then
    alter table public.checklists
      add constraint checklists_group_check
      check ("group" in ('preflight', 'travelers', 'return'));
  end if;
end $$;

-- Backfill NULLs left by the pre-migration default, then map life phases.
-- Mapping (reviewed against 0015_seed_bulk.sql §4 + docs/06-features/06):
--   packing / preflight-like names  -> 'preflight' (default; covers
--     'לפני הטיסה', 'יום הטיסה' and any custom 'packing/preflight/flight' list)
--   shared-gear / during-trip names  -> 'travelers' (covers 'כניסה לדירה',
--     'כל בוקר', 'יציאה ללילה' and any custom 'shared/gear/travelers' list)
--   post-trip / return names         -> 'return' (covers 'יום החזרה',
--     'אחרי הטיול' and any custom 'post/return' list)
-- Order matters: return-like is matched first so 'יום החזרה' (which contains
-- 'יום' like flight-day lists) is not misclassified as preflight.
update public.checklists set "group" = 'preflight' where "group" is null;

-- travelers: apartment arrival + daily + night-out (during-trip / shared gear).
update public.checklists set "group" = 'travelers'
where "group" = 'preflight'
  and (
    title ilike '%כניסה לדירה%' or title ilike '%כל בוקר%' or title ilike '%יציאה ללילה%'
    or title ilike '%דירה%' or title ilike '%בוקר%' or title ilike '%לילה%'
    or title ilike '%מטייל%'
    or title ilike '%shared%' or title ilike '%gear%' or title ilike '%traveler%'
  );

-- return: departure day + post-trip.
update public.checklists set "group" = 'return'
where "group" = 'preflight'
  and (
    title ilike '%יום החזרה%' or title ilike '%אחרי הטיול%'
    or title ilike '%חזרה%' or title ilike '%אחרי%'
    or title ilike '%post%' or title ilike '%return%'
  );

-- Safety net: anything unexpected falls back to 'preflight' (default).
update public.checklists set "group" = 'preflight'
where "group" not in ('preflight', 'travelers', 'return') or "group" is null;

-- Index for the per-group tab queries (?group=preflight|travelers|return).
create index if not exists checklists_trip_group_idx
  on public.checklists (trip_id, "group");

-- ---------------------------------------------------------------------------
-- 2) checklist_items.position (drag-and-drop ordering, docs/14 §4.2)
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'checklist_items' and column_name = 'position'
  ) then
    alter table public.checklist_items
      add column position int default 1000;
  end if;
end $$;

-- Backfill from the legacy sort_order. The 1000 sentinel marks rows that have
-- never been drag-ordered: after the first backfill no seed row keeps 1000,
-- so re-runs only touch newly inserted default-1000 rows (intended fallback).
update public.checklist_items set position = sort_order where position = 1000;

create index if not exists checklist_items_list_position_idx
  on public.checklist_items (checklist_id, position);

-- ---------------------------------------------------------------------------
-- 3) RLS parity — reuse existing policies, just verify RLS stays enabled.
-- ---------------------------------------------------------------------------
do $$ begin
  execute 'alter table public.checklists enable row level security';
  execute 'alter table public.checklist_items enable row level security';
end $$;

-- Existing policies (0009_rls.sql) automatically apply to the new columns:
--   checklists: checklists_select/insert/update/delete (is_trip_member /
--     is_active_trip_member / is_trip_owner on trip_id).
--   checklist_items: checklist_items_select/insert/update/delete (membership
--     flows through the parent checklist row). No per-column grants needed.
