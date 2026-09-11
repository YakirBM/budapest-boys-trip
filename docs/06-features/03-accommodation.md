---
id: feature-accommodation
title: Accommodation — Booking Mission & Home Base
status: draft
depends_on: [data-model]
last_updated: 2026-09-11
---

# Accommodation — Booking Mission & Home Base

## Goal

Two modes, one screen:

1. **Pre-booking (current state)**: drive the group to book a place **by 2026-09-20** —
   a mission card with deadline countdown, agreed requirements, and a candidate
   comparison table that converts to a poll.
2. **Post-booking**: turn the booked apartment into the trip's *base of operations* —
   address, access codes, Wi-Fi, host contact, nearby anchors, arrival/departure
   checklists, and issue reporting. Everything must work offline the moment we land.

Status today (2026-09-11): **NOT booked** — this is the trip's critical open task.
Days remaining are computed at render, never hardcoded.

## User stories

- As a member, I see a loud banner that we have no accommodation yet, with the deadline
  and who owns the task.
- As a member, I add candidate apartments with price per person/night auto-computed in
  HUF and ILS, so comparing is fair.
- As a member, I send the shortlist to a group poll instead of a WhatsApp flood.
- As the owner, once booked I record address, codes, host contact and house rules so
  nobody needs to dig through email.
- As a member, on arrival night (~21:00+) I open the app offline and see the door code,
  floor, intercom label and entrance photos.
- As a member, I report an issue (photo + urgency) and flag whether it was sent to the host.
- As a member, on Day 5 I get a check-out checklist so we don't lose the deposit.

## Screen layout

### Mode A — not booked (`/accommodation`)

```text
┌──────────────────────────────────────────┐
│ 🏨 לינה                                   │
│ ┌──────────────────────────────────────┐ │
│ │ ⚠️ עוד לא סגרנו לינה!                 │ │
│ │ דדליין: 20.09.2026 · נשארו {n} ימים   │ │
│ │ אחראי: [שבץ אחראי ▾]  [☐ שויבצתי]    │ │
│ └──────────────────────────────────────┘ │
│ דרישות שהוסכמו: 4–6 מיטות · רובע V/VI/VII │
│ ≤25 דק׳ הליכה לדיאק · ויי-פיי · חימום    │
│ ┌─ מועמדים (3) ────────────[+ הוסף] ───┐│
│ │ שם        רובע  מיטות  ₪/לילה/א׳  ★   ││
│ │ דירת אנדראשי  VI   5     52*    4.7   ││
│ │ ...                              │    ││
│ │ [📊 הפוך להצבעה]                       ││
│ └────────────────────────────────────────┘│
│ * המרה משוערת לפי שער מ-__.__ · ☐ אומת     │
└──────────────────────────────────────────┘
```

### Mode B — booked

```text
┌──────────────────────────────────────────┐
│ 🏨 הבית שלנו בבודפשט           [✏️ עריכה] │
│ דירת אנדראשי · רובע VI                    │
│ Andrássy út 12, Budapest     [📋 העתק] [🧭]│
│ צ'ק-אין: 04.10 15:00 🇭🇺 · צ'ק-אאוט: 08.10 10:00 🇭🇺 │
│ קוד דלת: •••• [הצג] · קומה 2 · דירה 5     │
│ ויי-פיי: BUD-Apt [📋] · סיסמה [📋] [QR]    │
│ מארח: לשי · +36… [חיוג] [וואטסאפ]          │
│ ┌─ הגעה (4.10) ────┐ ┌─ עזיבה (8.10) ──┐ │
│ │ ☑ מיטות  ☑ מפתחות │ │ ☐ ניקיון  ☐ זבל │ │
│ │ ☐ ויי-פיי עובד    │ │ ☐ מפתחות הוחזרו │ │
│ └───────────────────┘ └─────────────────┘ │
│ [⚠️ דווח על בעיה]                          │
└──────────────────────────────────────────┘
```

## Components

| Component | Purpose | Notes |
|---|---|---|
| `BookingMissionBanner` | Deadline countdown, owner assign, status | Red/amber until `status = 'booked'` |
| `RequirementsList` | Agreed criteria with checkmarks per candidate | Static agreed text + per-candidate fit |
| `CandidateTable` | Comparison of candidates (below) | Sortable by price-per-person |
| `CandidateForm` | Add/edit candidate | Platform link allowed (Booking/Airbnb), no Gmail links |
| `BookedDashboard` | Full post-booking view | All fields below |
| `CopyChip` | One-tap copy (address, codes, Wi-Fi) | Haptic feedback |
| `WifiQrCard` | Wi-Fi QR (`WIFI:S:...;T:WPA;P:...;;`) | Generated client-side, offline |
| `HouseRulesCard` | Host house-rules file + text summary | From `trip-documents`; offline-cached |
| `HostContactCard` | Host name/phone/WhatsApp/email deep links | `tel:`, `wa.me` |
| `AccessInfoCard` | Door code (masked until tap), lockbox, key-pickup instructions, floor, intercom, entrance photos | Photos in `trip-documents`, group-visible |
| `NearbyAnchorsList` | Metro/tram stop, supermarket, pharmacy, ATM, coffee | Each place = verify task |
| `StayChecklist` | Arrival + departure checklists | Stored in checklist tables (cross-link 06-checklists) |
| `IssueReportSheet` | Text + photo + urgency + "sent to host" flag | Upload via media pipeline |
| `AccommodationReminders` | Check-in in 4h · check-out tomorrow 10:00 · key return unmarked | Local notifications |

