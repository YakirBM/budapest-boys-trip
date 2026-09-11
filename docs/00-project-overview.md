---
id: project-overview
title: Project Overview
status: draft
depends_on: []
last_updated: 2026-09-11
---

# 00 — Project Overview

## Vision

A mobile-first, Hebrew (RTL) Trip Companion PWA for 4–6 Israeli medical students traveling to Budapest (2026-10-04 → 2026-10-08) that manages the four things that break on short group trips: **time** (what is now and what is next, across two timezones), **movement** (where we need to be and how to get there), **money** (who paid, who owes whom, in which currency), and **coordination** (what is decided, what is booked, what is still open).

## Problem statement

The group currently coordinates over WhatsApp, with documents scattered across Notion, Google Docs, Gmail and camera rolls. These tools fail on a short, dense group trip:

| Tool | Why it fails |
|---|---|
| WhatsApp | No structure: decisions, addresses and booking numbers drown in scrollback; nothing is typed, queryable or checkable. |
| Google Docs / Sheets | No live state: a doc cannot answer "what is the plan *right now*", does not know the local time, and needs connectivity (roaming data is unreliable and expensive). |
| Notion | No offline-first behavior on flaky connections, no per-day operations view, no push-style "next up" surface. |
| Email / camera roll | Booking PDFs and passport scans scattered per-device; no shared, access-controlled source of truth. |
| Chat-based splitting | Expenses logged in chat are lost; no FX handling, no settlement plan, no receipts. |

Missing across all of them: **live state** (now/next), **structure** (typed itinerary, money, checklists), **offline** (airplane-mode usable), and **per-day ops** (Day 1–5 plans with times, timezones and navigation links).

## Trip summary

| Field | Value |
|---|---|
| Destination | Budapest, Hungary (single city, no side trips planned) |
| Dates | Sun 2026-10-04 → Thu 2026-10-08 — 4 nights / 5 days |
| Day 1 | 2026-10-04 — arrival day (flight IZ291) |
| Days 2–4 | 2026-10-05 → 2026-10-07 — full days in Budapest |
| Day 5 | 2026-10-08 — departure day (flight IZ292) |
| Timezones | `Asia/Jerusalem` UTC+3 · `Europe/Budapest` UTC+2 — Budapest = Israel − 1h |
| Outbound flight | Arkia IZ291, 2026-10-04, TLV T3 → BUD, dep 16:35 Israel local — booked, reservation 13859993 |
| Return flight | Arkia IZ292, 2026-10-08, BUD → TLV, dep 10:25 Hungary local — booked, reservation 13859993 |
| Arrival times | Not printed on the e-ticket — always tag "verify from Arkia" (see [flights](./06-features/02-flights.md)) |
| Check-in rule | Be at the airport ≥ 3 hours before departure |
| Accommodation | **NOT booked** — critical pre-trip task, hard deadline 2026-09-20 (see [accommodation](./06-features/03-accommodation.md)) |
| Budget | Tight student budget; base currency HUF, also ILS / EUR / USD |
| Group size | 4 confirmed + up to 2 optional (Roei pending); app supports 4–6 dynamically |
| Weather (typical) | 16–19°C day, 7–10°C night, rain possible — tagged "typical", not a forecast; pull live data per [integrations](./08-integrations-and-apis.md) |

## Users & roles

Signup is allowlisted to the known emails below (magic-link auth; see [security & privacy](./04-security-and-privacy.md)).

| # | Name | Email | Phone | Status / Role | Permissions |
|---|---|---|---|---|---|
| 1 | Yakir Elazar Ben Menashe | yakir.b.m.ite@gmail.com | +972-52-571-8012 | Confirmed — Owner/Admin | Full: manage members, edit all shared data, moderate media, resolve settlements |
| 2 | Aharon Meyer Lawrence | aharonml123@gmail.com | — | Confirmed — Member | Edit own profile/checklist, add expenses & media, vote in polls |
| 3 | Yehonatan Winestate | jonatannheh@gmail.com | — | Confirmed — Member | Same as member #2 |
| 4 | Bar Mevorach Johan | Barjohan25.11@gmail.com | — | Confirmed — Member | Same as member #2 |
| 5 | Roei | roeiduv@gmail.com | — | Pending — Optional | No access until confirmed and invited; excluded from splits until active |

