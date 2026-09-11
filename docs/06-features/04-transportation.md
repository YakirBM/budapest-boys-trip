---
id: feature-transportation
title: Transportation — Trip Mobility Hub
status: draft
depends_on: [data-model]
last_updated: 2026-09-11
---

# Transportation — Trip Mobility Hub

## Goal

A **trip mobility hub**, not a generic Budapest transit guide. It answers one question
instantly — **"איך מגיעים עכשיו ליעד הבא?"** — using the group's own context: where we
are, where the itinerary says we're going next, our tickets, our anchor stations, and
our constraints (night, rain, tired, airport run). Every price and schedule carries
`source` + `last_verified_at` and a verify checkbox; nothing dynamic is stated as fact.

Context: BKK runs Budapest transit; **BudapestGO** is the official app. **Deák Ferenc
tér** is our central anchor (M1/M2/M3 interchange + 100E downtown terminus). The 100E
Airport Express needs a **dedicated ticket** (~2,500 HUF — verify); regular tickets and
passes are invalid on it. Ticket validation is enforced by inspectors; fines apply
(amount = verify).

## User stories

- As a member, I tap one card and get walking / transit / taxi options **to our next
  itinerary item**, with time and estimated cost.
- As a member, I see the group's preferred route (what we actually decided), not just
  the algorithm's fastest.
- As a member, I compare ticket options with a calculator based on how many rides I
  expect per day — the app doesn't pre-decide "best value" for me.
- As a member, I can't miss the 100E warning: regular tickets don't work on it.
- As a member, I know exactly when and where to validate a ticket, and what inspectors
  look for.
- As a member, at 23:40 I open Night mode and get a safe route home or a Bolt split
  4-ways.
- As a member, I get "צריך לצאת בעוד 12 דקות" before every itinerary item with a
  `leave_by`.
- As the owner, I pin anchor stations and favorite lines once; everyone gets them
  offline.

## Screen layout

### Hub (`/transport`)

```text
┌──────────────────────────────────────────┐
│ 🚇 תחבורה                                │
│ ┌──────────────────────────────────────┐ │
│ │ איך מגיעים עכשיו ליעד הבא?            │ │
│ │ מ: [📍 המיקום שלי        ▾]           │ │
│ │ ל: [🎯 היעד הבא: ארמון הפרלמנט 18:00 ▾]│ │
│ │ ┌────────┬────────┬────────┐          │ │
│ │ │ 🚶 22׳ │ 🚋 14׳  │ 🚕 9׳  │          │ │
│ │ │ חינם   │ כרטיס   │ ~xxxx* │          │ │
│ │ └────────┴────────┴────────┘          │ │
│ │ ⭐ מסלול מועדף: טראם 2 לאורך הדנובה    │ │
│ │ [BudapestGO ↗]  [Google Maps ↗]        │ │
│ └──────────────────────────────────────┘ │
│ ┌─ ⚠️ 100E — כרטיס נפרד! ──────────────┐ │
│ │ כרטיס רגיל לא תקף · ~2,500 HUF* · ☐ אומת│
│ └──────────────────────────────────────┘ │
│ [כרטיסים ומחשבון] [תחנות עוגן] [מצבים:]   │
│ [🌙 לילה] [🌧 גשם] [😴 עייף] [🛫 שדה]      │
└──────────────────────────────────────────┘
```

### Tickets & calculator

```text
┌──────────────────────────────────────────┐
│ כרטיסים · מקור: bkk.hu · ☐ אומת ב-__.__   │
│ נסיעות צפויות ביום: [ − 4 + ]             │
│ ┌────────────────┬────────┬────────────┐ │
│ │ כרטיס          │ מחיר*  │ ל-4 נסיעות │ │
│ │ בודד           │  — ☐   │  —         │ │
│ │ בלוק 10        │  — ☐   │  —         │ │
│ │ 24 שעות        │  — ☐   │  —         │ │
│ │ 72 שעות        │  — ☐   │  —         │ │
│ │ קבוצתי 24 שעות │  — ☐   │  —         │ │
│ │ 100E (נפרד)    │ ~2,500 │ תמיד נפרד  │ │
│ └────────────────┴────────┴────────────┘ │
│ * HUF, משוער עד לאימות                    │
└──────────────────────────────────────────┘
```

