-- 0009_rls.sql — enable RLS on every public table + all policies (docs/03 §6)
-- Hard rule 2: RLS is mandatory on every table. allowed_emails intentionally gets
-- NO policies (service-role only; users must never enumerate the allowlist).
--
-- Notes / adaptations vs the doc 03 §6 sketch (documented in docs/03 §13):
--   * itinerary_items, flight_passengers, checklist_items, poll_options, votes,
--     note_reactions and checklist_item_blocks do not use the generic
--     trip_id loop — their membership flows through the parent row
--     (day_plans / flights / checklists / polls), with cross-checks so a
--     denormalized trip_id can never point at a different trip than the parent.

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  for t in select table_name from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE'
  loop execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Standard 4-policy pattern for trip-scoped tables
-- (doc 03 §6 list + new transport tables + day_notes).
-- itinerary_items, flight_passengers, checklist_items and poll_options are
-- handled AFTER the loop: they have no trip_id column — membership flows through
-- their parent rows (day_plans / flights / checklists / polls), mirroring the
-- expense_splits parent-visibility pattern (docs/03 §13).
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['places','day_plans','day_notes','reservations',
    'flights','accommodations','checklists',
    'polls','transit_tickets','transit_anchor_stations',
    'transit_favorite_lines','preferred_routes','emergency_contacts']
  loop
    execute format('create policy %I on public.%I for select to authenticated
      using (is_trip_member(trip_id));', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated
      with check (is_active_trip_member(trip_id));', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated
      using (is_active_trip_member(trip_id))
      with check (is_active_trip_member(trip_id));', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated
      using (is_trip_owner(trip_id));', t || '_delete', t);
  end loop;
end $$;

-- itinerary_items: trip flows through the parent day_plan.
create policy itinerary_items_select on public.itinerary_items for select to authenticated
  using (exists (select 1 from public.day_plans dp
    where dp.id = itinerary_items.day_plan_id and is_trip_member(dp.trip_id)));
create policy itinerary_items_insert on public.itinerary_items for insert to authenticated
  with check (exists (select 1 from public.day_plans dp
    where dp.id = itinerary_items.day_plan_id and is_active_trip_member(dp.trip_id)));
create policy itinerary_items_update on public.itinerary_items for update to authenticated
  using (exists (select 1 from public.day_plans dp
    where dp.id = itinerary_items.day_plan_id and is_active_trip_member(dp.trip_id)))
  with check (exists (select 1 from public.day_plans dp
    where dp.id = itinerary_items.day_plan_id and is_active_trip_member(dp.trip_id)));
create policy itinerary_items_delete on public.itinerary_items for delete to authenticated
  using (exists (select 1 from public.day_plans dp
    where dp.id = itinerary_items.day_plan_id and is_trip_owner(dp.trip_id)));

-- flight_passengers: trip flows through the parent flight.
create policy flight_passengers_select on public.flight_passengers for select to authenticated
  using (exists (select 1 from public.flights f
    where f.id = flight_passengers.flight_id and is_trip_member(f.trip_id)));
create policy flight_passengers_insert on public.flight_passengers for insert to authenticated
  with check (exists (select 1 from public.flights f
    where f.id = flight_passengers.flight_id and is_active_trip_member(f.trip_id)));
create policy flight_passengers_update on public.flight_passengers for update to authenticated
  using (exists (select 1 from public.flights f
    where f.id = flight_passengers.flight_id and is_active_trip_member(f.trip_id)))
  with check (exists (select 1 from public.flights f
    where f.id = flight_passengers.flight_id and is_active_trip_member(f.trip_id)));
create policy flight_passengers_delete on public.flight_passengers for delete to authenticated
  using (exists (select 1 from public.flights f
    where f.id = flight_passengers.flight_id and is_trip_owner(f.trip_id)));

-- checklist_items: trip flows through the parent checklist.
create policy checklist_items_select on public.checklist_items for select to authenticated
  using (exists (select 1 from public.checklists cl
    where cl.id = checklist_items.checklist_id and is_trip_member(cl.trip_id)));
create policy checklist_items_insert on public.checklist_items for insert to authenticated
  with check (exists (select 1 from public.checklists cl
    where cl.id = checklist_items.checklist_id and is_active_trip_member(cl.trip_id)));
create policy checklist_items_update on public.checklist_items for update to authenticated
  using (exists (select 1 from public.checklists cl
    where cl.id = checklist_items.checklist_id and is_active_trip_member(cl.trip_id)))
  with check (exists (select 1 from public.checklists cl
    where cl.id = checklist_items.checklist_id and is_active_trip_member(cl.trip_id)));
create policy checklist_items_delete on public.checklist_items for delete to authenticated
  using (exists (select 1 from public.checklists cl
    where cl.id = checklist_items.checklist_id and is_trip_owner(cl.trip_id)));

-- poll_options: trip flows through the parent poll.
create policy poll_options_select on public.poll_options for select to authenticated
  using (exists (select 1 from public.polls p
    where p.id = poll_options.poll_id and is_trip_member(p.trip_id)));
create policy poll_options_insert on public.poll_options for insert to authenticated
  with check (exists (select 1 from public.polls p
    where p.id = poll_options.poll_id and is_active_trip_member(p.trip_id)));
create policy poll_options_update on public.poll_options for update to authenticated
  using (exists (select 1 from public.polls p
    where p.id = poll_options.poll_id and is_active_trip_member(p.trip_id)))
  with check (exists (select 1 from public.polls p
    where p.id = poll_options.poll_id and is_active_trip_member(p.trip_id)));
create policy poll_options_delete on public.poll_options for delete to authenticated
  using (exists (select 1 from public.polls p
    where p.id = poll_options.poll_id and is_trip_owner(p.trip_id)));

-- ---------------------------------------------------------------------------
-- Table-specific policies
-- ---------------------------------------------------------------------------

-- trips: creator inserts; members read; only owner updates.
create policy trips_select on public.trips for select to authenticated using (is_trip_member(id));
create policy trips_insert on public.trips for insert to authenticated with check (created_by = auth.uid());
create policy trips_update on public.trips for update to authenticated
  using (is_trip_owner(id)) with check (is_trip_owner(id));

-- allowed_emails: no client policies at all (service role only).

-- profiles: self always; co-members of any shared trip see basics (names/avatars).
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (select 1 from public.trip_members a
    join public.trip_members b on a.trip_id = b.trip_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- INSERT happens at signup via the handle_new_user trigger (SECURITY DEFINER, service role).

-- trip_members: members see co-members; owner manages; a user updates only their own
-- row (invite accept/decline).
create policy trip_members_select on public.trip_members for select to authenticated
  using (user_id = auth.uid() or is_trip_member(trip_id));
create policy trip_members_insert on public.trip_members for insert to authenticated
  with check (is_trip_owner(trip_id) and status = 'pending');
create policy trip_members_update on public.trip_members for update to authenticated
  using (user_id = auth.uid() or is_trip_owner(trip_id));
create policy trip_members_delete on public.trip_members for delete to authenticated
  using (is_trip_owner(trip_id) or (user_id = auth.uid() and role <> 'owner'));

-- expenses: personal expenses visible ONLY to the payer (rule 3).
create policy expenses_select on public.expenses for select to authenticated
  using (is_trip_member(trip_id) and (not is_personal or paid_by = auth.uid()));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (is_active_trip_member(trip_id) and (not is_personal or paid_by = auth.uid()));
create policy expenses_update on public.expenses for update to authenticated
  using (paid_by = auth.uid() or is_trip_owner(trip_id));
create policy expenses_delete on public.expenses for delete to authenticated
  using (paid_by = auth.uid() or is_trip_owner(trip_id));

-- expense_splits: follow the parent expense's visibility; no splits on personal expenses;
-- immutable once the expense is settled.
create policy expense_splits_select on public.expense_splits for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_splits.expense_id
    and is_trip_member(e.trip_id) and (not e.is_personal or e.paid_by = auth.uid())));