## Product principles

1. **Zero ambiguity** — every scheduled item carries: time **with timezone**, address, owner, cost, status, and a navigation link. If a field is unknown, show an explicit "TBD" — never silence.
2. **Mobile-first, one-hand** — bottom nav (היום / מסלול / מפה / כספים / עוד), touch targets ≥ 48px, designed for one-thumb use while walking.
3. **Offline-first** — the daily plan, emergency numbers, bookings and addresses must work in airplane mode; writes queue locally and sync later (see [PWA & offline](./07-pwa-and-offline.md)).
4. **Privacy by default** — sensitive data (passport scans, insurance policy numbers, medical info) is opt-in and private to its owner; never rendered in shared views (see [security & privacy](./04-security-and-privacy.md)).
5. **Estimates are tagged** — dynamic facts (prices, schedules, FX rates, opening hours) always carry `source` + `last_verified_at` and a verify checkbox; never present them as absolute.
6. **Minimal friction** — ≤ 3 taps (≤ 15 seconds) to log an expense; every common action reachable from the Today page.
7. **Adaptive theme** — light by default; automatic dark theme after Budapest sunset (~18:05 in early October) (see [design system](./05-ui-ux-design-system.md)).

## Scope

### In scope

- **Today dashboard** — now/next item, dual-timezone clock, weather, blockers (see [spec](./06-features/00-today-dashboard.md)).
- **Route & places** — Day 1–5 itineraries and a places library with navigation links (see [spec](./06-features/01-route-and-places.md)).
- **Flights** — IZ291/IZ292 details, countdowns, check-in deadlines, e-ticket vault (see [spec](./06-features/02-flights.md)).
- **Accommodation** — search → compare → decide → booked, deadline 2026-09-20 (see [spec](./06-features/03-accommodation.md)).
- **Transport hub** — airport transfer options, BKK/BudapestGO deep links, anchor station (see [spec](./06-features/04-transportation.md)).
- **Finance** — shared split expenses, personal ledger, FX (HUF base), settlement plan (see [spec](./06-features/05-finance.md)).
- **Checklists** — packing, shared gear, pre-flight tasks, per-member progress (see [spec](./06-features/06-checklists.md)).
- **Media wall** — private photo/video wall with signed URLs (see [spec](./06-features/07-media-wall.md)).
- **Medical & safety** — emergency numbers, embassy info, opt-in private medical data (see [spec](./06-features/08-medical-safety.md)).
- **Polls / decisions** — one-vote-per-member group decisions (see [spec](./06-features/09-decisions-and-polls.md)).
- **PWA offline** — service worker, IndexedDB cache, background sync (see [spec](./07-pwa-and-offline.md)).

### Out of scope

- **Booking engine** — the app links out to providers; it never books anything.
- **Payments processing** — settlement produces a plan; money moves via the group's own channels.
- **Full chat** — coordination happens through structured actions (polls, statuses), not a messaging clone.
- **Social features** — no public sharing, likes, feeds or discovery.
- **Multi-trip support** — single-trip data model, but the architecture must not preclude future trips.

## Success metrics

| # | Metric | Target | How measured |
|---|---|---|---|
| 1 | PWA installs | 4/4 confirmed members installed before flight day (2026-10-04) | Install check-in list in app |
| 2 | Expense settlement | 100% of shared expenses settled ≤ 7 days post-trip (by 2026-10-15) | Settlement status = fully resolved in finance module |
| 3 | Pre-flight readiness | ≥ 90% of pre-flight checklist items done by T-24h (2026-10-03 16:35 IL) | Checklist completion query |
| 4 | Offline capability | Today page fully usable in airplane mode | Pass/fail UAT script (see [acceptance criteria](./11-acceptance-criteria.md)) |
| 5 | Expense entry speed | ≤ 15 s median from tap to saved | Timed UAT / in-app timing |
| 6 | Accommodation booked | Booking recorded in app on or before 2026-09-20 | Accommodation status = booked |
| 7 | Zero ambiguity | 100% of scheduled items have time+tz, address, owner and status | Data-validation report |
| 8 | Data freshness | 100% of dynamic facts (prices, rates, schedules) carry `source` + `last_verified_at` | Data-validation report |

