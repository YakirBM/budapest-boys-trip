# BUILD_STATUS.md — Budapest Boys Trip Companion PWA

> Live build tracker. Updated after every meaningful task or integrated agent result.
> Never mark a task complete without evidence. No secrets, personal data, or full booking refs in this file.

## Snapshot (2026-09-11, end of build day 1)

- **Milestone**: M1 (Foundations) ✅ **complete early** · M2 (MVP online) ✅ **features built** (pending live magic-link test) · M3 scope (offline/PWA) ✅ built (pending device UAT) · M4 hardening partially done (gates + scans; UAT/deploy pending)
- **Build status**: `pnpm lint` ✅ 0 problems · `pnpm typecheck` ✅ 0 errors · `pnpm test` ✅ 39/39 · `pnpm build` ✅ 16 routes
- **Database**: 16 migrations applied to `zgvpchdqudheiohlrrvm` (empty→seeded, non-destructive). Seed verification: **11/11 expected counts OK**. Both private buckets verified `public=false`.
- **DEPLOYED (2026-09-11)**: https://medbadboys.vercel.app (prod alias; project yakirbm2026/budapest_boys_trip_sep2026). All post-deploy verifications green — see T-003.

## Checkpoint (2026-09-11, docs/14 header + 4-tab redesign — built, DB push pending)

- **Spec**: `docs/14-header-and-navigation-redesign.md` (approved-spec). Decisions locked: parallel tracks, personal schedule = separate table, scrape = server OG+extended, map pins = shared synced.
- **Built**: Phase 0 primitives (`AmountInput`, `SubTabs`, `GroupPersonalToggle`, tile scrims, `@dnd-kit/*`); Phase 1 shell (`AppHeader` live HU/IL flag clocks + weather + theme + emergency + `ProfileMenu` full edit/logout, 4-tab `BottomNav`, `0023_profile_extended.sql` + `avatars` bucket + `updateMyProfileAction`); Tab 1 schedule tiles/drawer/comments + places grid/form + `/api/scrape` + shared `map_pins` (`0018/0019/0020`); Tab 2 checklist groups (`0021`); Tab 3 money wording/converter/reports; Tab 4 media albums/views + `/api/geocode` (`0022`).
- **Evidence**: `pnpm typecheck` 0 errors, `pnpm lint` 0 problems, `pnpm test` 120/120 (16 files), `pnpm test:e2e` 12/12, `pnpm build` green (16 routes). Hebrew-literal scan clean in new TSX; banned-word scan clean in money components.
- **Pending (needs secrets/network or human)**: `pnpm db:push` for migrations 0018–0023; full `supabase/rls-tests.sql` run (B3, needs direct SQL); `scripts/visual-audit.mjs` RTL/theme screenshots; real-device UAT + magic-link test (B2).
- **DEPLOYED (2026-09-11)**: commit `abd27f7` pushed to `main` + `vercel --prod` green (16 routes, incl. new `/api/scrape`, `/api/geocode`), aliased to https://medbadboys.vercel.app — verified serving (login renders).

## T-001 — Supabase publishable key 401: **RESOLVED (2026-09-11)**

- **Evidence before fix**: `curl /rest/v1/` with key → 401; body: `{"hint":"Only secret API keys can be used for this endpoint.","message":"Secret API key required"}`
- **Root cause**: the doc-12 verification procedure probed the PostgREST **OpenAPI root** (`/rest/v1/`), which requires a *secret* key on `sb_publishable_*` projects. The publishable key was valid: `/rest/v1/trips` → 404 `PGRST205` (authenticated, table absent), `/auth/v1/health` → 200.
- **Resolution**: key re-copied via the Supabase CLI management API into `.env.local` (gitignored). User also supplied keys via chat → stored, never printed. **Rotation of the sb_secret/service-role key is recommended before launch** (they appeared in chat history).
- **Doc fix**: `docs/12-troubleshooting.md` §1 verification corrected; `docs/01` assumptions row closed.

## Environment preflight (2026-09-11)

