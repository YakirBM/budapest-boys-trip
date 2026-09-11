-- 0016_access_log_policy.sql — docs/06-features/08-medical-safety.md Card 3:
-- "The owner sees the full log (מי צפה בפרופיל שלי)". The base app_events SELECT
-- policy grants actor-or-trip-owner reads; the SUBJECT of an event (entity_id =
-- the profile owner) also needs read access to their own access log.
-- Append-only invariant unchanged: still no UPDATE/DELETE policies.

create policy app_events_read_own_entity
  on public.app_events
  for select
  to authenticated
  using (entity_id = auth.uid());