## Data & queries

Tables (canonical schema in [docs/03-data-model-and-rls.md](../03-data-model-and-rls.md)):

- `accommodations` — one row per candidate AND the booked place; `status` enum:
  `candidate | favorite | booked | rejected`. Columns: name, url, platform, district,
  beds, price_total, currency, cleaning_fee, deposit, cancellation, rating,
  distance_to_deak_min, self_checkin, notes, plus booked-only fields (address,
  checkin_at/checkout_at `timestamptz` + tz, host_name/phone/whatsapp/email, door_code,
  lockbox, floor, apartment, intercom, late_checkin_notes, wifi_ssid, wifi_password,
  tourist_tax_pct + `tourist_tax_verified_at`, paid_by, split_status).
- `reservations` — booking_ref (masked in UI), platform, booked_at, raw confirmation
  facts. Never store Gmail links — upload the confirmation PDF
  (`type: 'accommodation_confirmation'`) and the host's house-rules file
  (`type: 'house_rules'`) to `trip-documents` (group-visible) instead.
- `itinerary_items` — check-in block (Day 1 ~21:30 🇭🇺 est.) and check-out block
  (Day 5 morning) generated once booked.
- Polls: candidate set converts to a poll (cross-link [09-polls.md](09-decisions-and-polls.md)).

```ts
// Active candidates with computed per-person-per-night
supabase.from('accommodations')
  .select('*').in('status', ['candidate', 'favorite']).order('district');

// Promote to booked (owner/manager only per RLS)
supabase.from('accommodations')
  .update({ status: 'booked', ...bookedFields }).eq('id', id);
```

## Logic & rules

### Booking mission

- Deadline **2026-09-20**. Banner shows `{n}` days remaining, computed at render
  (`deadline − today`), red when `n ≤ 3`.
- Owner assignment is an explicit checkbox flow: "שבץ אחראי" → member pick →
  confirmation; store `mission_owner_id` on the trip or a task row. Unassigned = banner
  stays amber and pings the group once a day after 18:00 (quiet-hours aware).
- Budget target: **~€40–60 per person per night** (group decision task, tagged
  estimate). For 4 nights × 4–5 people → total envelope ≈ €640–1,200; display as a
  range, never a single number.

### Agreed requirements (the filter bar)

| # | Requirement | Verify |
|---|---|---|
| 1 | 4–6 real beds (no "sofa counts as bed" unless group agrees) | per candidate |
| 2 | District V, VI or VII | ☐ verify safety/walkability notes |
| 3 | ≤25 min walk **or** ≤15 min transit to Deák Ferenc tér | measure per candidate |
| 4 | Wi-Fi | per candidate |
| 5 | Heating (October nights drop to ~7–10°C) | per candidate |
| 6 | Self check-in strongly preferred — Day 1 arrival is ~21:00+ | per candidate |
| 7 | Washing machine — nice-to-have | per candidate |

### Candidate comparison table (template)

| Field | Notes |
|---|---|
| name / link / platform | Airbnb, Booking, Szallas… link allowed; no Gmail links |
| district | V / VI / VII / other (other = flag) |
| beds | real beds count |
| price total + currency | as listed |
| per-person/night | auto: `(total + cleaning) / nights(4) / members(4)`; show HUF + ILS using the FX table with `last_verified_at` and "משוער" marker (cross-link [05-finance.md](05-finance.md)) |
| cleaning fee / deposit | separate columns — deposits distort totals |
| cancellation policy | free-until date |
| rating + reviews count | as listed |
| distance to Deák | minutes walk/transit |
| self check-in | yes/no |
| notes / status | `candidate → favorite → booked | rejected` |

Action: "הפוך להצבעה" creates a poll from all `favorite` rows (cross-link 09-polls).

### Once booked

- Mask the booking ref in UI (shared `maskReservation()` util).
- Prices: total + per-person + deposit + cleaning + **Budapest tourist tax** — verify
  current rate/base (task); show `tourist_tax_pct` with source + `last_verified_at`.
- `paid_by` + `split_status` feed the finance ledger (cross-link 05-finance).
- Access section: door code masked until tap (log nothing), lockbox location, floor /
  apartment / intercom label, entrance + door photos (offline-cached), late check-in
  instructions for the ~21:00+ arrival.
- Wi-Fi: SSID + password with copy chips + generated QR.
- House rules: upload the host's file (PDF/photos) to `trip-documents`
  (`type: 'house_rules'`) with a short text summary on the dashboard; offline-cached.