## Components

| Component | Purpose | Notes |
|---|---|---|
| `NextDestinationCard` | The opener: origin/destination pickers + mode results | Destination defaults to next itinerary item with a time today |
| `ModeResultChips` | walk / transit / taxi-Bolt: time + est. cost + deep link | Cost = estimate with marker; transit shows line badges |
| `PreferredRouteBadge` | "מסלול מועדף של הקבוצה" | Set by any member; stored, synced |
| `BudapestGoLink` / `MapsTransitLink` | Deep links: BudapestGO app; Google Maps `dirflg=transit` | See docs/08-integrations-and-apis.md |
| `TicketTable` | All ticket types, prices HUF, validity, notes | Every price: source bkk.hu + `last_verified_at` + verify checkbox |
| `TransitCalculator` | Input: expected rides/day → live comparison column | Pure client math; no "best value" label, just numbers |
| `Airport100ECard` | Prominent permanent warning card | Dismissible only after verify; reappears on Days 1 & 5 |
| `ValidationExplainer` | When/where to validate, QR for digital tickets, inspectors + fines | Fine amount = verify checkbox |
| `AnchorStationGrid` | Offline cards for anchor stations (below) | Also plotted on the map layer |
| `ModeSwitcher` | Night / Rain / Tired / Airport modes | Each mode re-ranks the mode results |
| `LeaveByNotifier` | "צריך לצאת בעוד {n} דקות" | From `itinerary_items.leave_by`; local notifications |
| `FavoriteLinesList` | Pinned lines (e.g. tram 2, M2) with quick status link | Group-shared, editable |
| `TaxiRulesCard` | App-only taxis (Bolt/Freenow), agree price upfront, never unmarked | Static safety copy, Hebrew |

## Data & queries

Tables (canonical schema in [docs/03-data-model-and-rls.md](../03-data-model-and-rls.md);
transit uses a small set of trip-scoped tables):

- `transit_tickets` — one row per ticket type: name_he, name_en, price_huf (nullable
  until verified), validity_text, notes, `source` (default `bkk.hu`),
  `last_verified_at`, `verified: bool`.
- `transit_anchor_stations` — name_he/en, lines (array), role enum
  (`central | accommodation | airport_100e | night_meeting`), lat/lng, notes; feeds the
  map layer and offline cards.
- `transit_favorite_lines` — line code, type (metro/tram/bus/night), note.
- `preferred_routes` — origin place, destination place, chosen mode + free text
  ("טראם 2 לאורך הדנובה"), set_by.
- `itinerary_items.leave_by` — computed or manual; drives departure alerts.
- `places` — supermarkets/pharmacies etc. from the accommodation doc double as
  origin/destination pick options.

```ts
// The opener's default destination: next timed item today
supabase.from('itinerary_items')
  .select('id, title, starts_at, leave_by, place_id, places(name, lat, lng)')
  .gte('starts_at', startOfToday).order('starts_at').limit(1);

// Calculator inputs
supabase.from('transit_tickets').select('*').order('price_huf');
```

## Logic & rules

### Next-destination resolution

1. Origin default: current location (geolocation) → fallback: accommodation → fallback:
   last meeting point.
2. Destination default: the next itinerary item that has a time today/tomorrow; else a
   free search box over `places` + free text (resolved via Google Maps link-out).