create policy expense_splits_write on public.expense_splits for all to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_splits.expense_id
    and is_active_trip_member(e.trip_id) and not e.is_personal and e.status <> 'settled'))
  with check (exists (select 1 from public.expenses e where e.id = expense_splits.expense_id
    and is_active_trip_member(e.trip_id) and not e.is_personal and e.status <> 'settled'));

-- exchange_rates / weather_cache: read-only for members; Edge Functions write (service role).
create policy exchange_rates_select on public.exchange_rates for select to authenticated using (true);
create policy weather_cache_select on public.weather_cache for select to authenticated using (true);

-- budget_caps: all members read (visible warnings); only the trip owner writes.
create policy budget_caps_select on public.budget_caps for select to authenticated
  using (is_trip_member(trip_id));
create policy budget_caps_insert on public.budget_caps for insert to authenticated
  with check (is_trip_owner(trip_id));
create policy budget_caps_update on public.budget_caps for update to authenticated
  using (is_trip_owner(trip_id)) with check (is_trip_owner(trip_id));
create policy budget_caps_delete on public.budget_caps for delete to authenticated
  using (is_trip_owner(trip_id));

-- votes: one member = one vote, own rows only; membership flows through the parent
-- poll, cross-checked so votes.trip_id must equal polls.trip_id (docs/03 §13).
create policy votes_select on public.votes for select to authenticated using (
  exists (select 1 from public.polls p
          where p.id = votes.poll_id and p.trip_id = votes.trip_id
            and is_trip_member(p.trip_id)));