## Glossary

| Term | Definition |
|---|---|
| **DayPlan** | All itinerary items for one calendar day of the trip (Day 1 = 2026-10-04 … Day 5 = 2026-10-08). |
| **ItineraryItem** | A scheduled entry with time+tz, place, address, owner, estimated cost, status and navigation link. |
| **Place** | A saved location (restaurant, sight, pharmacy) with address + map link; may or may not be scheduled. |
| **Anchor station** | The fixed transit node a day plan is built around — typically the metro/tram stop nearest the accommodation. |
| **Settlement** | The computed minimal who-pays-whom transfer set that zeroes all group balances. |
| **100E** | Budapest airport express bus (Deák Ferenc tér ↔ BUD). Fare and schedule are dynamic — tag with source + `last_verified`, never hardcode. |
| **BKK / BudapestGO** | Budapest's transit authority and its official app — deep-link target for live routes and tickets. |
| **RLS** | Postgres Row-Level Security; mandatory on every table and on `storage.objects`. |
| **Magic link** | Supabase Auth email one-time-code sign-in; no passwords. |
| **PWA** | Progressive Web App — installable, offline-capable via service worker + IndexedDB cache. |

## Doc map

| Doc | Content |
|---|---|
| [00 — Project overview](./00-project-overview.md) | This file — vision, scope, metrics, glossary |
| [01 — Requirements & constraints](./01-requirements-and-constraints.md) | FR/NFR catalog, constraints, assumptions |
| [02 — Architecture](./02-architecture.md) | System design, folder structure, env vars |
| [03 — Data model & RLS](./03-data-model-and-rls.md) | Canonical DB schema + RLS policies (source of truth) |
| [04 — Security & privacy](./04-security-and-privacy.md) | AuthN/AuthZ, storage security, sensitive-data rules |
| [05 — UI/UX design system](./05-ui-ux-design-system.md) | Tokens, themes (light/auto-dark), components, RTL rules |
| [06.01 — Today](./06-features/00-today-dashboard.md) | Now/next, dual clocks, blockers |
| [06.02 — Flights](./06-features/02-flights.md) | IZ291/IZ292, check-in deadlines, e-ticket vault |
| [06.03 — Accommodation](./06-features/03-accommodation.md) | Search → decision → booking (deadline 2026-09-20) |
| [06.04 — Route & places](./06-features/01-route-and-places.md) | Day plans and places library |
| [06.05 — Transport hub](./06-features/04-transportation.md) | Airport transfer, BKK/BudapestGO, anchor station |
| [06.06 — Finance](./06-features/05-finance.md) | Split expenses, personal ledger, FX, settlement |
| [06.07 — Checklists](./06-features/06-checklists.md) | Packing, shared gear, pre-flight tasks |
| [06.08 — Media wall](./06-features/07-media-wall.md) | Private photo/video wall |
| [06.09 — Medical & safety](./06-features/08-medical-safety.md) | Emergency numbers, embassy, private medical info |
| [06.10 — Polls](./06-features/09-decisions-and-polls.md) | Group decisions |
| [07 — PWA & offline](./07-pwa-and-offline.md) | Service worker, IndexedDB, background sync |
| [08 — Integrations & APIs](./08-integrations-and-apis.md) | Weather, FX rates, maps, BudapestGO deep links |
| [09 — Import & seed](./09-import-and-seed.md) | Members, flights (verified from e-ticket), checklist templates |
| [10 — Implementation roadmap](./10-implementation-roadmap.md) | Build order, milestones, task dependencies |
| [11 — Acceptance criteria](./11-acceptance-criteria.md) | Definition of done per feature + perf/security budgets |
| [12 — Troubleshooting](./12-troubleshooting.md) | Known issues (Supabase 401, storage RLS, PWA install, sync conflicts) |

## Verified data sources

- Members: `C:\Users\yakir\Downloads\Personal-info.xlsx` — parsed via `scripts/parse-xlsx.mjs` (see [import & seed](./09-import-and-seed.md)).
- Flights: `C:\Users\yakir\Downloads\res_doc13859993.pdf` — Arkia e-ticket, extracted (see [flights](./06-features/02-flights.md)).
