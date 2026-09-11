---
id: requirements-constraints
title: Requirements & Constraints
status: draft
depends_on: [project-overview]
last_updated: 2026-09-11
---

# 01 — Requirements & Constraints

> Source of truth for *what* must be built and *what limits* the build. Feature-level detail lives in [06-features/](./06-features/00-today-dashboard.md); definition of done lives in [11 — Acceptance criteria](./11-acceptance-criteria.md). IDs are stable — reference them from code, tests and roadmap tasks.

## Functional requirements

### Today dashboard (FR-TDY) — see [spec](./06-features/00-today-dashboard.md)

| ID | Requirement |
|---|---|
| FR-TDY-01 | Show the current trip day's DayPlan (Day 1 = 2026-10-04 … Day 5 = 2026-10-08) with the now/next item highlighted, computed from device time. |
| FR-TDY-02 | Display a dual clock — `Asia/Jerusalem` and `Europe/Budapest` — on every trip day. |
| FR-TDY-03 | Offer one-tap navigation (maps deep link) and one-tap group status ("on my way" / "running late") from the next item. |
| FR-TDY-04 | Show Budapest weather per trip day, tagged with `source` + `last_verified_at`; stale data shows a badge. |
| FR-TDY-05 | Pin unresolved blockers (e.g. accommodation unbooked, overdue checklist items) at the top until resolved. |
| FR-TDY-06 | Render fully from local cache when offline (depends on FR-OFF-01). |

### Flights (FR-FLT) — see [spec](./06-features/02-flights.md)

| ID | Requirement |
|---|---|
| FR-FLT-01 | Display both booked flights — IZ291 (2026-10-04, TLV T3 → BUD, dep 16:35 IL) and IZ292 (2026-10-08, BUD → TLV, dep 10:25 HU) — with reservation 13859993, each time labeled with its timezone. |
| FR-FLT-02 | Show a countdown to each departure and a computed "leave for the airport" time honoring the ≥ 3h check-in rule, in the correct local time. |
| FR-FLT-03 | Tag arrival times "verify from Arkia" (absent from the e-ticket); the verify action records `source` + `last_verified_at`. |
| FR-FLT-04 | Deep-link to Arkia manage-booking and flight-status pages. |
| FR-FLT-05 | Store the e-ticket PDF in a private bucket; render only via signed URLs. |

### Accommodation (FR-ACC) — see [spec](./06-features/03-accommodation.md)

| ID | Requirement |
|---|---|
| FR-ACC-01 | Track status `searching → options → booked`; surface the 2026-09-20 deadline as a blocker until booked. |
| FR-ACC-02 | Compare candidates: price per night + currency, address, nearest anchor station, sleeps 4–6, link — every price tagged with `source` + `last_verified_at`. |
| FR-ACC-03 | When booked: store address, check-in/out times, host contact and booking reference; make it the default navigation target and home pin on the map. |
| FR-ACC-04 | Launch a decision poll directly from the candidate list (integrates FR-POL-01). |

### Route & places (FR-RTE) — see [spec](./06-features/01-route-and-places.md)

| ID | Requirement |
|---|---|
| FR-RTE-01 | CRUD itinerary items per day (Day 1–5) with time+tz, place, address, owner, estimated cost, status and notes. |
| FR-RTE-02 | CRUD a places library (saved but not necessarily scheduled) with category, address and map link. |
| FR-RTE-03 | One-tap navigation from any item via Google Maps / BudapestGO deep links. |
| FR-RTE-04 | Reorder items within a day; persist the order per trip day. |
| FR-RTE-05 | Mark items done/skipped; show per-day completion. |

### Transport hub (FR-TRN) — see [spec](./06-features/04-transportation.md)

| ID | Requirement |
|---|---|
| FR-TRN-01 | List airport ↔ city transfer options (100E bus, taxi, shuttle) with price/duration as tagged estimates, each with a verify checkbox. |
| FR-TRN-02 | Deep-link to BudapestGO / BKK for live routes and ticket purchase. |
| FR-TRN-03 | Store the accommodation anchor station; show walking/transit directions from it to each day's items. |
| FR-TRN-04 | Keep key routes and Hungarian address cards (for taxi drivers) available offline. |

### Finance (FR-FIN) — see [spec](./06-features/05-finance.md)

