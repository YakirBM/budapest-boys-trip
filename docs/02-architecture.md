---
id: architecture
title: Architecture
status: draft
depends_on: [requirements-constraints]
last_updated: 2026-09-11
---

# 02 — Architecture

Implements [01-requirements-and-constraints.md](01-requirements-and-constraints.md). Canonical schema lives in
[03-data-model-and-rls.md](03-data-model-and-rls.md); offline behavior in [07-pwa-and-offline.md](07-pwa-and-offline.md);
external APIs in [08-integrations-and-apis.md](08-integrations-and-apis.md).

## System overview

Build one Next.js 15 (App Router) application on Vercel, backed by a single Supabase project
(`zgvpchdqudheiohlrrvm`). Fetch all third-party data (weather, FX) from **server-side cron handlers** into
Supabase cache tables — the browser never calls external APIs directly.

```
        ┌─────────────────────────────────┐
        │ Browser — installed PWA         │
        │ Hebrew · RTL · offline-first    │
        │ SW + IndexedDB + TanStack Query │
        └───┬───────────────────▲─────────┘
  HTTPS     │                   │  REST / Realtime WSS
  (SSR,     │                   │  (publishable key,
   actions) │                   │   RLS-enforced)
┌───────────┴──────────┐  ┌─────┴──────────────────────────┐
│ Vercel               │  │ Supabase zgvpchdqudheiohlrrvm  │
│ Next.js 15 App Router│  │ · Auth — magic-link email OTP  │
│ · RSC + server       │  │ · Postgres + RLS (truth)       │
│   actions            │  │   · weather_cache              │
│ · middleware auth    │  │   · exchange_rates             │
│   gate on /(app)/*   │  │ · Storage — private buckets,   │
│ · cron handlers ─────┼─►│   signed URLs only             │
│   daily 05:00        │  │ · Realtime — postgres_changes  │
└───────────┬──────────┘  └────────────────────────────────┘
            │ server-side fetch only (CRON_SECRET)
┌───────────┴──────────┐
│ Open-Meteo (weather) │  free, no key — see 08 doc
│ Frankfurter (FX/ECB) │  free, no key — see 08 doc
└──────────────────────┘
```

## Rendering strategy

- Default to **React Server Components**; add `"use client"` only at interactive leaves (forms, maps, realtime lists, upload widgets).
- Why: smaller client bundles on mid-range Android phones, direct server-side data access without API round-trips, streaming for slow queries.
- Statically render: `/login`, `/offline`, manifest, icons.
- Dynamically render: everything under `app/(app)/*` — the auth-gated app shell reads session cookies, so these routes are dynamic by construction; do not fight this with `force-static`.
- Keep the app shell (bottom nav: היום / מסלול / מפה / כספים / עוד) in `app/(app)/layout.tsx` so navigation is instant and persistent.

## Route map

| Route | Purpose | Feature doc |
|---|---|---|
| `/login` | Magic-link request (static) | — |
| `/auth/callback` | OTP code exchange (route handler) | — |
| `/today` | Daily dashboard: now/next, weather, FX | [06-features/00-today-dashboard.md](06-features/00-today-dashboard.md) |
| `/route` | Itinerary + places per day | [06-features/01-route-and-places.md](06-features/01-route-and-places.md) |
| `/map` | Map view of places + anchor stations | [06-features/01-route-and-places.md](06-features/01-route-and-places.md) |
| `/flights` | IZ291/IZ292 details, reservation 13859993 | [06-features/02-flights.md](06-features/02-flights.md) |
| `/stay` | Accommodation shortlist + booking status | [06-features/03-accommodation.md](06-features/03-accommodation.md) |
| `/transit` | Budapest transit: passes, BudapestGO links | [06-features/04-transportation.md](06-features/04-transportation.md) |
| `/money` | Expenses, balances, settlements (HUF base) | [06-features/05-finance.md](06-features/05-finance.md) |
| `/checklists` | Group + personal checklists | [06-features/06-checklists.md](06-features/06-checklists.md) |
| `/media` | Shared media wall | [06-features/07-media-wall.md](06-features/07-media-wall.md) |
| `/safety` | Medical, insurance, emergency actions | [06-features/08-medical-safety.md](06-features/08-medical-safety.md) |
| `/decisions` | Polls and votes | [06-features/09-decisions-and-polls.md](06-features/09-decisions-and-polls.md) |
| `/more/*` | Settings, profile, emergency hub | [04-security-and-privacy.md](04-security-and-privacy.md) |
| `/api/cron/fx`, `/api/cron/weather` | Cron handlers (server only) | [08-integrations-and-apis.md](08-integrations-and-apis.md) |

## Project folder structure

