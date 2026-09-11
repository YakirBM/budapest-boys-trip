---
id: import-and-seed
title: Import and Seed
status: draft
depends_on: [data-model]
last_updated: 2026-09-11
---

# 09 — Import and Seed

Turns verified trip facts (members, flights, anchors) into deterministic database rows.
Schema source of truth: [03-data-model-and-rls.md](03-data-model-and-rls.md). Feature specs that consume this
data: [06-features/02-flights.md](06-features/02-flights.md), [06-features/03-accommodation.md](06-features/03-accommodation.md),
[06-features/04-transportation.md](06-features/04-transportation.md), [06-features/08-medical-safety.md](06-features/08-medical-safety.md).

> Column names below follow the canonical schema in [03-data-model-and-rls.md](03-data-model-and-rls.md).
> If that doc refined a column name, the schema wins — adjust the SQL before running.

## Seed strategy

- Seed data lives in `supabase/seed.sql` and runs **after all migrations**:
  `pnpm supabase db push && psql "$DATABASE_URL" -f supabase/seed.sql` (or `supabase db reset` locally).
- **Idempotent**: every statement uses explicit primary keys (fixed UUIDs) plus `ON CONFLICT DO NOTHING`,
  so re-running never duplicates rows and never overwrites user edits.
- **Single trip row**: the entire app assumes exactly one trip (`id = 00000000-0000-4000-8000-000000000001`).
  Every seeded row references it.
- Seeding inserts **reference/anchor data only** (trips, flights, places, templates, allowlist).
  User-owned data (expenses, checklist completions, media) is never seeded.
- Fixed UUID scheme for seed rows — readable and collision-free:
  - trip: `…0001`, day plans: `…0101`–`…0105`, flights: `…0201` (IZ291), `…0202` (IZ292),
    places: `…0301`–`…0317` (5 anchors + 12 idea bank), checklists: `…0401`–`…0407`,
    checklist items: `…05xx`, transit tickets: `…0601`–`…0606`, anchor stations: `…0611`–`…0614`,
    emergency contacts: `…0621`–`…0623`.
- [ ] Add a CI/dev assertion: seeding twice produces identical row counts.

## Seed data spec

### Trip

```sql
insert into public.trips (id, name, city, country, start_date, end_date,
                          tz_primary, tz_secondary, base_currency, created_by)
values (
  '00000000-0000-4000-8000-000000000001',
  'Budapest 2026',
  'Budapest',
  'HU',
  '2026-10-04',
  '2026-10-08',
  'Europe/Budapest',   -- UTC+2 on trip dates (CEST until late Oct)
  'Asia/Jerusalem',    -- UTC+3 on trip dates (IDT until late Oct)
  'HUF',
  null                 -- audit C1: no user exists yet; first allowlisted owner claims it
)
on conflict (id) do nothing;
```

### Allowed emails (signup allowlist)

Five rows — 4 confirmed members + Roei (pending decision). This is what gates signup; see
[04-security-and-privacy.md](04-security-and-privacy.md).

```sql
insert into public.allowed_emails (email, display_name, role, member_status, ticket_serial_masked, invited_by) values
  ('yakir.b.m.ite@gmail.com', 'Yakir Elazar Ben Menashe', 'owner',  'active',  '4210•••••06', null),
  ('aharonml123@gmail.com',   'Aharon Meyer Lawrence',    'member', 'active',  '4210•••••95', null),
  ('jonatannheh@gmail.com',   'Yehonatan Winestate',      'member', 'active',  '4210•••••73', null),
  ('barjohan25.11@gmail.com', 'Bar Mevorach Johan',       'member', 'active',  '4210•••••84', null),
  ('roeiduv@gmail.com',       'Roei',                     'member', 'pending', null,          null)
on conflict (email) do nothing;
```

- [ ] Confirm exact spelling of each address against the parsed source
      (`C:\Users\yakir\Downloads\Personal-info.xlsx` → `docs/09` extract) before running —
      a typo here permanently locks that member out (source: Personal-info.xlsx, last_verified: 2026-09-11).

### Day plans (1–5)

```sql
insert into public.day_plans (id, trip_id, day_number, date, title) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 1, '2026-10-04', 'Arrival'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 2, '2026-10-05', 'Full day'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 3, '2026-10-06', 'Full day'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 4, '2026-10-07', 'Full day'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 5, '2026-10-08', 'Departure')
on conflict (id) do nothing;
```

