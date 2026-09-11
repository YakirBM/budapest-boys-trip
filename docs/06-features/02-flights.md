---
id: feature-flights
title: Flights — Flight Command Center
status: draft
depends_on: [data-model]
last_updated: 2026-09-11
---

# Flights — Flight Command Center

## Goal

Give the group a **live command center** for the two booked Arkia flights — not a static
info card. At any moment the screen must answer: when do we fly, who finished check-in,
what baggage do we actually have, how do we get to/from each airport, and what is the
next step on the flight-day timeline.

Timezones are a first-class concern: label every time explicitly — ישראל
(`Asia/Jerusalem`, UTC+3) vs הונגריה (`Europe/Budapest`, UTC+2). Budapest = Israel −1h.
Never render a bare time without its tz chip.

Source of truth: the Arkia e-ticket PDF (reservation 13859993, issued 2026-09-10),
uploaded to the private `trip-documents` bucket. Facts below are verified and fixed;
anything dynamic (arrival estimates, add-on prices, check-in windows, transfer prices)
carries `source` + `last_verified_at` and a verify checkbox.

## Verified flight facts (from e-ticket — do not contradict)

| Field | Outbound | Return |
|---|---|---|
| Airline | Arkia Israeli Airlines (IATA `IZ`, airline code 238) | same |
| Flight no. | IZ291 | IZ292 |
| Date | Sun 2026-10-04 | Thu 2026-10-08 |
| Route | TLV Terminal 3 → BUD | BUD → TLV |
| Departure | 16:35 `Asia/Jerusalem` | 10:25 `Europe/Budapest` |
| Duration | ~3.5 h block (est.) — **verify** | ~3.5 h block (est.) — **verify** |
| Arrival | ~19:50 `Europe/Budapest` — est. from ~3.5h block, **verify from Arkia** | ~15:05 `Asia/Jerusalem` — est., **verify from Arkia** |
| Class / status | Y / OK | Y / OK |
| Meal | None | None |
| Reservation | 13859993 — display masked `1385•••93` | same booking |
| Tax | 76.07 USD per passenger | same |

Per-passenger e-ticket serials (store full, mask in UI via `maskReservation()`,
e.g. `4210•••••06`):

| Member | E-ticket serial |
|---|---|
| Yakir | 42103929206 |
| Bar | 42103929184 |
| Aharon | 42103929195 |
| Yehonatan | 42103929173 |

Arkia support (display on flight detail + offline emergency card): arkia.co.il ·
`*5758` from Israel · `+972-3-6903712` — hours Sun–Thu 08:00–22:00, Fri 08:00–13:00
`Asia/Jerusalem`. Note: no Saturday phone support (see Edge cases).

## User stories

- As a member, I see both flights with exact times and tz labels, so I never confuse
  Israel time with Hungary time.
- As a member, I mark my own check-in as done and upload my boarding pass, so the group
  sees 4/4 progress without a WhatsApp poll.
- As Yakir (owner), I see at a glance who has not checked in 12h before departure.
- As a member, I see the baggage rules and which add-ons we bought (and who paid), so
  nobody is surprised at the gate.
- As a member, on flight day I follow a step-by-step timeline with push reminders.
- As a member, I see the transfer plan to TLV T3 and from BUD, with a backup option.
- As a member, the full e-ticket PDF and my boarding pass open offline at the gate.

## Screen layout

### Main flights screen (`/flights`)

```text
┌──────────────────────────────────────────┐
│ ✈ טיסות                          [📄 מסמך]│
│ ┌──────────────────────────────────────┐ │
│ │ 🔥 23 ימים לטיסה · IZ291 · יום א׳ 04.10│ │ ← CountdownStrip (live)
│ └──────────────────────────────────────┘ │
│ ┌─ הלוך · IZ291 ────────────────────────┐│
│ │ תל אביב (טרמינל 3) → בודפשט            ││
│ │ 16:35 🇮🇱 ישראל → ~19:50 🇭🇺 הונגריה*   ││
│ │ סטטוס: [צ'ק-אין פתוח] · צ'ק-אין: 3/4   ││
│ │ [צ'ק-אין בארקיע ↗] [ניהול הזמנה ↗]     ││
│ └────────────────────────────────────────┘│
│ ┌─ חזור · IZ292 ────────────────────────┐│
│ │ בודפשט → תל אביב                       ││
│ │ 10:25 🇭🇺 הונגריה → ~15:05 🇮🇱 ישראל*   ││
│ │ סטטוס: [מתוכננת] · צ'ק-אין: 0/4        ││
│ └────────────────────────────────────────┘│
│ * זמן משוער — מקור: הערכת block time      │
│   ☐ אומת מול ארקיע ב-__.__               │
└──────────────────────────────────────────┘
```