| ID | Requirement |
|---|---|
| FR-FIN-01 | Log a shared expense in ≤ 15 s: amount, currency (HUF/ILS/EUR/USD), payer, participants, category, optional receipt photo. |
| FR-FIN-02 | Equal split by default; support custom shares and excluded participants. |
| FR-FIN-03 | Show per-member running balances and a minimal-transfer settlement plan. |
| FR-FIN-04 | Keep personal (non-shared) expenses in a separate ledger; never mix them into settlement. |
| FR-FIN-05 | Show FX rates against HUF tagged with `source` + `last_verified_at`; allow a manual rate override per expense. |
| FR-FIN-06 | Mark settlement transfers as paid; track progress toward the ≤ 7-day post-trip target. |
| FR-FIN-07 | Export all expenses to CSV. |

### Checklists (FR-CHK) — see [spec](./06-features/06-checklists.md)

| ID | Requirement |
|---|---|
| FR-CHK-01 | Seed three checklists — personal packing, shared group gear, pre-flight tasks — from templates (see [import & seed](./09-import-and-seed.md)). |
| FR-CHK-02 | Track completion per member; show group progress in %. |
| FR-CHK-03 | Flag overdue items (accommodation deadline 2026-09-20, passport-validity check, travel insurance) on the Today page. |

### Media wall (FR-MDA) — see [spec](./06-features/07-media-wall.md)

| ID | Requirement |
|---|---|
| FR-MDA-01 | Upload photos/videos to private buckets only; render via signed URLs. |
| FR-MDA-02 | Compress/resize on upload to respect the 1 GB free-tier storage budget. |
| FR-MDA-03 | Group the wall by trip day; uploader deletes own items; owner moderates. |

### Medical & safety (FR-MED) — see [spec](./06-features/08-medical-safety.md)

| ID | Requirement |
|---|---|
| FR-MED-01 | Show emergency numbers (EU 112, Hungarian medical lines) and embassy/consulate contacts offline; embassy data carries a "verify vs MFA near travel date" checkbox. |
| FR-MED-02 | Store opt-in, per-member private medical info (allergies, medications, insurance policy number) visible only to that member via RLS. |
| FR-MED-03 | Keep nearest hospital/pharmacy places with offline-cached addresses and navigation links. |

### Polls (FR-POL) — see [spec](./06-features/09-decisions-and-polls.md)

| ID | Requirement |
|---|---|
| FR-POL-01 | Create a poll (question, options, deadline); one vote per member; results shown after voting or at close. |
| FR-POL-02 | Convert the winning option into an itinerary item or accommodation record in one tap. |

### Auth (FR-AUT) — see [security & privacy](./04-security-and-privacy.md)

| ID | Requirement |
|---|---|
| FR-AUT-01 | Sign in via Supabase magic-link email OTP only; no passwords. |
| FR-AUT-02 | Allowlist signups to known member emails; pending members (Roei) get no access until confirmed. |
| FR-AUT-03 | Enforce RLS on every table and on `storage.objects`; owner vs member roles per the [data model](./03-data-model-and-rls.md). |
| FR-AUT-04 | Persist sessions across PWA restarts; re-auth in one tap. |

### Offline (FR-OFF) — see [PWA & offline](./07-pwa-and-offline.md)

| ID | Requirement |
|---|---|
| FR-OFF-01 | Today, flights, addresses, emergency numbers and bookings fully functional in airplane mode. |
| FR-OFF-02 | Queue writes (expenses, checklist toggles, votes) in IndexedDB; background-sync on reconnect with a conflict-resolution log. |
| FR-OFF-03 | Cache weather/FX with a staleness badge; never present stale dynamic data as current. |

## Non-functional requirements

| ID | Area | Requirement / target |
|---|---|---|
| NFR-PERF-01 | Performance | LCP < 2.5 s on mid-tier Android over 4G |
| NFR-PERF-02 | Performance | TTI < 3.5 s, same conditions |
| NFR-PERF-03 | Performance | Expense entry < 15 s median, tap → saved |
| NFR-PWA-01 | Installability | Lighthouse PWA pass; installable on Android and iOS |
| NFR-A11Y-01 | Accessibility | WCAG 2.1 AA; touch targets ≥ 48px |
| NFR-RTL-01 | RTL correctness | Full layout mirroring; correct bidi for mixed Hebrew/English/numbers |
| NFR-AVL-01 | Availability | Fully usable 2026-10-04 → 2026-10-08; graceful offline degradation if Supabase is unreachable |
| NFR-I18N-01 | Hebrew i18n | All user-facing strings via a messages/i18n file — zero hardcoded strings in components |
| NFR-TZ-01 | Time handling | All times stored with timezone; rendered in both IL and HU time |
| NFR-THM-01 | Theme | Light default; auto dark after Budapest sunset (~18:05 early Oct) |
| NFR-SEC-01 | Secrets | No server secrets on the client; single publishable key; RLS everywhere |