| Tool | Required | Actual | Status |
|---|---|---|---|
| Node | 22.x | v22.16.0 | ✅ |
| pnpm | 10.x | 10.11.1 | ✅ |
| Supabase CLI | 2.108.0 | 2.108.0 | ✅ |
| Project link | ref `zgvpchdqudheiohlrrvm` | matches | ✅ |
| Stack | Next 15 / TS strict / Tailwind v4 | next 15.5.25 · TS 5.9.3 (pinned from 7.0.2 — Next 15 compatibility) · tailwind 4.3.3 · @supabase/ssr 0.12.7 · supabase-js 2.116.0 | ✅ |

**Sensitive media**: `media/` (raw passports, e-ticket PDF, member xlsx) is gitignored; never uploaded, never used as build/generation input, never copied into app bundles.

## Documentation consistency audit (Phase A) — all resolved

1. **Fixed**: feature-doc filename drift in docs 00/01/02 (old numbering → actual `00-today-dashboard…09-decisions-and-polls` files); `/stay` route naming (doc 02 wins); doc-12 §1 verify procedure; all internal md links validated programmatically → **ALL LINKS OK**.
2. **Precedence conflicts C1–C10** (created_by nullable, passengers-via-trigger, masked-serials-only, media enums, checklist blockers join table, doc-09-sketch→schema-wins, 7 checklist lists, weather fetched_at, fx is_override, accommodation status) — **all encoded in migrations** and recorded in `docs/03 §13` (appended by the DB agent).
3. **Feature-driven schema gaps** — all implemented (day_notes/note_reactions, transit_*, preferred_routes, emergency_contacts, safety_notices, budget_caps, places lat/lng/gmaps_place_id/tags/source, itinerary duration/travel/poll_id, flights source/verified_at, passengers checkin/addons, accommodations booked-mode fields, expenses settled_*/payment_method, polls close/winner/override fields, media §13 fields, documents mime/bytes).

## Task tracker (T-001 … T-043)