### Flight detail (`/flights/[direction]`, tabbed)

```text
┌──────────────────────────────────────────┐
│ ← IZ291 · יום א׳ 04.10.2026              │
│ [פרטים] [נוסעים 3/4] [כבודה] [ציר זמן]    │
│ [הסעות]                                  │
├──────────────────────────────────────────┤
│ פרטים: מספר הזמנה 1385•••93 · מחלקה Y     │
│ ללא ארוחה · מסוף: TLV טרמינל 3            │
│ 📄 כרטיס אלקטרוני מלא (PDF) — צפייה       │
│ ☎ ארקיע: *5758 · +972-3-6903712          │
├──────────────────────────────────────────┤
│ נוסעים:                                  │
│ ✅ יקיר    מושב —  [כרטיס עלייה ✓]        │
│ ✅ בר      מושב —  [כרטיס עלייה ✓]        │
│ ✅ אהרן    מושב —  [כרטיס עלייה ✓]        │
│ ⬜ יהונתן  מושב —  [העלאת כרטיס]          │
│ התקדמות קבוצה: ▓▓▓░ 3/4                   │
└──────────────────────────────────────────┘
```

## Components

| Component | Purpose | Notes |
|---|---|---|
| `CountdownStrip` | Live countdown to next departure | Computes from stored UTC instants; client-side tick; offline-safe |
| `FlightCard` | One direction summary (route, times + tz chips, status, progress) | Tz chip component `<TzChip zone="Asia/Jerusalem" label="ישראל">` |
| `FlightStatusBadge` | scheduled / check-in open / checked-in / boarding / landed | Hebrew: מתוכננת / צ'ק-אין פתוח / עשינו צ'ק-אין / עלייה למטוס / נחתנו |
| `PassengerChecklistRow` | Seat, boarding-pass upload, check-in toggle per member | Toggle writes own row only (RLS) |
| `GroupCheckinProgress` | `n/4` progress bar | Realtime-updates on any member toggle |
| `BaggageTable` | Allowance + add-ons + who bought what | See rules below |
| `TimelineStepper` | T−24h → T−90m steps with state (done/now/next) | Drives notifications |
| `TransferPlanTable` | Primary + backup transfer per airport leg | See rules below |
| `DocumentLink` | Opens e-ticket PDF / boarding pass via signed URL | Private bucket, 1h TTL (see security doc §6) |
| `ManageBookingLinks` | Deep links to Arkia manage booking / online check-in | URL = verify task; external link icon |

## Data & queries

Tables (canonical schema in [docs/03-data-model-and-rls.md](../03-data-model-and-rls.md)):

- `flights` — 2 rows (`direction: 'outbound' | 'return'`): airline, flight_no, booking_ref
  (full, MEMBERS-ONLY), origin/destination IATA + terminal, `dep_at`/`arr_at` as
  `timestamptz` + `dep_tz`/`arr_tz` text, `arr_estimated: boolean`, class, meal, status enum.
- `flight_passengers` — 4 rows per flight: `flight_id`, `member_id`, `eticket_serial`,
  `seat` (nullable), `checkin_done: bool`, `checkin_done_at`, `boarding_pass_document_id`.
- `documents` + `trip-documents` bucket — the e-ticket PDF (`type: 'eticket'`,
  group-visible) and one boarding pass per member per flight (`type: 'boarding_pass'`,
  group-visible; boarding passes are not sensitive like passports — group visibility is
  intentional for gate coordination).
- `itinerary_items` — auto-generated rows for Day 1 / Day 5 (see Logic).

Typical queries:

```ts
// Flight cards with passenger progress
supabase.from('flights')
  .select('*, flight_passengers(member_id, checkin_done, seat, boarding_pass_document_id)')
  .order('dep_at');

// Mark my check-in (RLS: member can update only own row)
supabase.from('flight_passengers')
  .update({ checkin_done: true, checkin_done_at: new Date().toISOString() })
  .eq('flight_id', flightId).eq('member_id', myMemberId);
```

## Logic & rules

### Status machine

`scheduled → checkin_open → checked_in → boarding → landed`.
- `checkin_open` flips automatically at T−24h **only after** the Arkia online check-in
  window is verified (task below); until then show "צ'ק-אין: טרם אומת חלון הפתיחה".
- `checked_in` flips when `flight_passengers.checkin_done = true` for all 4 members.
- `boarding` / `landed` are set manually (any member can tap) — no live flight API in MVP.

### Masking

- Booking ref renders as `1385•••93`; e-ticket serials as `4210•••••06` (first 4 + last 2).
- Use the shared `maskReservation()` util — never ad-hoc slicing (security doc §5).