create policy votes_insert on public.votes for insert to authenticated with check (
  votes.member_id = auth.uid() and exists (
    select 1 from public.polls p
    where p.id = votes.poll_id and p.trip_id = votes.trip_id
      and is_active_trip_member(p.trip_id)));
create policy votes_update on public.votes for update to authenticated
  using (votes.member_id = auth.uid() and exists (
    select 1 from public.polls p where p.id = votes.poll_id
      and p.trip_id = votes.trip_id and is_trip_member(p.trip_id)))
  with check (votes.member_id = auth.uid() and exists (
    select 1 from public.polls p where p.id = votes.poll_id
      and p.trip_id = votes.trip_id and is_active_trip_member(p.trip_id)));
create policy votes_delete on public.votes for delete to authenticated using (
  votes.member_id = auth.uid() and exists (
    select 1 from public.polls p where p.id = votes.poll_id
      and p.trip_id = votes.trip_id and is_trip_member(p.trip_id)));

-- note_reactions: follow the parent day_note's visibility (media_reactions pattern).
create policy note_reactions_select on public.note_reactions for select to authenticated
  using (exists (select 1 from public.day_notes dn
    where dn.id = note_reactions.note_id and is_trip_member(dn.trip_id)));
create policy note_reactions_insert on public.note_reactions for insert to authenticated
  with check (member_id = auth.uid() and exists (
    select 1 from public.day_notes dn
    where dn.id = note_reactions.note_id and is_active_trip_member(dn.trip_id)));
create policy note_reactions_delete on public.note_reactions for delete to authenticated
  using (member_id = auth.uid());

-- checklist_item_blocks: readable when either endpoint item is visible; writable by
-- active members of the parent item's checklist trip (C5).
create policy checklist_item_blocks_select on public.checklist_item_blocks
  for select to authenticated using (
    exists (select 1 from public.checklist_items ci
            join public.checklists cl on cl.id = ci.checklist_id
            where ci.id = checklist_item_blocks.item_id and is_trip_member(cl.trip_id))
    or exists (select 1 from public.checklist_items ci
            join public.checklists cl on cl.id = ci.checklist_id
            where ci.id = checklist_item_blocks.blocked_by_item_id and is_trip_member(cl.trip_id)));
create policy checklist_item_blocks_insert on public.checklist_item_blocks
  for insert to authenticated with check (
    exists (select 1 from public.checklist_items ci
            join public.checklists cl on cl.id = ci.checklist_id
            where ci.id = checklist_item_blocks.item_id and is_active_trip_member(cl.trip_id)));
