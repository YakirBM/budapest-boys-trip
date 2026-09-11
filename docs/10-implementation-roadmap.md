---
id: implementation-roadmap
title: Implementation Roadmap
status: draft
depends_on: [data-model, architecture]
last_updated: 2026-09-11
---

# 10 — Implementation Roadmap

Build order from today to wheels-up. Schema lives in [03-data-model-and-rls.md](03-data-model-and-rls.md),
system design in [02-architecture.md](02-architecture.md), per-feature specs in [06-features/](06-features/),
definition of done in [11-acceptance-criteria.md](11-acceptance-criteria.md), known blockers in
[12-troubleshooting.md](12-troubleshooting.md).

## Reality check

- **23 days to departure** (2026-09-11 → 2026-10-04). One developer + coding agents. Hard deadline —
  the trip does not move.
- The constraint is not code volume, it is **unverified real-world data** (accommodation, arrival times,
  transit prices) and **member onboarding**. Both need calendar time, so they start earliest.
- Rule: a phase ends when its milestone is demoable on a real phone, not when every checkbox is pretty.
- If a day slips, cut from the Phase 2 list first (see [Cut list](#cut-list)) — never from RLS, auth, or
  offline plan/emergency content.

## Phase overview

| Phase | Dates | Goal | Milestone |
|---|---|---|---|
| 0 — Foundations | Sep 11–12 | Deployable skeleton: auth + schema + key fix | M1 (Sep 12) |
| 1 — MVP | Sep 13–24 | Every core page usable online | M2 (Sep 20) |
| 2 — Polish | Sep 25–30 | Offline-first + integrations | M3 (Sep 30) |
| 3 — Hardening | Oct 1–3 | Acceptance, UAT, real data, freeze | M4 (Oct 3) |

## Phase 0 — Foundations (Sep 11–12)

Everything else is blocked on a deployable skeleton.

1. [ ] **Fix the Supabase publishable key 401 FIRST** — it blocks every data task. Verify with curl,
       rotate/copy the current key in the dashboard, update `.env.local` + Vercel.
       Procedure: [12-troubleshooting.md](12-troubleshooting.md) §1.
2. [ ] Repo init: Next.js 15 (App Router) + TypeScript strict + Tailwind v4 (CSS-first) + pnpm 10, Node 22.
3. [ ] Link Vercel project; set env vars (`NEXT_PUBLIC_SUPABASE_URL`, publishable key); verify a deploy.
4. [ ] Supabase migration `0001_core_schema` — all tables from [03-data-model-and-rls.md](03-data-model-and-rls.md).
5. [ ] Migration `0002_rls_policies` — RLS on every table, deny-by-default.
6. [ ] Storage buckets `trip-media` + `trip-documents` (both private) + `storage.objects` policies
       + CI assertion `public = false` ([04-security-and-privacy.md](04-security-and-privacy.md)).
7. [ ] `supabase/seed.sql` from [09-import-and-seed.md](09-import-and-seed.md); run against prod project.
8. [ ] Auth: allowlist trigger, magic-link login page, `/auth/callback` route handler, middleware gate on
       `/(app)/*`; profile-create + trip-member email-match triggers.
9. [ ] Base layout: Hebrew RTL (`dir="rtl"`), theme tokens from
       [05-ui-ux-design-system.md](05-ui-ux-design-system.md), bottom nav (היום / מסלול / מפה / כספים / עוד),
       48px touch targets.
10. [ ] i18n scaffold: `messages/he.json` — no hardcoded user-facing strings from day one.
11. [ ] CI: lint + typecheck on every push (GitHub Actions).

## Phase 1 — MVP (Sep 13–24)

Online-only is acceptable here; offline arrives in Phase 2. Order matters: accommodation intake leads
because the booking deadline is 2026-09-20.

1. [ ] Today dashboard skeleton: day plans 1–5, date/tz header, item cards (empty states OK).
2. [ ] Route/places: places inbox (quick-add) + day-plan builder (time, tz, address, owner, cost, status,
       nav link per hard rule 4).
3. [ ] Flights page: IZ291/IZ292 cards from seeded data, passengers, baggage rules, masked booking ref,
       deep links ([06-features/02-flights.md](06-features/02-flights.md)).
4. [ ] Documents: private upload of e-ticket PDF to `trip-documents` (signed URLs only).
5. [ ] **Accommodation intake form first** (candidate link + fields), then the accommodation page render —
       booked data entered as soon as the deal is signed (deadline Sep 20).
6. [ ] Finance core: expense entry (HUF/ILS/EUR/USD), payer + split entry, balances & settlement view
       ([06-features/05-finance.md](06-features/05-finance.md)).
7. [ ] Checklists: 4 seeded templates, toggle items, progress; per-member assignment.
8. [ ] Medical/safety static content: emergency 112 call button, insurance summary (owner-only),
       consular placeholder ([06-features/08-medical-safety.md](06-features/08-medical-safety.md)).
9. [ ] Transport hub: static guidance + BudapestGO/Google Maps deep links; 100E section marked
       "price to verify" ([06-features/04-transportation.md](06-features/04-transportation.md)).
10. [ ] Polls basic: create yes/no + multi-option, vote, live-ish results
        ([06-features/09-decisions-and-polls.md](06-features/09-decisions-and-polls.md)).
11. [ ] Media wall basic: upload photos to `trip-media`, grid view
        ([06-features/07-media-wall.md](06-features/07-media-wall.md)).
12. [ ] Test magic-link login with **all 5 real emails** by Sep 20 (see risk R5).

## Phase 2 — Polish (Sep 25–30)

Offline contract and dynamic data ([07-pwa-and-offline.md](07-pwa-and-offline.md),
[08-integrations-and-apis.md](08-integrations-and-apis.md)).

1. [ ] PWA: manifest + icons (192/512/maskable) + install prompt handling; iOS instructions page.
2. [ ] Service worker: precache app shell + plan routes; runtime caching per strategy doc.
3. [ ] Offline outbox (IndexedDB/Dexie) + Background Sync for checklists, expenses, polls; iOS degrade
       (manual retry) documented.
4. [ ] FX cron (Frankfurter/ECB) → `exchange_rates`; render HUF↔ILS conversions with
       `source + last_verified_at`.
5. [ ] Weather cron (Open-Meteo) → `weather_cache`; 5-day strip on Today.
6. [ ] Feasibility hints: static/cached travel-time estimates between day-plan items (no live API — see
       cut list).
7. [ ] Media: client-side compression before upload; reactions on media items.
8. [ ] ICS export for the day plan + flights.
9. [ ] In-app notifications for poll/checklist/expense changes (Realtime-driven).
10. [ ] Design-system pass: spacing, dark-theme, empty/loading/error/offline states on every screen.
11. [ ] RTL QA audit: logical properties only, no `left/right` leaks; screenshot sweep.

## Phase 3 — Hardening (Oct 1–3)

1. [ ] Full acceptance pass against [11-acceptance-criteria.md](11-acceptance-criteria.md).
2. [ ] Airplane-mode UAT on 2 real phones (Android + iOS) — the scripted scenario in doc 11.
3. [ ] RLS negative-test suite executed (user A cannot read user B's insurance/documents).
4. [ ] Seed real data finalized: accommodation record, verified arrival times, verified transit prices
       (all [09-import-and-seed.md](09-import-and-seed.md) human tasks closed or explicitly waived).
5. [ ] Performance budgets measured on a Moto G-class device / throttled 4G (doc 11).
6. [ ] **Feature freeze Oct 2**. Bug fixes only.
7. [ ] Oct 3 = buffer day: re-run UAT, confirm every member has the installed PWA and offline pack.

## Task table

Estimates: S ≤ 2h, M ≤ half day, L = full day or more. `deps` are task IDs.

| ID | Task | Phase | deps | Est | Doc |
|---|---|---|---|---|---|
| T-001 | Fix Supabase publishable key 401 (BLOCKER) | 0 | — | S | [12 §1](12-troubleshooting.md) |
| T-002 | Repo init: Next 15 + TS strict + Tailwind v4 + pnpm | 0 | — | S | [02](02-architecture.md) |
| T-003 | Vercel link + env vars + first deploy | 0 | T-002 | S | [02](02-architecture.md) |
| T-004 | Migration 0001 core schema (all tables) | 0 | T-001 | L | [03](03-data-model-and-rls.md) |
| T-005 | Migration 0002 RLS policies (deny-by-default) | 0 | T-004 | L | [03](03-data-model-and-rls.md), [04](04-security-and-privacy.md) |
| T-006 | Storage buckets + storage.objects RLS + private-bucket CI check | 0 | T-004 | M | [04](04-security-and-privacy.md) |
| T-007 | seed.sql + run on prod project | 0 | T-004 | M | [09](09-import-and-seed.md) |
| T-008 | Auth: allowlist, magic link, callback, middleware, member-link triggers | 0 | T-004, T-007 | L | [04](04-security-and-privacy.md), [09](09-import-and-seed.md) |
| T-009 | Base RTL layout + theme tokens + bottom nav | 0 | T-002 | M | [05](05-ui-ux-design-system.md) |
| T-010 | i18n scaffold (messages/he.json) | 0 | T-002 | S | [05](05-ui-ux-design-system.md) |
| T-011 | CI lint + typecheck | 0 | T-002 | S | — |
| T-012 | Today dashboard skeleton + day plans | 1 | T-008, T-009 | M | [06/00](06-features/00-today-dashboard.md) |
| T-013 | Places inbox + day-plan builder | 1 | T-012 | L | [06/01](06-features/01-route-and-places.md) |
| T-014 | Flights page (cards, passengers, baggage, deep links) | 1 | T-007, T-009 | M | [06/02](06-features/02-flights.md) |
| T-015 | Documents upload (e-ticket → trip-documents, signed URLs) | 1 | T-006 | M | [06/02](06-features/02-flights.md) |
| T-016 | Accommodation intake form (FIRST in finance-critical path) | 1 | T-008 | S | [06/03](06-features/03-accommodation.md) |
| T-017 | Accommodation page render | 1 | T-016 | S | [06/03](06-features/03-accommodation.md) |
| T-018 | Expenses CRUD (multi-currency entry) | 1 | T-008 | L | [06/05](06-features/05-finance.md) |
| T-019 | Splits + balances + settlement view | 1 | T-018 | L | [06/05](06-features/05-finance.md) |
| T-020 | Checklists templates + toggle + assignment | 1 | T-007 | M | [06/06](06-features/06-checklists.md) |
| T-021 | Medical/safety static page + 112 button | 1 | T-009 | M | [06/08](06-features/08-medical-safety.md) |
| T-022 | Transport hub static + deep links (100E, BudapestGO) | 1 | T-009 | M | [06/04](06-features/04-transportation.md) |
| T-023 | Polls basic (create, vote, results) | 1 | T-008 | M | [06/09](06-features/09-decisions-and-polls.md) |
| T-024 | Media wall basic (upload + grid) | 1 | T-006 | M | [06/07](06-features/07-media-wall.md) |
| T-025 | Magic-link login tested with all 5 real emails | 1 | T-008 | S | [12 §2](12-troubleshooting.md) |
| T-026 | PWA manifest + icons + install prompt + iOS page | 2 | T-009 | M | [07](07-pwa-and-offline.md) |
| T-027 | Service worker precache + runtime strategies | 2 | T-026 | L | [07](07-pwa-and-offline.md) |
| T-028 | Offline outbox + Background Sync (+ iOS degrade) | 2 | T-027 | L | [07](07-pwa-and-offline.md) |
| T-029 | FX cron → exchange_rates + conversions with source | 2 | T-004 | M | [08](08-integrations-and-apis.md) |
| T-030 | Weather cron → weather_cache + Today strip | 2 | T-004 | M | [08](08-integrations-and-apis.md) |
| T-031 | Feasibility hints (cached travel-time estimates) | 2 | T-013 | M | [08](08-integrations-and-apis.md) |
| T-032 | Media compression before upload | 2 | T-024 | M | [06/07](06-features/07-media-wall.md) |
| T-033 | Media reactions | 2 | T-024 | S | [06/07](06-features/07-media-wall.md) |
| T-034 | ICS export (plan + flights) | 2 | T-012 | S | [08](08-integrations-and-apis.md) |
| T-035 | In-app notifications via Realtime | 2 | T-023 | S | [02](02-architecture.md) |
| T-036 | Design-system pass: states + dark theme | 2 | T-012–T-024 | M | [05](05-ui-ux-design-system.md) |
| T-037 | RTL QA audit | 2 | T-036 | S | [05](05-ui-ux-design-system.md) |
| T-038 | Acceptance pass vs doc 11 (all features) | 3 | all | L | [11](11-acceptance-criteria.md) |
| T-039 | Airplane-mode UAT (Android + iOS) | 3 | T-028 | M | [11](11-acceptance-criteria.md) |
| T-040 | RLS negative-test suite execution | 3 | T-005 | M | [11](11-acceptance-criteria.md) |
| T-041 | Real-data finalization (accommodation, arrivals, prices) | 3 | T-007 | M | [09](09-import-and-seed.md) |
| T-042 | Perf budgets on low-end device + throttled network | 3 | T-027 | M | [11](11-acceptance-criteria.md) |
| T-043 | Feature freeze (Oct 2) + member PWA/offline-pack confirmation | 3 | T-038 | S | [11](11-acceptance-criteria.md) |

## Milestones

| ID | Date | Definition |
|---|---|---|
| M1 | 2026-09-12 | Auth + schema live: key 401 fixed, migrations+seed applied, a member can log in and see an authenticated shell with bottom nav. |
| M2 | 2026-09-20 | MVP usable online: every Phase 1 page demoable; **accommodation booked and entered**; all 5 magic links proven. |
| M3 | 2026-09-30 | PWA offline complete: installable, airplane-mode day plan + emergency + bookings + checklist toggle-then-sync works on Android. |
| M4 | 2026-10-03 | Trip-ready: acceptance pass done, UAT signed, real data seeded, freeze in effect, everyone installed + logged in. |

## Risk register

| ID | Risk | Likelihood | Impact | Mitigation / trigger |
|---|---|---|---|---|
| R1 | Accommodation not booked (deadline 2026-09-20) | high | high | Escalate Sep 18 if no booking: reduce requirements (location > amenities), decide by vote that evening. See [06/03](06-features/03-accommodation.md). |
| R2 | Supabase publishable key 401 | certain (current) | blocker | T-001, day 1. Procedure in [12 §1](12-troubleshooting.md). Nothing ships until curl returns 200. |
| R3 | Timeline overrun vs hard deadline | medium | high | Cut in order: media videos → auto travel-time API → presence indicators → notifications → ICS. Never cut RLS/auth/offline-plan. |
| R4 | Supabase free-tier limits (bandwidth, storage, pauses) | low | medium | Compress media client-side (T-032); keep documents small; monitor usage weekly; retention rules in [04](04-security-and-privacy.md). |
| R5 | Member onboarding friction (magic-link emails, install) | medium | high | Test all 5 real emails by Sep 20 (T-025); custom SMTP if rate-limited ([12 §2](12-troubleshooting.md)); install + first-login session on Oct 3 buffer day. |
| R6 | Unverified transit prices/times mislead the group | medium | medium | UI must render `source + last_verified_at`; unverified values shown as estimates only (hard rule 5). |

## Cut list — explicitly NOT before the trip

These are post-trip work; do not start them under time pressure:

- Videos in the media wall (photos only).
- Live flight-status API (static verified data + manual refresh note).
- Automatic transit-time API (cached/static estimates only).
- Push notifications (in-app badges + WhatsApp deep links instead).
- Multi-language (Hebrew only).
- Anything not reachable from the bottom nav.