| ID | Task | Status | Evidence |
|---|---|---|---|
| T-001 | Supabase key 401 | **done** | See above |
| T-002 | Repo init | **done** | Versions above; strict + noUncheckedIndexedAccess |
| T-003 | Vercel deploy | **done** | Repo github.com/YakirBM/budapest-boys-trip (private) → Vercel. 4 env vars set via CLI (production+preview). Verified live: all 6 security headers; (app) routes → 307 /login; cron 401 without secret / 200 with secret (3 rates written from Vercel runtime); smoke e2e 5/5 vs prod (manifest he/rtl/standalone, SW fetch+sync handlers, offline page). Commit 76cf748 |
| T-004–T-006 | Schema + RLS + Storage | **done** | 16 migrations pushed clean; 36 tables RLS'd, 72+ policies; storage INSERT+SELECT+DELETE; live probes: anon REST reads → empty (denied), publishable-key reads → 200, buckets public=false (25MB images-only / 10MB docs) |
| T-007 | Seed | **done** | verify-seed.mjs **11/11 OK**; idempotent (ON CONFLICT ×18); mirrored as migration 0015 for `db push` |
| T-008 | Auth flow | **done** (live mail test = T-025) | Allowlist trigger + handle_new_user (profile/membership/passengers/owner-claim); /login magic-link+OTP; /auth/callback; middleware gate (verified: unauthenticated /today → 307 /login) |
| T-009/T-010 | RTL shell + tokens + i18n | **done** | Screenshots verified (RTL, bidi, LTR runs, light+dark, auto-dark live at Budapest night, override wins); he.json base + 11 per-feature sections merged in lib/i18n.ts |
| T-012/T-013 | Today + Route/Places | **done** (feature agent A) | StatusStrip/day-selector/NextUp+countdown/timeline+legal-transitions/feasibility engine/day-feed/weather-pill; places pipeline + quick-add maps-parse + reorder + rain plan + day cost rollup; map = no-SDK schematic w/ anchors + place sheet |
| T-014/T-015 | Flights + documents | **done** (feature agent B) | IZ291/IZ292 with tz chips + countdowns; arrival = unverified estimate; masked ref; baggage; transfers (Day-5 chain); e-ticket upload → trip-documents + 1h signed URL; ICS export |
| T-016/T-017 | Accommodation | **done** (feature agent B) | Mode A mission banner (2026-09-20 countdown, computed) + candidates + poll conversion; Mode B booked dashboard (address/host/access masked-reveal/Wi-Fi) — no fabricated booking |
| T-018/T-019 | Finance | **done** (feature agent C) | ≤4-tap expense entry; splits server-recomputed (equal/exact/percent/shares); balances from `v_member_balances`; settlement from `suggest_settlements` RPC; CSV export; converter w/ source+timestamp+disclaimer; personal expenses isolated |
| T-020 | Checklists | **done** (feature agent C) | 7 seeded lists (44 items) + blocked-by lock chain (check-in→boarded); optimistic toggle + outbox; readiness widget |
| T-021 | Medical/safety | **done** (feature agent B) | 112 card offline; phrase block (HU draft marked); owner-only insurance + masked policy + logged reveals; opt-in medical profile w/ visibility + server-logged group reveal; solo notices; no location persistence |
| T-022 | Transport hub | **done** (feature agent B) | 100E special-ticket warning (est 2,500 HUF, unverified badge); ticket table (NULLs as "—" + verify); calculator; anchors; modes; validation explainer |
| T-023 | Polls | **done** (feature agent C) | Composer (2–5 options, deadline, quorum, anonymity); one-vote upsert; lazy `close_expired_polls()` reconcile; decision log; idempotent convert→itinerary_item; WhatsApp share |
| T-024/T-032/T-033 | Media wall | **done** (feature agent C) | Client compression (WebP 2048/thumb 400, EXIF stripped by re-encode); private bucket; signed-URL in-memory TTL cache (never persisted); grid + filters + viewer + likes/comments + private toggle + soft delete; photos only |
| T-025 | Magic-link ×5 real emails | **open — user** | Needs real inboxes (and possibly custom SMTP, doc 12 §2) |
| T-026 | PWA manifest + icons | **done** | manifest he/rtl/standalone/theme #0e7490; icons 192/512/maskable/apple-touch (zero-dep PNG encoder); e2e asserts manifest fields |
| T-027 | Service worker | **done** | Custom SW (~200 lines): versioned precache, SWR navigations → /offline fallback, cache-first static, network-first PostgREST GET, signed-URL evict on 400/403, auth/realtime network-only, SKIP_WAITING flow |
| T-028 | Offline outbox | **done** | Dexie (snapshots+outbox+today_plan); ordered idempotent replay (UUID PKs); Background Sync + online/visibility fallbacks; LWW updates; permanent failures surfaced; pending badge in /more |
| T-029 | FX cron | **done — live-verified** | `200 {ok:true,count:3}`; `exchange_rates` populated: HUF→ILS 0.00965 / EUR 0.00274 / USD 0.00318, source frankfurter.app (ECB), fetched_at stamped; no-secret → 401 |
| T-030 | Weather cron | **done** | Open-Meteo 16-day horizon clamp added (trip outside horizon → `200 count:0 reason:trip_outside_forecast_horizon` until 2026-09-20, then fills); stale-badge UI in place |
| T-031/T-034/T-035 | Feasibility/ICS/realtime | **done** | evaluateDayFeasibility + resolveNextUp (unit-tested vs doc examples); ICS builder (TZID wall-times, escaping, folding — unit-tested); realtime channel invalidates query keys per table |
| T-036/T-037 | Design pass + RTL audit | **done** | grep audits across all features: physical-direction utilities **0**, hardcoded Hebrew in TSX **0**, dangerouslySetInnerHTML **0** (theme bootstrap moved to static /theme-init.js); 4-state patterns + dark theme in components |
| T-038 | Acceptance vs doc 11 | **partial** | Global DoD technical items pass (gates below). Per-feature items needing a signed-in session or device → remaining UAT |
| T-039 | Airplane-mode UAT | **open — user** | Scripted in docs/11; requires 2 real devices |
| T-040 | RLS negative suite | **partial** | supabase/rls-tests.sql written (~60 assertions) but execution needs direct SQL access (**B3**); live probes: anon denial ✅, member-role read ✅, bucket privacy ✅ |
| T-041 | Real-data finalization | **open — user** | Accommodation booking (deadline 09-20!), Arkia arrivals, BKK prices, consular contacts — never fabricated |
| T-042 | Perf budgets | **partial** | Measured: SW precache ≈ **45 KB** (budget <2 MB ✅); First Load JS 102–254 KB/route. LCP/TTI/CLS require Lighthouse on an authenticated Today page — protocol below (**not claimed**) |
| T-043 | Freeze + member confirmation | **open — user** | Oct 2 |