create policy checklist_item_blocks_delete on public.checklist_item_blocks
  for delete to authenticated using (
    exists (select 1 from public.checklist_items ci
            join public.checklists cl on cl.id = ci.checklist_id
            where ci.id = checklist_item_blocks.item_id and is_active_trip_member(cl.trip_id)));

-- media: group-visible unless private; only uploader or trip owner deletes.
create policy media_select on public.media_items for select to authenticated
  using (status = 'active' and is_trip_member(trip_id)
         and (visibility = 'group' or uploader_id = auth.uid()));
create policy media_insert on public.media_items for insert to authenticated
  with check (uploader_id = auth.uid() and is_active_trip_member(trip_id));
create policy media_update on public.media_items for update to authenticated
  using (uploader_id = auth.uid());
create policy media_delete on public.media_items for delete to authenticated
  using (uploader_id = auth.uid() or is_trip_owner(trip_id));

create policy media_reactions_select on public.media_reactions for select to authenticated
  using (exists (select 1 from public.media_items m where m.id = media_reactions.media_id
    and m.status = 'active' and is_trip_member(m.trip_id)
    and (m.visibility = 'group' or m.uploader_id = auth.uid())));
create policy media_reactions_insert on public.media_reactions for insert to authenticated
  with check (member_id = auth.uid());
create policy media_reactions_delete on public.media_reactions for delete to authenticated
  using (member_id = auth.uid());

-- emergency_profiles: per visibility scope. 'private' → self only;
-- 'members'/'emergency_only' → co-members of a shared active trip may read, but the UI
-- must render this data ONLY in the emergency card, and every read MUST insert an
-- app_events row (action='view.emergency_profile') — enforce via the
-- get-emergency-profile Edge Function, not direct client reads.
create policy emergency_profiles_select on public.emergency_profiles for select to authenticated
  using (user_id = auth.uid() or (visibility <> 'private' and exists (
    select 1 from public.trip_members a join public.trip_members b on a.trip_id = b.trip_id
    where a.user_id = auth.uid() and b.user_id = emergency_profiles.user_id
      and a.status = 'active' and b.status = 'active')));
create policy emergency_profiles_write on public.emergency_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- insurance policies: owner-only, always.
create policy insurance_select on public.insurance_policies for select to authenticated
  using (user_id = auth.uid());
create policy insurance_write on public.insurance_policies for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- documents: private docs owner-only; shared docs trip-visible.
create policy documents_select on public.documents for select to authenticated
  using (owner_id = auth.uid() or (not is_private and trip_id is not null and is_trip_member(trip_id)));
create policy documents_insert on public.documents for insert to authenticated
  with check (owner_id = auth.uid());
create policy documents_update on public.documents for update to authenticated
  using (owner_id = auth.uid());
create policy documents_delete on public.documents for delete to authenticated
  using (owner_id = auth.uid() or is_trip_owner(trip_id));

-- app_events: append-only audit. Anyone authenticated may insert their own events;
-- only the actor or the trip owner reads. No UPDATE/DELETE policies → immutable.
create policy app_events_insert on public.app_events for insert to authenticated
  with check (actor_id = auth.uid());
create policy app_events_select on public.app_events for select to authenticated
  using (actor_id = auth.uid() or is_trip_owner(trip_id));

-- safety_notices: everyone in the trip sees them (that is the point of a ping);
-- a member writes/updates/retracts only their own notice.
create policy safety_notices_select on public.safety_notices for select to authenticated
  using (is_trip_member(trip_id));
create policy safety_notices_insert on public.safety_notices for insert to authenticated
  with check (member_id = auth.uid() and is_active_trip_member(trip_id));
create policy safety_notices_update on public.safety_notices for update to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid() and is_active_trip_member(trip_id));
create policy safety_notices_delete on public.safety_notices for delete to authenticated
  using (member_id = auth.uid());