- Day 1 starts with IZ291 arrival (evening local time — arrival time unverified, see flights below).
- Day 5 ends with IZ292 departure 10:25 Europe/Budapest — schedule nothing after ~07:30.
- [ ] Decide whether day-plan titles stay English seed data or become Hebrew display strings before trip
      (UI rule: no hardcoded strings — titles are data, so either is valid; pick one and localize consistently).

### Flights (verified from Arkia e-ticket)

Source: Arkia e-ticket reservation **1385•••93** (source file:
`C:\Users\yakir\Downloads\res_doc13859993.pdf` — the full reservation number lives only in
that private PDF and in the user's e-mail; never in seed/UI/DB),
issued 2026-09-10 (masked 1385•••93). Extraction details: [06-features/02-flights.md](06-features/02-flights.md).

```sql
insert into public.flights (
  id, trip_id, direction, airline, flight_no,
  dep_airport, dep_terminal, arr_airport,
  dep_time, arr_time, arr_time_verified,
  booking_ref_masked, status, notes, source, last_verified_at
) values
  ('00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000001',
   'outbound', 'Arkia', 'IZ291',
   'TLV', '3', 'BUD',
   '2026-10-04T16:35:00+03:00',  -- Asia/Jerusalem (IDT, UTC+3)
   null, false,                  -- arrival NOT printed on ticket — verify (est ~3.5h)
   '1385•••93', 'scheduled',
   'Arrival time not printed on the ticket — verify with Arkia before updating.',
   'Arkia e-ticket res 1385•••93', '2026-09-10T12:00:00+03:00'),
  ('00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000001',
   'return', 'Arkia', 'IZ292',
   'BUD', null, 'TLV',
   '2026-10-08T10:25:00+02:00',  -- Europe/Budapest (CEST, UTC+2)
   null, false,
   '1385•••93', 'scheduled',
   'Arrival time not printed on the ticket — verify with Arkia before updating.',
   'Arkia e-ticket res 1385•••93', '2026-09-10T12:00:00+03:00')
on conflict (id) do nothing;
```

Hard rules encoded here:

- `booking_ref_masked` only — the full reservation number must never appear in seed/UI; it lives in the
  private e-ticket document.
- `arrival_time` is `NULL` with `arrival_time_verified = false` until verified against Arkia —
  **never invent arrival times** (project hard rule 5).

### Flight passengers (NOT seeded — created at signup)

Per audit resolution **C2** (doc 03 schema wins): `flight_passengers.member_id → auth.users`,
and no user exists at seed time — so **no passenger rows are seeded**. The
`handle_new_user` trigger (migration `0013_auth_triggers.sql`) creates one row per
active member per flight automatically on first login, copying the masked serial from
`allowed_emails.ticket_serial_masked` (`4210•••••06` style — audit C3: masked only).
Roei (`member_status = 'pending'`) gets no passenger rows until activated.

- Baggage facts from the ticket (handbag 40×30×20 included; combined carry-on ≤8kg; trolley/checked extra)
  render in the flights UI from [06-features/02-flights.md](06-features/02-flights.md), not from seed.
- Full e-ticket serials are NEVER stored anywhere — they stay in the private e-ticket PDF
  uploaded to the `trip-documents` bucket.

### Places — anchors

Coordinates are **approximate anchors** (source: OpenStreetMap-level knowledge, last_verified: never) —
each row carries a verify task before it is used for navigation.

```sql
insert into public.places (id, trip_id, name, type, lat, lng, google_maps_url, note, source, status, last_verified_at) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001',
   'Budapest Airport (BUD)', 'airport', 47.4369, 19.2616,
   'https://maps.google.com/?q=Budapest+Airport+(BUD)',
   'approx anchor — verify', 'OpenStreetMap-level approx (unverified)', 'approved', null),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001',
   'Deák Ferenc tér', 'transit_hub', 47.4979, 19.0547,
   'https://maps.google.com/?q=Deák+Ferenc+tér,+Budapest',
   'approx anchor — verify', 'OpenStreetMap-level approx (unverified)', 'approved', null),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001',
   '100E Airport stop (BUD)', 'bus_stop', null, null, null,
   'verify exact stop location', 'bkk.hu (to verify)', 'under_review', null),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000001',
   '100E Deák Ferenc tér stop', 'bus_stop', null, null, null,
   'verify exact stop location', 'bkk.hu (to verify)', 'under_review', null),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000001',
   'Emergency numbers (HU)', 'emergency', null, null, null,
   'seeded — see medical/safety doc; EU-wide: tel:112', 'EU standard', 'approved', '2026-09-11T12:00:00+03:00')
on conflict (id) do nothing;
```

- Deák Ferenc tér is the transit anchor: all transport guidance in
  [06-features/04-transportation.md](06-features/04-transportation.md) is written relative to it.
- The emergency place is backed by the emergency doc below; `tel:112` is the EU-wide number.
- [ ] Verify BUD airport coords + terminal layout on the airport site (source: bud.hu — to verify).
- [ ] Verify both 100E stop locations + fill lat/lng (source: bkk.hu — to verify; ticket ~2,500 HUF,
      verify price too — source: bkk.hu, last_verified: never).

### Checklist templates

Per audit resolution **C7**, doc 06 wins: **7 lists** (pre-flight, flight-day,
apartment-arrival, morning, night-out, departure-day, post-trip) with their Hebrew items
are seeded by `supabase/seed.sql` from the authoritative content in
[06-features/06-checklists.md](06-features/06-checklists.md).

```sql
insert into public.checklists (id, trip_id, title, scope, owner_id, sort_order) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', 'לפני הטיסה',  'assigned', null, 10),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', 'יום הטיסה',   'assigned', null, 20),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001', 'כניסה לדירה', 'group',    null, 30),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000001', 'כל בוקר',     'group',    null, 40),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000001', 'יציאה ללילה', 'group',    null, 50),
  ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000001', 'יום החזרה',   'group',    null, 60),
  ('00000000-0000-4000-8000-000000000407', '00000000-0000-4000-8000-000000000001', 'אחרי הטיול',  'assigned', null, 70)
on conflict (id) do nothing;
-- checklist_items (…05xx ids) insert from the authoritative lists in 06-features/06-checklists.md;
-- the check-in→boarded dependency chain seeds into checklist_item_blocks (audit C5).
-- assignee_id stays NULL pre-signup — per-member expansion ("each member") is deferred.
```

### Emergency numbers

Seeded as the emergency place row above plus a documents row (or equivalent per schema):

| Number | Purpose | Source |
|---|---|---|
| 112 | EU-wide general emergency | verified standard, last_verified: 2026-09-11 |
| +972-3-6903712 | Arkia support (Sun–Thu 08:00–22:00, Fri 08:00–13:00 IL time) | Arkia e-ticket, last_verified: 2026-09-10 |
| *5758 | Arkia support (IL domestic) | Arkia e-ticket, last_verified: 2026-09-10 |
| Israeli consulate Budapest | TBD — verify address/phone vs Israeli MFA | [ ] verify (source: MFA sheba.mfa.gov.il — never invent) |

```sql
-- seeded in supabase/seed.sql with fixed ids …0621–…0623 (schema: docs/03 emergency_contacts)
insert into public.emergency_contacts (trip_id, label, phone, kind, source, last_verified_at) values
  ('00000000-0000-4000-8000-000000000001', 'מוקד חירום אירופי (112)',       '112',             'emergency', 'EU standard',        '2026-09-11'),
  ('00000000-0000-4000-8000-000000000001', 'ארקיע — תמיכה (חו״ל)',          '+972-3-6903712',  'airline',   'Arkia e-ticket',     '2026-09-10'),
  ('00000000-0000-4000-8000-000000000001', 'ארקיע — תמיכה (ישראל, *5758)',  '*5758',           'airline',   'Arkia e-ticket',     '2026-09-10')
on conflict do nothing;
```

## Member import flow

Members **cannot** be fully seeded before they sign up — `profiles` rows reference `auth.users`.
The flow is allowlist-first with an email-match trigger:

```
allowed_emails (seeded) ──► member requests magic link ──► Supabase checks allowlist
        │                                                        │
        ▼                                                        ▼
 rejected (403)                                     auth.users row created
                                                            │
                                     trigger: create profile from auth.users
                                                            │
                                     trigger: link profile → trip_members (email match)
```

1. **Pre-seed `allowed_emails`** (done above) — this is the signup gate.
2. **On first login**, a trigger on `auth.users` creates the `profiles` row
   (SECURITY DEFINER, `on_auth_user_created`).
3. **Email-match trigger** links the new user into the single trip, creates both
   flight-passenger rows (active members) and claims trip ownership for the first
   allowlisted owner — no manual admin step, no race with first-launch.
   **Authoritative implementation: migration `supabase/migrations/0013_auth_triggers.sql`
   (`handle_new_user` + `enforce_allowed_email`)** — the sketch below is superseded:

```sql
-- superseded sketch (kept for history) — see 0013_auth_triggers.sql for the real thing
create or replace function public.link_trip_member_on_profile_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into trip_members (trip_id, profile_id, role, status)
  select t.id, new.id, 'member', 'active'
  from trips t
  where t.id = '00000000-0000-4000-8000-000000000001'
    and exists (
      select 1 from allowed_emails ae
      where lower(ae.email) = lower(new.email)
    )
  on conflict do nothing;
  return new;
end;
$$;

create trigger trg_link_trip_member
after insert on profiles
for each row execute function public.link_trip_member_on_profile_create();
```

- Why email-match over admin-linking: 5 users, one trip, hard deadline — manual linking is a
  forgotten step waiting to happen. The allowlist makes email-match safe.
- `SECURITY DEFINER` is required because `profiles` insert happens before any RLS-visible membership
  exists; keep the function tight (single INSERT, allowlist-checked). See [04-security-and-privacy.md](04-security-and-privacy.md).
- Roei stays `pending` until the group decision lands — if declined, remove the allowlist row
  (auth revocation is a separate task, see [04-security-and-privacy.md](04-security-and-privacy.md)).
- [ ] Test the full flow with a throwaway allowlisted email + a non-allowlisted email (must be rejected).

## Human import tasks

Seed covers structured data. These need a human and are tracked here until done:

- [ ] Book accommodation (deadline 2026-09-20) → then enter the record in the accommodation page
      (name, address, check-in/out, cost, confirmation ref) — [owner: yakir] — see
      [06-features/03-accommodation.md](06-features/03-accommodation.md).
- [ ] Each member adds their insurance policy details + passport scan — PRIVATE-PER-USER, uploads to
      `trip-documents` only — [owner: each member] — see [06-features/08-medical-safety.md](06-features/08-medical-safety.md).
- [ ] Upload the Arkia e-ticket PDF to `trip-documents` (private) and link it from the flights page
      — [owner: yakir].
- [ ] Verify Arkia arrival times for IZ291/IZ292 + the online check-in window, then update
      `arrival_time` / `arrival_time_verified` — [owner: yakir] (source: arkia.co.il or *5758 — to verify).
- [ ] Verify 100E airport bus price (~2,500 HUF, verify) + BKK ticket prices/fare-block options on bkk.hu
      and record with source + last_verified — [owner: any] — see [06-features/04-transportation.md](06-features/04-transportation.md).
- [ ] Verify Israeli consular contact details in Budapest vs the MFA site; add to emergency contacts
      — [owner: yakir].
- [ ] Roei: get explicit accept/decline; on decline remove allowlist row — [owner: yakir].

## Verification checklist after seeding

Run after every full `migrations + seed` cycle (local or prod):

```bash
# row-count sanity (psql)
psql "$DATABASE_URL" -c "
select 'trips' t, count(*) from trips
union all select 'allowed_emails', count(*) from allowed_emails
union all select 'day_plans', count(*) from day_plans
union all select 'flights', count(*) from flights
union all select 'flight_passengers', count(*) from flight_passengers
union all select 'places', count(*) from places
union all select 'checklists', count(*) from checklists;"
```

Expected counts:

| Table | Expected |
|---|---|
| trips | 1 |
| allowed_emails | 5 |
| day_plans | 5 (2026-10-04 → 2026-10-08, no gaps) |
| flights | 2 (IZ291 out, IZ292 back) |
| flight_passengers | 0 at seed — 8 after the 4 active members sign up (audit C2: trigger-created) |
| places | 17 = 5 anchors (BUD, Deák, 100E ×2, emergency) + 12 idea-bank places |
| checklists | 7 lists from doc 06 (+ item rows; 44 items, audit C7) |

Additional checks:

- [ ] Every flight row: `dep_time` is `timestamptz`, `arr_time_verified = false` until verified.
- [ ] No row contains a full reservation number or full e-ticket serial (grep the seed file
      for the full reservation number and the 9-digit serial prefixes — only masked forms
      like `1385•••93` / `4210•••••06` are allowed).
- [ ] Re-running seed.sql changes zero row counts (idempotency).
- [ ] RLS still denies anonymous reads on every seeded table after seeding
      (see [03-data-model-and-rls.md](03-data-model-and-rls.md) test queries).