## Verification evidence (2026-09-11)

```
pnpm lint   → 0 problems (0 errors, 0 warnings)
pnpm typecheck (tsc --noEmit, strict + noUncheckedIndexedAccess) → 0 errors
pnpm test   → 6 files, 39/39 passed (money incl. both documented settlement examples,
              masking snapshots 1385•••93 / 4210•••••06, maps-link parsing + param
              stripping, tz math incl. IZ291/IZ292 instants, ICS, feasibility)
pnpm build  → ✓ compiled, 16/16 routes; /today 10.3 kB + 254 kB First Load JS
supabase db push → 16 migrations applied clean (one ordering fix: SQL helpers moved
              0001→0002; SQL function bodies validate referenced tables)
verify-seed.mjs → 11/11 counts OK + masked-ref scan of flight rows OK
Live DB: anon REST → denied (empty); publishable-key member read → 200; buckets private
Live cron: /api/cron/fx 200 (3 ECB rates stored); /api/cron/weather 200 (horizon-clamped)
Security scan: built .next output → zero full booking/serial identifiers; zero service-
              key/secret material in client bundle (publishable key present = by design)
Visual audit (Playwright, 360/390/768/1280px): RTL correct, bidi-correct numerals,
              LTR-isolated inputs, light+dark themes, auto-dark active at Budapest night,
              documented override wins until sunrise; auth gate redirects unauthenticated
```

## Performance measurement protocol (T-042 completion path)

- **Measured now**: SW precache ≈ 45 KB (icons 32 KB + prerendered HTML gzip ≈ 3 KB/page + manifest) — budget < 2 MB ✅. Per-route First Load JS from build output (max 254 KB) ✅ reasonable for mid-tier Android.
- **Pending deploy/auth**: Lighthouse (or web-vitals in-app) on `/today` cold, Moto G-class throttle (4G, 4× CPU): LCP < 2.5 s, TTI < 3.5 s, CLS < 0.1; expense-entry ≤ 15 s human; upload start ≤ 3 s. **Not claimed without these measurements.**

## Post-deploy debugging round (2026-09-11, after first user sign-in attempt)

| # | Symptom | Root cause | Fix | Verified |
|---|---|---|---|---|
| D1 | Console: script MIME/redirect errors on /login | `theme-init.js` not excluded from auth middleware → script request 307ed to /login HTML | middleware matcher + PUBLIC_PATHS exclusions | curl: 200 application/javascript ✓ |
| D2 | Email link redirected to site root, not /auth/callback | `emailRedirectTo` not in Supabase redirect allowlist → fell back to Site URL (user had set Site URL to `http://localhost:3000/**`) | `/?code=` forwarding added to root page; **user must set Site URL = https://medbadboys.vercel.app** and keep both Redirect URLs | pending user config |
| D3 | POST /auth/v1/otp → 429 | Supabase built-in SMTP per-email rate limit | wait/reset window; **custom SMTP recommended before onboarding 3 more members** (doc 12 §2) | expected |
| D4 | Authenticated pages 500 (PGRST200) | `profiles(full_name)` embed from trip_members — FK goes via auth.users, invisible to PostgREST | two-step fetch (members then profiles) in lib/data/trip.ts + today.ts | 12/12 pages render authed ✓ |
| D5 | /money 500 (42703 column "net" does not exist) | doc 03 §8 suggest_settlements referenced `net`; view column is `net_base_huf` (doc bug, plpgsql validates at first execution) | migration 0017 + doc 03 §8 corrected | /money renders ✓ |
| D6 | /media 404 for authed users in production only | **.gitignore `media/` pattern matched ANY media dir** — app/(app)/media/ + components/feature/media/ were never committed | pattern root-anchored to `/media/`; hidden files committed | /media renders ✓ |
| D7 | Intermittent chrome-error right after login | middleware redirect authed-/login→/today alternated with transient getUser() failure → redirect loop | removed authed-/login redirect from middleware (login page effect handles it) | login lands on /today ✓ |
| D8 | SW FetchEvent network-error noise | SW responded to non-follow-redirect requests | SW guard: only navigations get non-follow handling | fixed in sw.js |