### Base of operations (per booked place)

- Nearest metro/tram stop + walk minutes; walk time to Deák Ferenc tér.
- Route to airport: nearest **100E** stop (Deák is the downtown terminus) — cross-link
  [04-transportation.md](04-transportation.md).
- Nearby places (each = a verify task, stored as places with source + last_verified):
  supermarket, pharmacy, ATM, coffee, outdoor meeting point ("if we split up, meet here").
- Luggage storage on Day 5: departure is 10:25 with a 06:10 apartment exit, so storage
  is **likely unnecessary** — show the note, offer an add-place link anyway.

### Checklists

- **Arrival (Day 1)**: cleanliness OK · beds match listing · keys/codes work ·
  Wi-Fi connects · heating works · meter/photo of existing damage (deposit protection).
- **Departure (Day 5)**: tidy up · trash out · dishes · keys returned per instructions ·
  room sweep (chargers, passports!) · charge devices for the flight.

### Reminders (local notifications)

- Check-in in 4h (Day 1 ~11:00 🇮🇱 before flight) with access info deep link.
- "צ'ק-אאוט מחר 10:00" on Day 4 evening (21:00 🇭🇺).
- Day 5, if departure checklist "keys returned" unmarked by 06:00 🇭🇺 → nag the group.

## Offline & realtime

- After booking, the entire dashboard (address, codes, photos, Wi-Fi, anchors,
  checklists) syncs to IndexedDB and works fully offline — critical for arrival night.
- Entrance photos prefetch to the offline document store.
- Realtime on `accommodations`: candidate adds/edits and the `booked` flip update all
  members instantly; the banner dismisses itself on `status = 'booked'`.
- Checklist state syncs realtime; offline marks queue in the background-sync outbox.

## Edge cases

- **Deadline passes with nothing booked**: banner goes red, escalates a push to all
  members, and pins a "emergency booking call" task to the owner.
- **Late arrival vs check-in window**: if listing check-in ends before our ~21:30
  arrival and there's no self check-in → flag the candidate red before booking.
- **Roei joins late**: recompute per-person prices for 5 (members count is a setting,
  not hardcoded); bed requirement scales to 5–6.
- **Deposit held in cash**: mark `deposit` currency + "cash on arrival" so the finance
  screen plans the ATM stop.
- **Host communicates only via platform chat**: record that fact; don't paste platform
  message links — paste facts, upload screenshots as documents if needed.
- **Two apartments needed** (no 5–6 bed fit): allow two `booked` rows; the dashboard
  shows both with a per-person assignment list. Not the happy path — keep UI simple.
- **Door code changes before arrival**: editable field; update bumps `updated_at` and
  re-pushes to offline cache.

## Tasks

- [ ] Group decision: confirm budget envelope ~€40–60/person/night (estimate) and bed policy for Roei.
- [ ] Assign mission owner via the banner flow.
- [ ] Verify safety/walkability notes for districts V, VI, VII — record source.
- [ ] Verify Budapest tourist tax rate/base (city tax) — record `last_verified_at`.
- [ ] Verify October night temperature norms (~7–10°C) — record source.
- [ ] Seed nearby-anchor verify tasks once a place is booked (supermarket, pharmacy, ATM, coffee, meeting point).
- [ ] Build `accommodations` + `reservations` migrations with RLS (owner/manager write; all members read).
- [ ] Build candidate → poll conversion (cross-link 09-polls).
- [ ] Build Wi-Fi QR generator + copy chips.
- [ ] After booking: upload the house-rules file (`type: 'house_rules'`) and link it on the dashboard.
- [ ] Implement arrival/departure checklist templates (seed; cross-link 06-checklists).
- [ ] Implement the three reminder rules with quiet-hours handling.
- [ ] On `status → booked`: generate Day 1 check-in + Day 5 check-out `itinerary_items`.

## Acceptance criteria

- [ ] Banner shows deadline 2026-09-20 with live days-remaining and owner assignment; never hardcodes the count.
- [ ] Candidate table computes per-person/night in HUF + ILS with the estimate marker and FX `last_verified_at`.
- [ ] Candidates convert to a poll in one tap.
- [ ] Booked view shows every field in "Once booked" incl. masked ref, host contacts, access info, Wi-Fi QR.
- [ ] Tourist tax and any price/rate show source + last-verified or a verify checkbox — no naked numbers.
- [ ] Arrival + departure checklists exist, are completable per member, and drive the reminders.
- [ ] Issue report: text + photo + urgency + sent-to-host flag; photo lands in private storage.
- [ ] Full dashboard (incl. entrance photos and door code) works in airplane mode.
- [ ] Booking flip propagates to all members via Realtime and generates the itinerary items.
- [ ] RLS: only owner/manager can mark booked or edit access details; all members read.

## Out of scope

- Booking through the app (we deep-link to platforms; we don't transact).
- Price alerts / availability tracking.
- Multi-apartment split logistics beyond the basic two-row support.
- Host messaging inside the app.