3. Result modes: **walk** (time, free), **tram/metro/bus** (time, line badges, "uses a
   valid ticket"), **taxi/Bolt** (time + estimate range, deep link). All costs are
   estimates with the marker until verified.
4. If a `preferred_routes` row matches origin→destination, pin it on top with ⭐ —
   group decision beats algorithm.

### Tickets & calculator (no pre-declared "best value")

| Ticket | Price (HUF) | Validity | Notes |
|---|---|---|---|
| Single | — ☐ verify | 1 ride, one direction | validate immediately |
| Block of 10 | — ☐ verify | 10 singles | shareable in the group |
| 24h pass | — ☐ verify | 24h from chosen start | no validation per ride |
| 72h pass | — ☐ verify | 72h | covers most of the trip |
| Group 24h | — ☐ verify | up to 5 people together | we are 4(+1) — interesting |
| 100E airport | ~2,500 ☐ verify | 100E line only | **regular tickets invalid** |

Calculator: input = expected rides/day (default 4). For each option show
`cost_for_trip = f(rides_per_day, trip_days=4 effective transit days)`; leave formulas
visible on tap. Until prices are verified, the column shows "—" and the whole table
carries the verify banner. Source column always links bkk.hu.

### 100E warning card (always prominent)

- Dedicated ticket required; regular tickets/passes **invalid** on 100E.
- Price ~2,500 HUF (source: bkk.hu, verify checkbox).
- Where to buy: BudapestGO app (recommended — offline QR after purchase) or airport/
  Deák machines.
- Possible pass-holder discounts per BKK 2025–2026 announcements — link out, verify
  before relying on it.
- Card auto-pins on Day 1 (arrival) and Day 5 (departure).

### Validation explainer

- **Metro**: validate at the orange/red machines **before** the gates.
- **Bus/tram**: validate **on board** immediately after boarding.
- **Digital (BudapestGO)**: scan the QR at the gate/on board; keep the phone charged —
  a dead phone = no ticket.
- **Inspectors**: plain-clothes checks happen; fine amount = ☐ verify (bkk.hu).
- Task: add annotated screenshots of a validated paper ticket and a scanned QR.

### Anchor stations (תחנות עוגן)

| Role | Station | Why |
|---|---|---|
| Central | **Deák Ferenc tér** | M1/M2/M3 interchange + 100E downtown terminus; default regroup point |
| Accommodation | TBD after booking (task) | Nearest stop; drives "route home" in Night mode |
| Airport | 100E stop at BUD (arrivals curb) | First/last transit touchpoint |
| Night meeting | Central well-lit outdoor point near Deák (task: pick exact spot) | "If we split up at night, meet here" |

All four render as offline cards (name, lines, map pin, walk times) and on the map layer.

### Modes

- **🌙 Night mode**: route home from the evening point. Night buses are 9xx-series
  (verify which lines serve our district after booking). Fallback: Bolt split 4-ways
  with estimate. Show the night meeting point prominently.
- **🌧 Rain mode**: re-rank to minimize walking legs; prefer covered interchanges via
  Deák.
- **😴 Tired mode**: show taxi-vs-transit side by side with per-person split ("~xxx
  HUF לאדם" — estimate, verify) so the lazy option is an informed one.
- **🛫 Airport mode**: next departure (from flights doc), recommended leave time
  (Day 5 chain: apt 06:10 → 100E ~06:30 → BUD 07:25), and "if you missed the 100E"
  backup taxi flow. Cross-link [02-flights.md](02-flights.md) transfer plans.

### Departure alerts

For every itinerary item with `leave_by`: local notification at `leave_by − 0`,
`−10 min`, `−30 min` with copy "צריך לצאת בעוד {n} דקות" + deep link to the route.
Respect quiet hours except flight days.

### Taxi rules (static safety card)

Apps only — Bolt or Freenow. Agree/see the price upfront in the app. Never take
unmarked taxis, especially at the airport and nightlife areas. Split in-app or log to
finance (cross-link [05-finance.md](05-finance.md)).

## Offline & realtime

- Cache in IndexedDB: ticket table, anchor stations, favorite lines, preferred routes,
  today's itinerary items with `leave_by`, and the validation explainer. The hub opens
  fully offline; only live route planning needs network (Maps/BudapestGO deep links).
- After purchasing a BudapestGO 100E ticket, screenshot/save the QR into the offline
  document store (belt-and-braces alongside the app).
- Realtime on `preferred_routes`, `transit_favorite_lines`, `transit_anchor_stations`:
  one member pins → everyone's hub updates.
- Leave-by alerts are local notifications — fire offline, tz-aware (`Europe/Budapest`
  during the trip).

## Edge cases

- **Prices unverified at launch**: table renders with "—" + verify checkboxes; the
  calculator shows formulas but no totals. Never ship guessed numbers as facts.
- **No geolocation permission**: origin picker falls back to accommodation/meeting
  point without nagging; one inline prompt max.
- **100E not running / missed** (Day 5 06:30): Airport mode immediately offers the taxi
  backup with the 07:25 deadline countdown.
- **Night buses unknown for the booked district**: Night mode shows the verified 9xx
  note as "טרם אומת" and leads with Bolt until the post-booking verify task completes.
- **Phone dies after buying a digital ticket**: explainer says screenshot the QR; group
  rule: at least 2 members buy the 100E for the group via app, rest via machines.
- **Group splits up**: preferred route is per origin→destination, not group-lockstep;
  the night meeting point card stays reachable from every mode.
- **Roei joins**: group 24h pass covers up to 5 — the calculator's group row stays valid.

## Tasks

- [ ] Verify all BKK ticket prices (single, block of 10, 24h, 72h, group 24h, 100E) — source: bkk.hu; record `last_verified_at`.
- [ ] Verify 100E price (~2,500 HUF), purchase channels, and any 2025–2026 pass-holder discounts — link + date.
- [ ] Verify fine amount for riding without a validated ticket — source: bkk.hu.
- [ ] Verify which 9xx night lines serve our district — after accommodation is booked.
- [ ] Pick the exact night meeting point near Deák (well-lit, outdoor) — group decision.
- [ ] After booking: set the accommodation anchor station + walk minutes to Deák.
- [ ] Add validation screenshots (validated paper ticket, scanned QR) to the explainer.
- [ ] Verify BudapestGO deep-link scheme and Google Maps transit URL params (docs/08).
- [ ] Implement `leave_by` computation on itinerary items (travel estimate + buffer) and the 3-stage notifier.
- [ ] Seed `transit_tickets` rows with `verified = false` and the Deák anchor station.

## Acceptance criteria

- [ ] The opener card resolves origin/destination automatically and shows walk/transit/taxi with estimates marked as estimates.
- [ ] A pinned preferred route outranks the default result and syncs to all members via Realtime.
- [ ] Ticket table never shows an unverified price as fact; every row has source + verify state.
- [ ] Calculator updates the comparison live when rides/day changes; no "best value" label anywhere.
- [ ] 100E warning card is prominent, unpinnable-before-verify, and resurfaces on Days 1 and 5.
- [ ] Validation explainer covers metro-gates vs on-board vs digital QR, with inspectors/fine (verify).
- [ ] All four anchor stations render offline as cards and on the map layer.
- [ ] All four modes re-rank options; Airport mode shows the 06:10 → 06:30 → 07:25 chain and the taxi backup.
- [ ] "צריך לצאת בעוד {n} דקות" fires at −30/−10/0 for items with `leave_by`, tz-aware, and works offline.
- [ ] Favorite lines list is group-shared and editable.
- [ ] Taxi rules card renders statically with Bolt/Freenow links.
- [ ] Hub fully opens in airplane mode (deep links may fail — everything else works).

## Out of scope

- Live vehicle positions / real-time arrivals inside the app (BudapestGO deep link covers it).
- In-app ticket purchase (BudapestGO or machines only).
- Route planning engine of our own (Maps/BudapestGO link-out).
- Bike/scooter sharing (MOL Bubi etc.) — can be added as a mode later.