Final state: **12/12 authenticated pages render on production (today/route/map/money/flights/stay/transit/checklists/media/safety/decisions/more), zero 4xx/5xx in sweep.** Verification method: admin generate_link → real browser session → page sweep (scripts preserved in git history).

## Blockers register

| # | Blocker | Evidence | Needs | Independent work status |
|---|---|---|---|---|
| ~~B1~~ | ~~Vercel deploy~~ | resolved 2026-09-11 | — | cleared |
| B2 | Real-device UAT (T-039) + member onboarding (T-025) | — | 2 phones + 5 member inboxes; Supabase Auth URL config must allow `http://localhost:3000/**` + `https://<vercel-domain>/**` | App fully built; UAT script ready |
| B3 | RLS SQL suite execution (T-040) | CLI 2.108 has no arbitrary-SQL command; no DB password | DB password (`supabase db execute`-style via psql) or run `supabase/rls-tests.sql` in the dashboard SQL editor (header documents setup) | Anon/member/bucket probes done live; full 2-user suite pending |
| B4 | Weather forecast horizon | Open-Meteo serves ≤16 days; trip (Oct 4–8) out of range until 2026-09-20 | None (self-resolving; cron clamps and fills automatically) | Resolved by design |

## Deferred (documented cut list + agent-verified simplifications)

- Offline **voting** (votes composite-unique not outbox-safe; disabled with Hebrew "needs connection" when offline), offline **status changes** on itinerary items (notes/notes only), offline **media upload** queue (needs `outbox_media` blob store — docs/07 lead task)
- sha256 duplicate-photo flow (hash stored; "already on the wall" UX unwired)
- HEIC→WebP server-side conversion Edge Function (falls back to visible original upload)
- Upload progress = indeterminate ring (supabase-js lacks XHR progress)
- Boarding-pass upload, quiet-hours local notifications, note emoji reactions, readiness presence, bulk multi-line place import, per-transfer "mark paid" accounting (owner bulk-settle only)
- Checklist per-member expansion on signup (items are claimable; assignee filters work after assignment)
- Checklist scope-RLS hardening (personal/assigned enforced app-layer; DB uses member pattern — flagged in docs/03 §13)
- `emergency_profiles` cross-member reads route through the logging server action; enforcement-by-Edge-Function is a hardening task
- Manual FX override table rows (RLS is service-write-only by design; per-expense `fx_rate_used` provenance used instead)

## Human verification tasks (never fabricated)

- [ ] **Book accommodation by 2026-09-20** → enter in /stay (owner: Yakir)
- [ ] Verify IZ291/IZ292 arrival times + online check-in window (Arkia) → update flight rows
- [ ] Verify BKK/100E prices on bkk.hu → update transit_tickets (verified=true + last_verified_at)
- [ ] Verify consular contacts vs MFA ≤7 days before departure
- [ ] Verify Hungarian emergency phrases (draft is machine-translated, labeled)
- [ ] Roei accept/decline → allowlist status update
- [ ] Magic-link delivery test for all 5 emails (T-025); configure custom SMTP if rate-limited
- [ ] Supabase Auth → URL Configuration: add `https://medbadboys.vercel.app/**` (localhost already added) — REQUIRED before magic links work from production
- [ ] Rotate sb_secret/service-role keys (exposed in chat) and update .env.local + Vercel
- [ ] Each member: insurance + (optional) medical profile + passport scan via the app (PRIVATE paths only)

## 2026-09-13 — Premium rebuild, Phase 1

- Rebuilt the global live header and floating bottom navigation; fixed the
  page-header/sub-tab sticky collision and AppHeader horizontal overflow.
- Added draggable persisted travel bubble and unified `/travel` flight/stay hub.
- Added left-side group-chat/search drawer, private attachment storage, Realtime
  messages, and authenticated `/api/trip-search` with web citations and Places save.
- Fixed private profile column exposure with explicit column grants and a
  self-only security-barrier view; ProfileMenu now reads that view.