### Baggage allowance (Arkia terms printed on the ticket)

| Item | Size / weight | Included | Notes |
|---|---|---|---|
| Handbag (personal item) | ≤40×30×20 cm | ✅ in fare | One per passenger, under the seat |
| Carry-on — combined | ≤8 kg **all cabin items together** | ✅ limit | Arkia weighs the combined allowance — weigh at the apartment, not at the gate |
| Trolley (cabin) | 56×45×25 cm, ≤8 kg | 💳 extra fee | Purchasable add-on |
| Checked bag | ≤20 kg | 💳 extra fee | Purchasable add-on |

Add-on tracking: trolleys and checked bags are bought **per passenger, per direction**.
Store on `flight_passengers` (`addons` jsonb: `{trolley, checked}` + cost + payer) and
render "מי קנה מה" in `BaggageTable` — never display an add-on as group-wide.

### Security note — no Gmail links (rule + UI copy)

Never store Gmail links, OAuth tokens, or URLs with identifying query params. Booking
facts are pasted as data; the evidence is the uploaded PDF. UI copy next to the e-ticket
upload: "אין לשמור קישורים ל-Gmail — מעלים את ה-PDF עצמו, הוא נשמר פרטי ומאובטח."

### Flight-day timeline (template T−24h → T−90m)

Template steps (offsets from departure; instance times computed per flight, tz-aware):

| Step | Offset | IZ291 (`Asia/Jerusalem`) | IZ292 (`Europe/Budapest`) | Action |
|---|---|---|---|---|
| Check-in opens | T−24h | 03.10 16:35 🇮🇱 | 07.10 10:25 🇭🇺 | Push + deep link to Arkia (**verify window**) |
| All-complete reminder | T−12h | 04.10 04:35 🇮🇱 → delay to 07:30 (quiet hours) | 07.10 22:25 🇭🇺 | Push if progress < 4/4 |
| Readiness check | T−4h | 04.10 12:35 🇮🇱 | 08.10 06:25 🇭🇺 | Checklist: passport, money, eSIM, baggage limits |
| Depart to airport | T−3h | 04.10 13:35 🇮🇱 | 08.10 07:25 🇭🇺 | ⚠ See conflict rule below |
| Target arrival at airport | T−2h | 04.10 14:35 🇮🇱 | 08.10 08:25 🇭🇺 | ⚠ See conflict rule below |
| Gate | T−90m | 04.10 15:05 🇮🇱 | 08.10 08:55 🇭🇺 | Push |

Conflict rule (do not paper over): Arkia's terms require airport check-in **≥3h before
departure** — a hard floor of 13:35 🇮🇱 for IZ291 and 07:25 🇭🇺 for IZ292. The Transfer
Plan therefore targets **arrival at T−3h** (13:35 / 07:25), which is stricter than the
generic template's "depart at T−3h / arrive at T−2h". Rule: **the earlier time wins**;
when a Transfer Plan exists it overrides the template step, and the app flags the
template as adjusted. Keep a group decision task to re-confirm.

### Transfer plans (primary + backup per leg)

| Leg | Primary | Backup |
|---|---|---|
| Home → TLV T3 (Day 1) | Train to Ben Gurion Airport station (inside T3) — fare **verify**; each member sets own origin | Shared taxi for 4 — book the day before; cost split via finance |
| BUD → city (Day 1 evening) | 100E Airport Express to Deák Ferenc tér — ~2,500 HUF, dedicated ticket (**verify**); late operation **verify** (arrival ~19:50 + border = ~21:00 downtown) | Bolt/taxi to accommodation, split 4-ways |
| City → BUD (Day 5) | 100E from Deák Ferenc tér — see computed chain below | Taxi/Bolt direct, leave ~06:50 🇭🇺, split 4-ways |

Day 5 computed chain (dep 10:25 🇭🇺, 3h rule → airport by 07:25):

| Milestone | Time (`Europe/Budapest`) | Buffer |
|---|---|---|
| Leave apartment | 06:10 | — |
| 100E departs Deák Ferenc tér | ~06:30 (**verify** first departures/frequency) | ~20 min walk/wait |
| Arrive BUD | ~07:10–07:25 (**verify** ride time ~35–45 min) | ≥3h before dep |
| Flight IZ292 departs | 10:25 | — |

Show all three milestones with live countdown on Day 5; if the 100E slot is missed,
auto-suggest the backup taxi with one tap (deep link, split estimate).

### Auto-generated itinerary items (cross-link [00-today-dashboard.md](00-today-dashboard.md))

On seed, generate `itinerary_items` from the flights (owner can edit):

- Day 1 (04.10): depart-to-airport block · **IZ291 TLV T3 → BUD 16:35 🇮🇱** ·
  landing ~19:50 🇭🇺 (est., verify) · 100E → Deák · apartment check-in ~21:30 🇭🇺 (est.).
