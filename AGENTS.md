# AGENTS.md — Budapest Boys Trip Companion PWA

> Guidance for coding agents working in this repository. Read this file first.

## What this project is

A mobile-first, Hebrew (RTL) **Trip Companion PWA** for a group of 4 Israeli medical students
traveling to **Budapest, Hungary, 2026-10-04 → 2026-10-08** (4 nights / 5 days).
The app manages the four things that break on short group trips: **time, movement, money, coordination**.

- **Trip**: Budapest, 2026-10-04 → 2026-10-08. Timezones: `Asia/Jerusalem` (UTC+3) vs `Europe/Budapest` (UTC+2).
- **Flights (booked)**: Arkia Israeli Airlines, reservation **13859993**. Outbound IZ291 TLV T3 → BUD 2026-10-04 dep 16:35 (IL time). Return IZ292 BUD → TLV 2026-10-08 dep 10:25 (HU time).
- **Accommodation**: NOT booked yet — critical pre-trip task (see `docs/06-features/03-accommodation.md`).
- **Budget**: tight student budget. Base currency **HUF**; also ILS, EUR, USD.
- **Users**: 4 confirmed members + up to 2 optional. Signup is allowlisted to known emails.

## Tech stack (decided — do not change without an ADR)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict |
| Styling | Tailwind CSS v4 (CSS-first config), RTL everywhere |
| Backend | Supabase: Postgres + RLS, Auth (magic link email OTP), Storage (private buckets), Realtime |
| Hosting | Vercel |
| PWA | Service worker, IndexedDB cache, background sync (see `docs/07-pwa-and-offline.md`) |
| Package manager | **pnpm** (10.x) — do not use npm/yarn |
| Node | v22.x |

## Supabase project

- Project ref: `zgvpchdqudheiohlrrvm` · URL: `https://zgvpchdqudheiohlrrvm.supabase.co`
- Supabase CLI 2.108.0 is installed; project is already linked (`supabase/.temp/linked-project.json`).
- Known issue: the publishable key currently returns `401` on `/rest/v1/` — see `docs/12-troubleshooting.md` before first build.
- **NEVER commit service-role keys or secrets.** Publishable/anon key goes in `.env.local` (gitignored).

## Documentation map (READ BEFORE BUILDING)

All planning docs live in `docs/` and are written in **English**. The app UI is **Hebrew RTL**.

| Doc | Content |
|---|---|
| `docs/00-project-overview.md` | Vision, users, scope, success metrics |
| `docs/01-requirements-and-constraints.md` | Functional + non-functional requirements |
| `docs/02-architecture.md` | System architecture, folder structure, env vars |
| `docs/03-data-model-and-rls.md` | Canonical DB schema + RLS policies (source of truth) |
| `docs/04-security-and-privacy.md` | AuthN/AuthZ, storage security, sensitive-data rules |
| `docs/05-ui-ux-design-system.md` | Design tokens, themes (light/auto-dark), components, RTL rules |
| `docs/06-features/*.md` | Per-page specs: today, route, flights, accommodation, transport, finance, checklists, media wall, medical, polls |
| `docs/07-pwa-and-offline.md` | PWA, caching, offline, background sync |
| `docs/08-integrations-and-apis.md` | Weather, FX rates, maps, BudapestGO, deep links |
| `docs/09-import-and-seed.md` | Seed data: members, flights (verified from e-ticket), checklists templates |
| `docs/10-implementation-roadmap.md` | Build order, milestones, task list with dependencies |
| `docs/11-acceptance-criteria.md` | Definition of done per feature + perf/security budgets |
| `docs/12-troubleshooting.md` | Known issues (Supabase 401, storage RLS, PWA install, sync conflicts) |

## Hard rules for agents

1. **Docs in English, UI in Hebrew (RTL).** All user-facing strings via a messages/i18n file — no hardcoded strings in components.
2. **RLS is mandatory** on every table and on `storage.objects`. No public buckets. Signed URLs for media/documents.
3. **Sensitive data is opt-in and private**: passport scans, insurance policy numbers, medical info. Never render them in shared views. Never store Gmail links, tokens, or URLs with identifying query params.
4. **Zero ambiguity**: every scheduled item has time + timezone, address, owner, cost, status, navigation link.
5. **Never invent prices/times** as facts. Dynamic data (prices, schedules, exchange rates) must carry `source` + `last_verified_at` and be presented as estimates.
6. **Mobile-first**: bottom nav = Today / Route / Map / Money / More. Touch targets ≥ 48px. Everything must work offline-first for the daily plan, emergency numbers, bookings, and addresses.
7. **Minimal changes, follow existing style.** Do not add dependencies without justification. Do not run `git commit/push` unless explicitly asked.
8. Keep this file and `docs/` up to date when you change structure, conventions, or workflows.

## Verified data sources

- Members: `C:\Users\yakir\Downloads\Personal-info.xlsx` (parsed; see `docs/09-import-and-seed.md`).
- Flights: `C:\Users\yakir\Downloads\res_doc13859993.pdf` (Arkia e-ticket, extracted; see `docs/06-features/02-flights.md`).
- Local scripts: `scripts/parse-xlsx.mjs` (xlsx → rows dump).

## Local tooling (app added 2026-09-11)

- Commands: `pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` (vitest unit) · `pnpm test:e2e` (Playwright) · `pnpm build` (runs prebuild → scripts/build-sw-manifest.mjs before Next collects public assets) · `pnpm db:push` · `node scripts/verify-seed.mjs` (seed counts + masked-ref scan) · `node scripts/visual-audit.mjs` (RTL/theme screenshots, needs pnpm start).
- i18n: `messages/he.json` is the base; each feature screen owns `messages/he/<feature>.json` (top-level key = section, overrides base) — merged in `lib/i18n.ts`. No hardcoded Hebrew in components.
- Migrations are the schema source of truth: `supabase/migrations/0001…0016` applied via `supabase db push`; bulk seed mirrored in `0015_seed_bulk.sql` + `supabase/seed.sql` (both idempotent). `supabase/rls-tests.sql` needs direct SQL access (see BUILD_STATUS B3).
- The app lives in `app/ components/ lib/ messages/ public/ tests/`; `media/` holds raw private documents (passports, e-ticket) — gitignored, never ship or upload its contents.