- Applied previously missing migrations `0018`–`0026` to the linked Supabase
  project. A follow-up dry run reports the remote schema is up to date.
- Green: typecheck, lint, 120 unit tests, production build (17 routes), 16/16
  mobile Playwright tests, and seed verification. `OPENAI_API_KEY` is not yet
  configured locally, so the AI pane intentionally returns its explicit
  unavailable state until the server-only key is added locally and in Vercel.
  Migration 0026 temporarily preserves the old production ProfileMenu read;
  re-apply the narrow 0025 grants in a coordinated code deployment.

### Desktop interaction repair pass

- Replaced the desktop profile bottom sheet with an anchored, independently
  scrollable popover; mobile retains the touch-friendly bottom sheet.
- Reworked the travel bubble gesture state: an 8px drag threshold prevents
  pointer jitter from cancelling clicks, keyboard/click activation uses the
  native click path, and a new persisted-position version places the default
  beside the centered app on desktop.
- Removed global smooth scrolling, clipped horizontal overflow at the document
  and shell boundaries, and added a reference-counted dialog scroll lock so
  stacked overlays cannot leave the document frozen.
- Split the realtime/search drawer into a lazy client chunk. Bottom navigation
  prefetches its four primary destinations after hydration and exposes an
  immediate pending state while a route is resolving.
- Development mode unregisters a worker left by a previous local production
  preview, preventing stale shell assets from masking current UI fixes.
- Verified: typecheck, lint, 120/120 unit tests, production build, and 16/16
  Playwright tests against `next start`. The local `next dev` server was then
  restored and health-checked on port 3000.

### Console-error repair

- Removed the live-clock hydration mismatch by rendering a deterministic clock
  placeholder on both SSR and the first client pass, then starting the clock
  immediately after hydration.
- Upgraded the Dexie database to version 2 with the missing `outbox.table`
  index. The upgrade is in place and preserves queued offline operations.
- Added rejection handling around outbox/split reconciliation and corrected the
  visibility listener cleanup so development refreshes do not accumulate sync
  handlers.

### Premium rebuild, product slices 2–5

- Our Day: client-only schedule/discover/map switching, Next-prefetched day
  links, deferred map/place loading, optimistic accessible drag ordering, and
  parallel reorder persistence.
- Lists: instant URL-backed life-phase/filter switching, phase icons, and one
  fewer Supabase request per board refresh.
- Money: replaced ambiguous balance/stat labels with explicit payer/debtor
  language and enabled incremental offscreen ledger rendering.
- Memory Wall: moved upload metadata from the always-open page body into a
  dedicated bottom drawer, corrected its sticky control offset, and enabled
  progressive masonry rendering.

### Places library persistence and enrichment repair

- Fixed a production-schema mismatch that caused the redesigned place form to
  write a nonexistent `places.address_text` column. Additive migration
  `20260913090000_places_contact_details.sql` adds constrained address and phone
  fields and is applied to the linked Supabase project.
- Place queries and edit state now round-trip raw type, full address, phone,
  cover image and opening-hours note. Editing retains status and suggester;
  opening another record starts with clean state.
- `/api/scrape` parsing now supports nested schema.org `@graph`, explicit place
  type inference, phone and price-range hints. The UI records the returned
  source and exact fetch timestamp, labels nonnumeric price hints, and requires
  user confirmation before saving.
- Green at the full gate: typecheck, lint, 122/122 unit tests (including 5
  scraper tests), seed verification, migration dry-run/apply, a live remote
  query of the new columns, production build, and 16/16 Playwright tests.
- A separate authenticated desktop audit exercised create → detail → edit,
  verified the persisted address/phone values and zero console errors, then
  deleted its exact test row. Supabase Advisors also exposed and drove the
  `v_profile_private` security-invoker repair
  (`20260914104229_fix_profile_view_security_invoker.sql`); security advisors
  now return zero error-level findings.
- Deployment coordination adds `get_my_private_profile()` as a self-only RPC
  (`20260914105540_profile_private_rpc.sql`). The new ProfileMenu reads the RPC;
  after frontend revision `b8d50a6` was confirmed live,
  `20260914110335_finalize_profile_private_grants.sql` removed the broad
  compatibility grant and revoked access to the superseded view.