```
budapest_boys_trip_sep2026/
├─ app/
│  ├─ layout.tsx                  # root: lang="he" dir="rtl", fonts, SW register
│  ├─ globals.css                 # Tailwind v4 CSS-first tokens (see 05 doc)
│  ├─ manifest.ts                 # PWA manifest (see 07 doc)
│  ├─ offline/page.tsx            # offline fallback
│  ├─ (auth)/
│  │  ├─ login/page.tsx
│  │  └─ auth/callback/route.ts   # exchangeCodeForSession
│  ├─ (app)/
│  │  ├─ layout.tsx               # auth-gated shell + bottom nav
│  │  ├─ today/page.tsx
│  │  ├─ route/page.tsx
│  │  ├─ map/page.tsx
│  │  ├─ flights/page.tsx
│  │  ├─ stay/page.tsx
│  │  ├─ transit/page.tsx
│  │  ├─ money/page.tsx
│  │  ├─ checklists/page.tsx
│  │  ├─ media/page.tsx
│  │  ├─ safety/page.tsx
│  │  ├─ decisions/page.tsx
│  │  └─ more/                    # settings, profile, emergency
│  └─ api/cron/
│     ├─ fx/route.ts
│     └─ weather/route.ts
├─ components/
│  ├─ ui/                         # primitives: Button, Card, Sheet, Badge, Toast
│  └─ feature/                    # ExpenseList, FlightCard, ChecklistItem, PollCard…
├─ lib/
│  ├─ supabase/
│  │  ├─ client.ts                # browser client (publishable key)
│  │  ├─ server.ts                # RSC/action client (cookies via @supabase/ssr)
│  │  └─ middleware.ts            # session refresh + /(app) protection
│  ├─ queries/                    # TanStack Query hooks per domain
│  ├─ offline/                    # Dexie db, outbox, sync engine (see 07 doc)
│  └─ utils/
│     ├─ money.ts                 # minor-unit math, HUF base, FX display conversion
│     ├─ time.ts                  # Asia/Jerusalem ↔ Europe/Budapest helpers
│     └─ deeplinks.ts             # maps, BudapestGO, tel:, WhatsApp
├─ messages/
│  └─ he.json                     # ALL user-facing strings; none hardcoded
├─ public/
│  ├─ icons/                      # 192 / 512 / maskable / apple-touch-icon
│  ├─ sw.js                       # custom service worker (see 07 doc)
│  └─ sw-manifest.js              # generated precache manifest
├─ supabase/
│  ├─ migrations/                 # versioned SQL — the chosen schema flow
│  ├─ seed.sql                    # members, flights, checklist templates (see 09 doc)
│  └─ config.toml
├─ scripts/
│  ├─ parse-xlsx.mjs              # member import (existing)
│  └─ build-sw-manifest.mjs       # precache manifest generator
├─ middleware.ts                  # root: wraps lib/supabase/middleware
├─ tests/                         # vitest unit + playwright e2e
└─ docs/
```

## Data fetching

- Server: `@supabase/ssr` `createServerClient` in RSC and route handlers; first paint arrives with data, no loading spinner on fast networks.
- Client: TanStack Query wrapping the supabase-js browser client for all interactive queries and mutations.
- Why TanStack Query (2 lines): it gives IndexedDB-persisted offline cache (`persistQueryClient`) and optimistic updates for expenses/checklist toggles without a hand-rolled store — both are hard requirements of the offline contract in [07-pwa-and-offline.md](07-pwa-and-offline.md).
- Realtime pattern: one channel per trip; subscribe to `postgres_changes` for `expenses`, `checklist_items`, `polls`, `poll_votes`, `media_items`; on each event, invalidate the matching query key and let TanStack refetch — never hand-merge payloads into cache.

```ts
// lib/queries/realtime.ts (pattern excerpt)
supabase
  .channel(`trip:${tripId}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "expenses" },
    () => queryClient.invalidateQueries({ queryKey: ["expenses", tripId] }))
  .subscribe();
```

## State management

- Server state: TanStack Query only.
- UI state: React `useState` / small `useContext` (theme, open sheet, pending-sync count).
- Do not add Redux/Zustand/Jotai — unjustified for 6 users and ~12 routes.

## Auth flow

1. `/login` posts email → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: "/auth/callback" } })`.
2. `/auth/callback` route handler calls `exchangeCodeForSession(code)`; session is stored in cookies (SSR-compatible via `@supabase/ssr`).
3. Root `middleware.ts` refreshes the session on every request and redirects unauthenticated users from `/(app)/*` to `/login`.
4. Allowlist: `allowed_emails` table (5 known member emails, 4 confirmed + Roei pending) + a Postgres trigger on `auth.users` that rejects signups whose email is not allowlisted. Schema in [03-data-model-and-rls.md](03-data-model-and-rls.md).
- [ ] Create `allowed_emails` table + trigger in the first migration.
- [ ] Seed the 5 allowlisted emails per [09-import-and-seed.md](09-import-and-seed.md).

