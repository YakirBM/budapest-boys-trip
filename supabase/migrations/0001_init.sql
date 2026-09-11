-- 0001_init.sql — extensions, enums, helper functions, updated_at trigger
-- Canonical schema: docs/03-data-model-and-rls.md (§3 enums, §5 helpers)
-- Reconciliation (2026-09-11): see docs/03 §13 — extended place_type/media_status
-- (BUILD_STATUS audit), new enums accommodation_status / transit_anchor_role /
-- safety_notice_status. Helper functions qualify auth.uid() because the fixed
-- `set search_path` would otherwise hide the auth schema.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type member_role        as enum ('owner','member');
create type member_status      as enum ('active','pending','declined');

create type place_type         as enum ('restaurant','bar','cafe','attraction','viewpoint',
                                        'bath','shopping','other',
                                        -- feature-driven extensions (route/transit docs):
                                        'airport','transit_hub','bus_stop','emergency','meeting_point');
create type place_status       as enum ('idea','under_review','approved','scheduled','visited','rejected');

create type itinerary_category as enum ('food','attraction','walk','transit','rest','nightlife',
                                        'flight','accommodation','other');
create type itinerary_status   as enum ('planned','confirmed','in_progress','completed','skipped','cancelled');

create type reservation_status as enum ('pending','confirmed','cancelled','used');

create type flight_direction   as enum ('outbound','return');
create type flight_status      as enum ('scheduled','boarding','departed','landed','cancelled');

-- accommodation lifecycle (doc 06-features/03: candidate → favorite → booked | rejected)
create type accommodation_status as enum ('candidate','favorite','booked','rejected');

create type expense_category   as enum ('lodging','food','transit','attraction','shopping','nightlife','taxi','other');
create type expense_status     as enum ('draft','confirmed','settled','refunded');
create type split_method       as enum ('equal','exact','percent','shares');
create type fx_rate_type       as enum ('market','card','cash','manual');

create type checklist_scope    as enum ('personal','group','assigned');
create type checklist_priority as enum ('critical','important','normal');
create type checklist_item_status as enum ('not_started','in_progress','done','blocked');

create type poll_status        as enum ('open','closed');
create type quorum_rule        as enum ('majority','unanimous');

create type media_type         as enum ('image','video');
create type media_visibility   as enum ('group','private');
-- extended for the client-side compression pipeline (doc 07):
create type media_status       as enum ('active','deleted','pending','needs_conversion','ready','failed');
create type reaction_kind      as enum ('like','comment');

create type share_scope        as enum ('private','members','emergency_only');
create type document_type      as enum ('passport','insurance','eticket','booking','other');
create type price_source       as enum ('manual','api');

create type transit_anchor_role as enum ('central','accommodation','airport_100e','night_meeting');
create type safety_notice_status as enum ('active','returned','expired');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Apply set_updated_at to every table that has an updated_at column.
-- (No tables exist yet at this point in the migration sequence; the same
-- idempotent block re-runs at the end of 0008_private_system.sql once all
-- tables are created. Duplicate-safe for re-execution.)
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