- Day 5 (08.10): leave apartment 06:10 🇭🇺 · 100E from Deák ~06:30 · BUD by 07:25 ·
  **IZ292 BUD → TLV 10:25 🇭🇺** · landing ~15:05 🇮🇱 (est., verify).

Each item carries time + tz, address, owner, cost (if known), status, navigation link —
per the zero-ambiguity rule. These appear on Today/Route; flights remain the source.

## Offline & realtime

- Cache `flights`, `flight_passengers`, timeline instances and transfer plans in
  IndexedDB; the whole screen works offline.
- Boarding passes and the e-ticket PDF: prefetch after upload and keep in the offline
  document store — must open at the gate with zero connectivity.
- Countdown and timeline progression compute client-side from stored instants; no
  network needed.
- Realtime channel on `flight_passengers`: check-in toggles and boarding-pass uploads
  update `GroupCheckinProgress` live for everyone.
- Notifications via local scheduling (PWA): timeline steps and the T−12h reminder fire
  offline.

## Edge cases

- **Roei (pending member)** is not on reservation 13859993. If he joins, add him as a
  separate `flight_passengers` source (`booking: 'separate'`) or mark "not flying with
  group" — never mix his booking ref into the masked display.
- **Saturday support gap**: online check-in for IZ291 opens Sat 2026-10-03 ~16:35 — Arkia
  phone support is closed on Saturday. Surface the arkia.co.il self-service link instead.
- **Quiet hours**: T−12h for IZ291 lands at 04:35 — hold the push until 07:30 local.
- **Arrival times are estimates**: always rendered with `*` and the verify checkbox until
  confirmed from Arkia; never used in leave-by math without the buffer.
- **One member misses check-in window**: progress stays < 4/4; timeline reminder escalates
  to the group (owner ping), not just the member.
- **Baggage add-on bought for one member only**: track per-passenger; do not assume the
  whole group has a trolley.
- **Device clock wrong**: countdowns derive from server-synced offset when online; offline
  fall back to device clock and mark times "שעון מקומי".

## Tasks

- [ ] Verify Arkia online check-in window (does it open exactly T−24h?) — source: arkia.co.il; record `last_verified_at`.
- [ ] Verify Arkia manage-booking + web check-in URLs for deep links (no identifying query params).
- [ ] Verify estimated arrivals (~19:50 🇭🇺 / ~15:05 🇮🇱) against Arkia schedule; flip `arr_estimated` to false when confirmed.
- [ ] Verify prices for trolley and checked-bag add-ons (per direction, EUR/USD) — record source.
- [ ] Verify train fare to Ben Gurion + travel times for the Day 1 transfer plan.
- [ ] Verify 100E late-evening operation on Day 1 and first departures on Day 5 morning (cross-link [04-transportation.md](04-transportation.md)).
- [ ] Group decision: resolve the timeline vs 3h-floor conflict (recommend: arrival at T−3h).
- [ ] Upload the e-ticket PDF to `trip-documents` (`type: 'eticket'`) during seed (see docs/09-import-and-seed.md).
- [ ] Implement `maskReservation()` reuse for e-ticket serials; snapshot-test `1385•••93`.
- [ ] Implement status machine + quiet-hours notification scheduler.
- [ ] Generate Day 1 / Day 5 `itinerary_items` from the two flight rows at seed time.

## Acceptance criteria

- [ ] Both flights render with correct verified data and tz chips on every time; no bare times.
- [ ] Arrival estimates always display the estimate marker until verified.
- [ ] Booking ref and serials render masked everywhere; full values never leave Postgres.
- [ ] Each member can toggle only their own check-in row (RLS-tested with two users).
- [ ] Group progress shows live `n/4` and updates via Realtime within ~2s.
- [ ] Boarding pass upload lands in `trip-documents`, private bucket, and opens offline.
- [ ] Timeline shows correct computed times for both directions, flags the 3h-floor conflict, and quiet-hours rule holds.
- [ ] Transfer plans render primary + backup for all three legs; Day 5 chain shows 06:10 / ~06:30 / 07:25 with buffers.
- [ ] Day 1 & Day 5 itinerary items appear in Today/Route and link back to the flight detail.
- [ ] E-ticket PDF is stored in the bucket; the UI shows the "no Gmail links" copy.
- [ ] Entire flights screen + documents open in airplane mode.

## Out of scope

- Live flight-status / delay APIs (manual status in MVP; revisit post-trip if needed).
- Seat selection inside the app (deep link to Arkia).
- Price tracking or rebooking tools.
- Roei's separate booking management beyond the passenger-row note above.