## Realtime plan

| Table | Channel event | Client reaction |
|---|---|---|
| `expenses` | INSERT/UPDATE/DELETE | invalidate `["expenses"]`, `["balances"]` |
| `checklist_items` | UPDATE | invalidate `["checklists"]` |
| `polls`, `poll_votes` | INSERT/UPDATE | invalidate `["polls"]` |
| `media_items` | INSERT/DELETE | invalidate `["media"]` |

Defer presence (who's online) to post-MVP.

## Cron jobs

Two Vercel cron handlers, daily 05:00 (Vercel schedule is UTC — source: Vercel docs, last_verified: 2026-09-11 — - [ ] verify DST behavior before departure):

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/weather", "schedule": "0 5 * * *" },
    { "path": "/api/cron/fx", "schedule": "0 5 * * *" }
  ]
}
```

- `/api/cron/weather` fetches Open-Meteo for Budapest → upserts `weather_cache` with `source`, `fetched_at`.
- `/api/cron/fx` fetches Frankfurter (ECB) for HUF/ILS/EUR/USD → upserts `exchange_rates` with `source`, `last_verified_at`.
- Both handlers reject requests without `Authorization: Bearer ${CRON_SECRET}`.
- [ ] Increase weather cadence to every 3 h during 2026-10-04 → 2026-10-08 (decide in [10-implementation-roadmap.md](10-implementation-roadmap.md)).

## Environment variables

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | `https://zgvpchdqudheiohlrrvm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client | RLS-enforced; **currently returns 401 on `/rest/v1/`** — verify/rotate per [12-troubleshooting.md](12-troubleshooting.md) |
| `CRON_SECRET` | server only | bearer check in cron handlers |
| `OPENAI_API_KEY` | server only | Responses API credential for `/api/trip-search`; never exposed to the client |
| `OPENAI_SEARCH_MODEL` | server only | Optional model override; defaults to `gpt-5-mini` |

- Keep secrets in `.env.local` (gitignored) and in Vercel env settings. No other secret may reach the client bundle. Service-role keys are forbidden in this repo.
- [ ] Verify/rotate the publishable key before first build; re-test `/rest/v1/` returns 200 with anon role.

## Error handling and logging

- Server actions return typed results: `{ ok: true, data } | { ok: false, error: { code, message } }`; map codes to Hebrew strings in `messages/he.json`.
- Log with `console.error` + structured context on the server (captured by Vercel logs).
- [ ] Evaluate Sentry post-MVP; do not add the dependency now.

## Deployment

- Vercel project connected to the repo; `main` → production, every branch/PR → preview with its own env scope. All envs point at the same Supabase project (6 users — no staging project).
- Schema flow: **migration files in `supabase/migrations/` are the source of truth**. Apply with `supabase db push` using the already-linked CLI (2.108.0). Never edit production schema from the dashboard.
- Seeds via `supabase/seed.sql` per [09-import-and-seed.md](09-import-and-seed.md).
- [ ] Set the 3 env vars in Vercel (Production + Preview).
- [ ] Add `supabase db push --dry-run` to PR checks.

## Key architectural decisions

| # | Decision | Rationale | Revisit if |
|---|---|---|---|
| 1 | Next.js 15 App Router + TS strict | RSC-first data loading, Vercel-native deploys, one language across stack | SSR complexity blocks offline goals |
| 2 | Supabase (single project) | Postgres+RLS, Auth, Storage, Realtime in one; free tier fits 6 users | RLS bugs or quota pressure → see [12-troubleshooting.md](12-troubleshooting.md) |
| 3 | TanStack Query | Offline persistence + optimistic mutations without hand-rolled cache | Bundle budget exceeded |
| 4 | Tailwind CSS v4 | CSS-first config, RTL via logical properties, zero JS config | v4 instability on Windows dev |
| 5 | Custom service worker | Full control of precache + outbox background sync; auditable ~200 lines. Details: [07-pwa-and-offline.md](07-pwa-and-offline.md) | SW maintenance cost grows |
| 6 | HUF base currency | Spend happens in HUF; ILS/EUR/USD are display conversions from `exchange_rates` | Multi-currency settlement disputes |
| 7 | Magic-link email OTP + allowlist | No passwords for a 6-person group; allowlist replaces invite flow | Email delivery failures on trip |
| 8 | Migration files in repo | Reviewable, reproducible schema history via CLI | Team starts editing via dashboard |

## Open tasks

- [ ] Scaffold the folder structure above (Milestone 0 in [10-implementation-roadmap.md](10-implementation-roadmap.md)).
- [ ] Confirm feature-doc filenames in `docs/06-features/` match the route map links.
- [ ] Validate this doc against acceptance budgets in [11-acceptance-criteria.md](11-acceptance-criteria.md).