## Constraints

### Technical

- Node 22.x and pnpm 10.x only (no npm/yarn); Next.js 15 App Router + TypeScript strict; Tailwind CSS v4.
- Supabase free tier: 500 MB DB, 1 GB storage, 2 GB egress — size and compress media accordingly (see FR-MDA-02).
- Vercel hobby plan; no server secrets on the client; a single publishable key.
- Supabase project: ref `zgvpchdqudheiohlrrvm`; CLI already linked.
- ~~Known issue: the publishable key returns `401` on `/rest/v1/`~~ **RESOLVED 2026-09-11** — the 401 is the OpenAPI root requiring a secret key; the publishable key works (see [troubleshooting](./12-troubleshooting.md) §1).
  - [x] Verify the Supabase publishable key before first build — root-caused 2026-09-11, no rotation needed.

### Business / personal

- Hard deadline: trip starts 2026-10-04 — 23 days from today (2026-09-11).
- Intermediate deadline: accommodation booked by 2026-09-20.
- Team: 1 developer + agents; at most 6 users (4 confirmed + Roei pending).
- Tight student budget — show costs in HUF with an ILS equivalent wherever possible.

### Legal / privacy

- Sensitive data (passport scans, insurance policy numbers, medical info) is opt-in and private; never render it in shared views.
- No public storage buckets; signed URLs for all media/documents.
- Never store Gmail links, tokens, or URLs with identifying query parameters.
- Embassy/consulate information must be verified against the Israeli MFA near the travel date.
  - [ ] Verify embassy details against MFA in the week before departure.

## Assumptions & open questions

| # | Assumption / open question | Impact if wrong | Owner | Status |
|---|---|---|---|---|
| 1 | Roei (roeiduv@gmail.com) joins the trip | Accommodation capacity, split math, poll quorum | Yakir | Open — pending |
| 2 | Flight arrival times (not printed on e-ticket) | Day 1 evening plan, Day 5 airport transfer | Yakir | Open — [ ] verify from Arkia |
| 3 | Accommodation not yet booked | Anchor station, daily plans, budget | Yakir | Open — deadline 2026-09-20 |
| 4 | Weather 16–19°C day / 7–10°C night, rain possible | Packing list contents | — | Assumption — "typical", not a forecast |
| 5 | Supabase publishable key 401 on `/rest/v1/` root | Blocked all API work | Yakir | **Resolved 2026-09-11** — root-caused; see [12 §1](./12-troubleshooting.md) |
| 6 | 100E airport-bus fare & schedule unknown | Airport transfer plan | — | Dynamic — [ ] tag source + verify before use |
| 7 | No sixth member beyond Roei | Group size cap | Yakir | Assumed — app supports 4–6 regardless |

## Acceptance criteria

High-level gates; the full per-feature checklist lives in [11 — Acceptance criteria](./11-acceptance-criteria.md).

- [ ] Every FR-* above passes its test in the docs/11 matrix.
- [ ] All NFR budgets pass: Lighthouse PWA, performance, WCAG 2.1 AA.
- [ ] Airplane-mode UAT passes: Today, flights, addresses and emergency numbers usable offline.
- [ ] Security review passes: RLS verified on all tables and `storage.objects`; no sensitive data in shared views.
- [ ] 4/4 confirmed members have installed the PWA and signed in before flight day.
- [ ] Accommodation status = booked on or before 2026-09-20.

## Out of scope

As defined in the [project overview](./00-project-overview.md):

- Booking engine — the app links out; it never books.
- Payments processing — settlement is a plan plus manual transfers; no money moves in-app.
- Full chat — coordination happens via structured actions (polls, statuses), not a messaging clone.
- Social features — no public sharing, likes or discovery.
- Multi-trip support — single-trip data model, but the architecture must not preclude future trips.
