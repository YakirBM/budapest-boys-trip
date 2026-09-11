---
id: production-hardening-feature-upgrade
title: Production Hardening and Feature Upgrade Execution Plan
status: approved-in-progress
owner: Yakir
approved_at: 2026-09-11
last_updated: 2026-09-11
baseline_commit: a7a5032d1727e1793817d462b3bcc873b141312c
depends_on:
  - 02-architecture
  - 03-data-model-and-rls
  - 04-security-and-privacy
  - 05-ui-ux-design-system
  - 07-pwa-and-offline
  - 11-acceptance-criteria
---

# Production Hardening and Feature Upgrade Execution Plan

This document is the durable execution record for the production upgrade requested on
2026-09-11. It is intentionally detailed so another coding agent can continue from the exact
last verified checkpoint without relying on chat history.

The plan is approved. Implementation must follow the phase order and update the checkboxes,
checkpoint log, changed-files list, migrations, verification evidence, and next action before
ending every work session.

## 1. Requested outcomes

1. Only these five email addresses may create or access an account:
   - `yakir.b.m.ite@gmail.com`
   - `aharonml123@gmail.com`
   - `jonatannheh@gmail.com`
   - `barjohan25.11@gmail.com`
   - `roeiduv@gmail.com`
2. Yakir is owner; Aharon, Yehonatan, and Bar are active members. Roei is allowed to sign in but
   remains `pending`: read access is allowed and writes remain blocked until a later explicit
   decision promotes him to `active`.
3. Navigation and page transitions must feel fast and continuous on a mobile device.
4. The Money feature must be correctly sized and laid out at narrow mobile widths and while
   scrolling.
5. The Map tab must show a real, interactive Budapest map with place and transit markers,
   selection details, location support, distances, time estimates, and navigation links.
6. Media must be storage-efficient and support useful organization: title/rename, albums,
   people, places, tags, day, search, filters, and editing.
7. The visual language and profile presentation may draw from the local reference demo at
   `C:\Users\yakir\Downloads\budapest-trip-companion-pwa (1)`, while retaining this repository's
   production architecture, Supabase identity, RLS, offline support, and i18n rules.

## 2. Explicit scope and non-goals

### In scope

- Additive, production-safe schema changes and RLS.
- Auth allowlist verification and regression coverage.
- Performance measurement and removal of avoidable request, render, and bundle costs.
- Responsive redesign of Money and its sheets/forms.
- A real map rendered from free map tiles, with attribution and graceful offline fallback.
- Clearly labelled calculated distance/time estimates. No invented live data.
- Expanded photo metadata, virtual albums, editing, filtering, search, and member/place tagging.
- Client-side image re-encoding, thumbnail creation, metadata stripping, upload progress, and
  bounded concurrency.
- A cohesive visual refinement informed by the demo.
- Tests, documentation, Supabase advisors, production build, and mobile visual verification.

### Not in scope

- Paid map APIs or services requiring a billing account.
- Real-time road traffic or guaranteed live public-transport arrival times.
- Video upload or transcoding.
- Physical storage folders that require moving objects when an album changes. Albums are
  database metadata; storage object paths remain stable.
- Replacing Supabase, Next.js App Router, Tailwind, TanStack Query, IndexedDB, or the current PWA
  architecture.
- Copying the demo's Drizzle database, local identity cookie, hardcoded Hebrew strings, or
  Framer Motion dependency.
- Deleting existing production data.
- Committing, pushing, or deploying unless the user explicitly requests it in the active turn.

## 3. Confirmed baseline and diagnosis

Baseline branch: `main`  
Baseline commit: `a7a5032d1727e1793817d462b3bcc873b141312c`  
Supabase project: `zgvpchdqudheiohlrrvm`  
Production URL: `https://medbadboys.vercel.app`

### 3.1 Authentication baseline

- [x] `public.allowed_emails` contains exactly the five requested addresses.
- [x] `auth.users` contains only Yakir at the inspection checkpoint.
- [x] `enforce_allowed_email_before_insert` exists on `auth.users` and calls
  `public.enforce_allowed_email()` before user creation.
- [x] The trigger compares email case-insensitively.
- [x] `allowed_emails` has RLS enabled and no client policies, so members cannot enumerate it.
- [x] Roei is allowlisted with `member_status = 'pending'`.
- [x] Existing transaction-safe RLS test proves a sixth address cannot be created.
- [x] Existing trigger tests cover the five allowlisted identities and case-insensitive enforcement.
- [x] Function grants and `search_path` rechecked and hardened with the security advisor.

No auth redesign is required. The server-side database trigger is already the durable enforcement
boundary. Do not replace it with a client-only check. A neutral login response must remain so an
attacker cannot enumerate allowed addresses.

### 3.2 Performance baseline

- All protected navigations pass through middleware and call Supabase Auth.
- Multiple pages are explicitly dynamic and issue several RLS-scoped queries on every server
  navigation.
- Some pages repeat identity/member reads and then refetch similar payloads after hydration.
- Several client feature files are large monoliths (`MediaView`, `MoneyView`, `ExpenseForm`,
  `ChecklistsView`, `DecisionsView`), increasing parse and rerender cost.
- Bottom navigation uses Next `Link`, but there is no explicit route warm-up or shared transition
  feedback.
- The Supabase project is in `ap-southeast-2`; deployment/function placement and real request
  timings must be measured before choosing a Vercel function region.
- Existing IndexedDB snapshots and TanStack Query caching must be preserved.

Do not claim the geographic distance is the sole cause until measurements compare the relevant
deployment options. Optimize waterfalls and duplicate work first, then validate region placement.

### 3.3 Money baseline

- The feature is functionally rich, but narrow screens use several dense fixed four-column grids.
- Currency/category/split controls, numeric inputs, member rows, and settlement rows require
  verification at 320, 360, 390, 412, and 430 CSS pixels.
- The screen must retain quick entry, offline outbox behavior, RLS, settlement confirmation, and
  source/verification metadata for exchange rates.

### 3.4 Map baseline

- The current `MapView` is explicitly a schematic square with normalized marker coordinates.
- It renders no geographic tiles and provides no pan, zoom, user location, distance, or time
  calculation.
- Existing place and transit anchor records already contain coordinates for many entries.
- Existing Google Maps deep links are useful and must remain as the reliable navigation handoff.
- Offline mode currently has a safe schematic/list fallback; the replacement must retain a useful
  list when tiles are unavailable.

### 3.5 Media baseline

- Client processing already targets a 2048 px WebP derivative and a 400 px thumbnail.
- Canvas re-encoding strips embedded EXIF/GPS metadata.
- Current decode failure returns and uploads the original file. This can consume excess storage and
  may preserve sensitive metadata; it must no longer silently upload the untouched original.
- Schema already includes `day_number`, `linked_place_id`, `tagged_member_ids`, `caption`, dimensions,
  hashes, original/stored MIME and byte counts.
- Missing product capabilities include a human title, albums, general tags, full metadata editing,
  combined search, rich filters, and clear compression savings.
- Signed URL batching, private buckets, RLS, and short TTLs must remain.

## 4. Approved architecture and decision log

| ID | Decision | Alternatives considered | Reason |
|---|---|---|---|
| D1 | Upgrade the existing application in ordered phases. | Transplant the demo; rebuild around the demo. | Lowest data/security risk and preserves working production flows. |
| D2 | Keep the database trigger as the auth allowlist boundary. | Client check; email-domain rule; custom external auth hook. | Exact-address matching is already deployed, server-side, case-insensitive, and private. |
| D3 | Keep Roei allowlisted but `pending`. | Block signup; make active immediately. | User confirmed entry permission, not write permission. |
| D4 | Use real free map tiles with attribution and lazy-load the map implementation. | Static schematic; paid Google/Mapbox SDK. | Meets the visual map requirement without billing and avoids loading map code on unrelated pages. |
| D5 | Keep Google Maps/Waze/Apple deep links as the final navigation path. | Build full turn-by-turn navigation. | Reliable device-native navigation is outside the app's scope. |
| D6 | Treat displayed travel times as labelled estimates unless sourced from a verified routing service. | Present estimates as live facts. | Project hard rule forbids invented or unverifiable dynamic data. |
| D7 | Albums are virtual DB groupings, not storage-path folders. | Move storage objects when reorganizing. | Stable signed paths, fewer failure modes, and cheap metadata edits. |
| D8 | Reject an image when safe re-encoding fails; never silently upload an untouched fallback. | Upload original fallback. | Protects storage and strips sensitive metadata consistently. |
| D9 | Draw visual inspiration from the demo but do not copy its identity/data architecture. | Copy entire components and dependencies. | Demo identity is not secure and its hardcoded content violates project rules. |
| D10 | Use sparse CSS motion and route feedback; do not add Framer Motion. | Add demo dependency. | Lower bundle cost and respects reduced-motion preferences. |

## 5. Design direction

### 5.1 Aesthetic thesis

Name: **Warm Urban Field Journal**. The app should feel like a compact shared travel notebook,
not a generic SaaS dashboard. Use the demo's warm paper surface, deep ink, Budapest teal, paprika,
gold accents, expressive member avatars, dense but legible cards, and strong Hebrew typography.

Differentiation anchor: a persistent trip/member identity strip paired with day-coloured map and
content markers. A screenshot without the logo should still look like this group's Budapest field
journal.

DFII score: 13/15.

- Aesthetic impact: 4/5
- Context fit: 5/5
- Implementation feasibility: 5/5
- Performance safety: 4/5
- Consistency risk: 5 points deducted

### 5.2 Design constraints

- Keep all colours as CSS variables.
- Keep Hebrew UI copy in `messages/he.json` or the relevant feature message file.
- Use logical RTL spacing and positioning except geographic map coordinates.
- Every interactive target is at least 48 × 48 CSS pixels.
- Avoid decorative animation loops. Respect `prefers-reduced-motion`.
- Avoid layout-affecting font swaps and cumulative layout shift.
- Preserve light/dark theme support.
- Mobile-first at 320 px; desktop remains a centered companion-app column unless a feature needs a
  wider responsive surface.

## 6. Execution phases

The phases are ordered by dependency. Do not start a later schema-dependent feature before its
migration and policies pass. It is acceptable to make small shared UI changes while working on a
phase, but update this document.

### Phase 0 — Baseline, documentation, and measurements

Status: **COMPLETE EXCEPT AUTHENTICATED VISUAL BASELINE**

- [x] Record baseline commit, branch, project, and production URL.
- [x] Inspect repository, relevant docs, reference demo, live allowlist, auth users, migrations, and
  tables.
- [x] Record the approved approach and decisions in this document.
- [x] Confirm the starting worktree was clean before implementation changes.
- [x] Run and record baseline `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [x] Record `.next` route sizes/build output.
- [ ] Measure authenticated production navigation on a mobile viewport if a reusable test session
  is available; otherwise measure locally and mark the production authenticated measurement as a
  manual follow-up.
- [ ] Capture Money screenshots at 320 × 568, 360 × 800, 390 × 844, and 430 × 932.
- [ ] Capture current Map and Media screens for comparison.
- [ ] Record console errors and request waterfalls.

Exit gate: baseline checks and known pre-existing failures are written in the checkpoint log.

### Phase 1 — Allowlist hardening and regression coverage

Status: **IMPLEMENTED AND REVIEWED; MANUAL IDENTITY RUNS PENDING**

Primary files:

- `supabase/migrations/0013_auth_triggers.sql`
- `supabase/migrations/0014_seed_structural.sql`
- `supabase/rls-tests.sql`
- `scripts/verify-seed.mjs`
- `app/(auth)/login/login-form.tsx`
- `docs/04-security-and-privacy.md`
- `docs/09-import-and-seed.md`

Tasks:

- [x] Query production and assert exactly five `allowed_emails` rows.
- [x] Query production and assert no unknown `auth.users` rows.
- [x] Inspect and restrict execute grants for `enforce_allowed_email` and `handle_new_user`.
- [x] Keep `allowed_emails` invisible to `anon` and `authenticated`.
- [x] Review transaction-safe positive/negative auth-trigger tests already in `supabase/rls-tests.sql`.
- [x] Verify case-insensitive matching in the trigger implementation.
- [x] Verify the negative stranger-insert assertion exists in the RLS test transaction.
- [x] Verify Roei is allowlisted as `pending`; manual sign-in/write UAT remains pending.
- [x] Keep neutral login copy and error handling to prevent allowlist enumeration.
- [x] Run Supabase security advisor and remediate anonymous function execution/search-path findings.

Schema rule: do not create a new allowlist table or expose an allowlist-check RPC. If a migration is
needed, create it using `supabase migration new <name>` and keep it idempotent. Do not delete auth
users; report any unknown account before taking destructive action.

Exit gate: five positive identities and one negative identity are covered, production rows match,
and security advisor has no new allowlist/RLS regression.

### Phase 2 — Navigation and performance hardening

Status: **IMPLEMENTED; PRODUCTION TIMING PENDING DEPLOYMENT**

Primary files likely involved:

- `middleware.ts`
- `lib/supabase/middleware.ts`
- `lib/supabase/server.ts`
- `lib/data/trip.ts`
- `lib/queries/realtime.tsx`
- `components/layout/BottomNav.tsx`
- `app/(app)/layout.tsx`
- `app/(app)/loading.tsx` (new if needed)
- feature page/data loaders identified by the trace
- `public/sw.js`
- `next.config.ts`
- `vercel.json`

Measurement-first tasks:

- [ ] Instrument or inspect server timings for middleware auth, RSC payload, and Supabase queries.
- [ ] Count requests during Today → Route → Map → Money → More and back.
- [ ] Identify duplicate session/member/trip/data fetches.
- [ ] Compare current Vercel execution placement with Supabase `ap-southeast-2` latency.
- [ ] Do not change Vercel region without before/after evidence.

Implementation candidates, applied only where measurements support them:

- [x] Deduplicate per-request server identity and shared lookups with `React.cache()`.
- [ ] Parallelize independent queries and remove sequential waterfalls.
- [ ] Select only columns rendered by each screen.
- [ ] Reuse stable TanStack Query payloads; avoid immediate hydration refetch when initial data is
  fresh.
- [ ] Use primitive realtime invalidation keys and avoid global unnecessary refetches.
- [x] Explicitly prefetch the five bottom-nav routes during pointer/focus/touch intent.
- [x] Add a compact route-transition skeleton that preserves the app shell and nav.
- [x] Split the heavy MapLibre renderer with `next/dynamic` and route-local CSS.
- [ ] Break large client components into memoizable leaves only where profiler evidence shows value.
- [x] Verify the service worker never caches authenticated HTML but still supports the offline data
  pack and static assets.
- [ ] Validate cache version activation and no redirect/cookie regression.
- [ ] If evidence supports it, pin Vercel functions to the closest effective DB region and record the
  user-to-edge tradeoff.

Performance acceptance:

- [ ] LCP Today cold, throttled mobile: < 2.5 s where network geography permits.
- [ ] TTI: < 3.5 s.
- [ ] CLS: < 0.1.
- [ ] Warm bottom-nav transition shows feedback in < 100 ms.
- [ ] Warm destination content target: < 800 ms; record actual p50/p95.
- [ ] No duplicate feature payload request immediately after hydration without a stale trigger.
- [ ] Service worker precache remains < 2 MB.
- [ ] Zero auth redirect loops and zero stale-build asset failures.

Exit gate: before/after timings, request counts, and screenshots are recorded; all automated checks
pass.

### Phase 3 — Money mobile layout and interaction redesign

Status: **LAYOUT IMPLEMENTED; VISUAL MATRIX PENDING AUTHENTICATED SESSION**

Primary files:

- `components/feature/money/MoneyView.tsx`
- `components/feature/money/ExpenseForm.tsx`
- `components/feature/money/ConverterSheet.tsx`
- `components/feature/money/visuals.tsx`
- `messages/he/money.json`
- shared BottomSheet/Card/MoneyAmount primitives if required

Tasks:

- [ ] Inventory every card/control at 320, 360, 390, 412, and 430 px.
- [x] Ensure affected flex/grid children that may shrink use `min-width: 0`.
- [x] Replace four-column controls that cannot fit at 320 px with a 2 × 2 grid or accessible
  horizontal segmented scroller.
- [x] Keep currency codes and numeric values LTR/tabular while labels and layout remain RTL.
- [x] Prevent amount, currency, payer, member, and settlement rows from overlapping.
- [ ] Make long names truncate with an accessible full label.
- [ ] Keep primary totals above the fold without crowding.
- [ ] Keep expense entry completable in no more than 15 seconds on a phone.
- [x] Ensure sheets respect dynamic viewport height, keyboard, safe areas, and internal scroll.
- [ ] Keep submit actions reachable while the soft keyboard is open.
- [ ] Verify empty, loading, error, offline, queued, and settled states.
- [ ] Apply the approved warm field-journal styling without harming contrast.

Tests:

- [x] Unit tests for money calculations remain unchanged/passing.
- [ ] Component/E2E tests cover open form, select category/currency/payer/split, save, settle, and
  delete confirmation.
- [ ] Screenshot assertions or manual visual matrix shows no horizontal page overflow.
- [ ] `document.documentElement.scrollWidth <= clientWidth` at all required widths.

Exit gate: no clipping/overflow at the viewport matrix, offline entry still queues, and the full
money flow passes.

### Phase 4 — Real interactive map

Status: **IMPLEMENTED; INTERACTIVE DEVICE UAT PENDING**

Primary files:

- `app/(app)/map/page.tsx`
- `components/feature/map/MapView.tsx`
- new isolated map renderer module loaded dynamically
- `lib/data/route.ts`
- `lib/utils/deeplinks.ts`
- `messages/he/map.json`
- `next.config.ts` CSP
- `docs/06-features/01-route-and-places.md`
- `docs/08-integrations-and-apis.md`

Provider/design rules:

- Use a free tile source that permits this low-volume private use and display mandatory
  attribution.
- Keep provider URLs and attribution in one configuration module.
- Do not expose a secret key in `NEXT_PUBLIC_*`.
- Lazy-load the map library only on `/map`.
- Map tiles are an online enhancement. Offline fallback is the cached place list and last-known
  metadata, not bulk offline tile scraping.

Functional tasks:

- [x] Render geographic Budapest tiles with pan, pinch zoom, zoom controls, and correct orientation.
- [x] Fit the initial camera to valid place/anchor markers; use a Budapest default when empty.
- [x] Render distinct place day markers and transit anchor markers.
- [ ] Cluster or declutter overlapping markers at low zoom.
- [ ] Tap marker → accessible place card/sheet with name, category, day, verification state, cost,
  address/district, and navigation action.
- [x] Add layer controls for places, transit anchors, and current location.
- [x] Request geolocation only after an explicit user action.
- [x] Show current-location marker only for the current session; do not persist precise position.
- [x] Calculate straight-line distance locally using Haversine.
- [x] Display walking time only as a clearly labelled estimate with the documented speed
  assumption unless a verified routing response is available.
- [x] Keep existing Google Maps navigation deep links actionable.
- [x] Preserve places without coordinates in a list.
- [x] Render a clear offline state without crashing; explicit tile-error messaging still pending.
- [x] Update CSP for the exact selected tile host and nothing broader.

Data accuracy:

- [ ] Validate all seeded coordinates fall within plausible Budapest bounds.
- [ ] Flag rather than silently render invalid coordinates.
- [ ] Every distance/time value identifies its calculation/source and timestamp where dynamic.
- [ ] Do not label traffic, transit, or travel estimates as live.

Performance/accessibility:

- [x] Map code/CSS is isolated to the map route and lazy-loaded.
- [x] Map becomes interactive without blocking bottom navigation.
- [x] Marker controls have accessible names and keyboard focus.
- [x] A non-map list offers equivalent place selection/navigation.
- [x] Attribution remains visible.

Exit gate: real tiles and markers work on mobile, geolocation is opt-in, offline fallback works, CSP
is narrow, and non-map bundles do not include the map library.

### Phase 5 — Media library, organization, and compression hardening

Status: **CORE IMPLEMENTED; UAT AND ADVANCED QUEUE FEATURES PENDING**

Proposed additive schema:

1. `media_albums`
   - `id uuid primary key`
   - `trip_id uuid not null`
   - `name text not null`
   - `description text`
   - `cover_media_id uuid null` (add after both tables exist or manage safely)
   - `created_by uuid not null`
   - timestamps
   - unique normalized name per trip where practical
2. `media_items` additions
   - `title text`
   - `original_filename text` (basename only; never a local path)
   - `album_id uuid null references media_albums(id) on delete set null`
   - `tags text[] not null default '{}'`

Do not add duplicate member/place columns: reuse `tagged_member_ids` and `linked_place_id`.

Migration/RLS tasks:

- [x] Create the migration with `supabase migration new media_library_metadata`.
- [x] Apply compatible additive migrations to production via Supabase MCP.
- [x] Add indexes for album/place and GIN tags, plus covering creator/reaction foreign-key indexes
  justify it.
- [x] Enable RLS on `media_albums` immediately.
- [x] Members may read albums for trips they belong to.
- [x] Active members may create/update/delete their own albums.
- [x] Existing private/group media visibility rules remain unchanged.
- [x] Update media item policies for uploader metadata edits without allowing uploader reassignment.
- [ ] Add RLS tests for pending Roei, active member, uploader, co-member, owner, and anonymous user.
- [x] Run security and performance advisors after DDL.
- [x] Update canonical schema documentation.

Upload pipeline tasks:

- [x] Remove silent untouched-original fallback.
- [x] Decode, orient, re-encode, and strip metadata before any upload.
- [x] Generate 2048 px WebP main derivative and 400 px WebP thumbnail.
- [x] Reject unsupported/undecodable images with a useful Hebrew error.
- [x] Never upload an original solely to preserve EXIF/location.
- [x] Cap input at 15 MB and enforce an 8 MB output-size sanity limit.
- [x] Process/upload at bounded concurrency (two files) to avoid mobile memory spikes.
- [ ] Show per-file states: queued, compressing, uploading, saved, failed, retry.
- [ ] Show original bytes, stored bytes, and percentage saved after success.
- [x] Compute SHA-256 after compression and retain duplicate detection.
- [x] Clean up exact newly uploaded object paths if metadata registration fails.

Library UX tasks:

- [ ] Upload form supports title, caption, day, album, place, people, tags, and visibility.
- [ ] Default title derives from caption or a localized date label, never exposes device paths.
- [x] Add edit sheet for rename/title, caption, album, place, people, tags, and day; visibility remains
  in the adjacent viewer control.
- [x] Add album creation and album filter; albums act as virtual folders.
- [x] Add client search over title, caption, tags, tagged people, place, and album (dataset capped at
  240 rows; debounce is unnecessary at this scale).
- [ ] Add filters: day, album, uploader/person, place, tag, visibility, and favourites/likes where
  supported.
- [ ] Add sort: newest, oldest, day, and title.
- [x] Keep a two-column narrow-mobile masonry/grid with predictable aspect ratio placeholders.
- [x] Use thumbnail signed URLs in the grid and full derivative only in detail view.
- [x] Keep likes/comments and private visibility semantics.
- [ ] Add clear empty results and reset-filter actions.
- [ ] Do not display private item metadata to non-owners when the media row itself is private.

Exit gate: compression never silently leaks originals, organization/search/editing work, signed
URLs remain private, RLS passes, and upload start stays under the existing 3-second target where
the device can encode the selected image.

### Phase 6 — Shared profile and visual refinement

Status: **NOT STARTED**

- [ ] Reuse authenticated Supabase profile identity; never add the demo's local identity picker.
- [ ] Add a compact current-member profile/avatar affordance to the header or More screen.
- [ ] Show active/pending state clearly without exposing email addresses in shared views.
- [ ] Allow only self-owned profile fields to be edited under existing RLS.
- [ ] Use initials and deterministic member colours from one shared mapping.
- [ ] Apply field-journal tokens consistently across Header, Card, BottomSheet, Money, Map, Media,
  and More.
- [ ] Keep visual changes restrained and measure bundle/paint impact.
- [ ] Verify contrast, focus, reduced motion, dark theme, RTL, and 48 px touch targets.

Exit gate: identity is secure and clear, visual language is cohesive, and no demo-only insecure
identity mechanism is present.

### Phase 7 — Full verification and release preparation

Status: **NOT STARTED**

Automated checks:

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [ ] relevant Playwright E2E tests
- [x] `node scripts/verify-seed.mjs`
- [ ] RLS test suite with direct SQL access
- [x] Supabase security advisor
- [x] Supabase performance advisor
- [ ] secret scan/manual sensitive-value scan

Manual/visual checks:

- [ ] Login with an allowlisted active email.
- [ ] Login with Roei and confirm read-only pending behavior.
- [ ] Reject a non-allowlisted email without revealing allowlist membership.
- [ ] Navigate all bottom tabs repeatedly on throttled mobile.
- [ ] Money viewport matrix and keyboard-open form.
- [ ] Map pan/zoom/marker/location/route-estimate/deep-link/offline/error states.
- [ ] Media upload/edit/search/filter/album/private/group/duplicate/failure flows.
- [ ] Dark and light themes.
- [ ] Airplane-mode UAT from `docs/11-acceptance-criteria.md`.
- [ ] No horizontal overflow, console errors, hydration errors, or CSP violations.

Release rule:

- Do not commit, push, modify GitHub, or deploy merely because Phase 7 passes. The repository rule
  requires an explicit user instruction for commit/push/deploy. Leave a clean, reviewable worktree
  summary and exact recommended commit message.

## 7. Test matrix

| Area | Unit | Integration | E2E/manual | Security |
|---|---|---|---|---|
| Allowlist | case normalization | trigger create/reject | five allowed + one denied | no enumeration; table invisible |
| Navigation | cache key helpers | query hydration/realtime | repeated tab loop | auth cookie/redirect |
| Money | conversion/splits/settlement | offline outbox | mobile entry and settlement | RLS ownership |
| Map | Haversine/time estimate | marker data mapping | tiles, selection, geolocation | CSP; no location persistence |
| Media | validation/search/filter | upload/register/edit | phone multi-upload | RLS, signed URLs, EXIF strip |
| Profiles | initials/colour | self-update | pending/active display | self-only writes |

## 8. Failure handling and rollback

### Database

- Prefer additive columns/tables and nullable foreign keys.
- Never edit an already-applied migration.
- For every migration, record forward SQL, compatibility expectation, and a manual rollback plan.
- Do not drop existing columns during this project.
- If DDL fails, stop after two distinct attempts, inspect the error/advisors, and revise the SQL.

### Frontend

- Keep the existing schematic/list map available as an offline/error fallback until the real map is
  verified.
- Keep existing Money calculations and actions; replace layout incrementally.
- Keep old media rows valid when new metadata is null.
- Feature components must tolerate migration lag only during local development; production deploy
  must occur after compatible schema is applied.

### Storage

- Never recursively delete bucket objects.
- A failed new upload may delete only the exact object paths created by that same attempt.
- Soft-deleted historical media remains recoverable under the existing retention model.

## 9. Handoff protocol for another agent

Before another agent changes code, it must:

1. Read `AGENTS.md` completely.
2. Read this document completely.
3. Read the docs and feature specs referenced by the current phase.
4. Run `git status --short` and preserve unrelated/user changes.
5. Read the latest entry in the checkpoint log below.
6. Verify the current Supabase migration list before creating or applying DDL.
7. Resume the first unchecked task in the active phase unless the checkpoint explicitly names a
   different next action.
8. Use `apply_patch` for file edits and `pnpm`, never npm/yarn.
9. Update this document before ending the session.
10. Do not commit/push/deploy without an explicit current user request.

Every checkpoint entry must include:

- timestamp and agent/task identity if known;
- current branch and HEAD;
- phase and completed task IDs;
- files changed;
- migrations created/applied and target environment;
- commands/tests with pass/fail and key metrics;
- live changes made through MCP;
- unresolved risks/blockers;
- the exact next action.

## 10. Checkpoint log

### Checkpoint 0 — Plan created

- Timestamp: 2026-09-11 (Asia/Jerusalem)
- Branch/HEAD: `main` / `a7a5032d1727e1793817d462b3bcc873b141312c`
- Phase: 0 — baseline and planning
- Completed: repository/demo/schema inspection; live allowlist, users, trigger, migrations, and table
  inventory; approved approach and design direction documented.
- Files changed: this document; `AGENTS.md` documentation map entry.
- Database mutations: none.
- Production mutations: none.
- Known facts: exactly five allowlist rows; only Yakir exists in `auth.users`; Roei is pending; map
  is schematic; media compression has unsafe original fallback.
- Tests: not yet run for this upgrade.
- Blockers: authenticated production UI measurement requires an authenticated test session or a
  manual user-assisted run; this does not block local implementation.
- Exact next action: finish Phase 0 baseline commands and capture the pre-change build/test status,
  then begin Phase 1 allowlist regression verification.

### Checkpoint 1 — Core hardening and requested feature implementation

- Timestamp: 2026-09-11 11:34 (Asia/Jerusalem)
- Agent: primary Codex task (`/root`)
- Branch/HEAD: `main` / `a7a5032d1727e1793817d462b3bcc873b141312c`; worktree intentionally
  uncommitted because this turn did not explicitly authorize commit/push/deploy.
- Phases: 0 baseline complete except authenticated screenshots; 1 implemented/reviewed; 2 core
  request-path optimization implemented; 3 layout implemented; 4 map implemented; 5 core media
  library implemented; 6 not started; 7 automated verification mostly complete.
- Authentication/security:
  - Production contains exactly the five approved allowlist rows and no unknown auth user at the
    inspection checkpoint; Roei is `pending`.
  - Existing transaction-safe RLS tests cover five allowlisted identities, a stranger rejection,
    and pending/read-only behavior. They were reviewed but deliberately not run against production.
  - `20260911081016_harden_function_grants.sql` applied to production: auth trigger functions are
    restricted to `supabase_auth_admin`; exposed helpers are restricted to authenticated users;
    relevant function `search_path` values are pinned.
- Performance/application shell:
  - Middleware now uses locally verifiable `getClaims()` instead of a network `getUser()` call.
  - Server client/identity/trip/member lookups use per-request React caching.
  - Bottom navigation warms routes on pointer, focus, or touch intent; route loading skeleton added.
  - Service worker reviewed: authenticated navigation HTML is fetched network-first and never
    written to Cache Storage.
- Money: narrow grids, settlement/expense rows, amount wrapping, form controls, and bottom-sheet
  dynamic viewport/keyboard scrolling were made mobile-safe. Authenticated viewport screenshots
  remain pending.
- Map:
  - Added `maplibre-gl@6.9.0` exact dependency and a route-local, dynamically loaded renderer.
  - Uses standard OpenStreetMap raster tiles with attribution, controls, marker layers, explicit
    geolocation, no location persistence, offline list fallback, Haversine distance, and a labelled
    4.8 km/h walking estimate. CSP permits only the exact tile host.
  - Added two unit tests for distance and walking estimates.
- Media:
  - `20260911081817_media_library_metadata.sql` and
    `20260911082915_media_library_fk_indexes.sql` applied to production.
  - Added RLS-protected virtual albums and title/original-filename/album/tags metadata; existing
    place and people fields are exposed through the editor.
  - Added search, day/album/place/mine filters, metadata editor, album creation, and two/three-column
    responsive masonry.
  - Upload always decodes/reorients/re-encodes WebP, strips metadata, creates a thumbnail, caps input
    at 15 MB/output at 8 MB, processes at most two files concurrently, hashes the derivative, and
    rejects decode failure instead of uploading an untouched original. Exact new storage paths are
    removed if registration fails.
- Principal changed files: `AGENTS.md`, `app/(app)/loading.tsx`, `app/(app)/map/*`,
  `components/feature/map/*`, `components/feature/media/MediaView.tsx`,
  `components/feature/money/*`, shared navigation/sheet/money primitives, `lib/actions/media.ts`,
  `lib/data/media.ts`, `lib/data/trip.ts`, `lib/supabase/*`, `lib/utils/geo.ts`,
  `lib/utils/image.ts`, map/media messages, `next.config.ts`, package manifests, migrations,
  relevant docs, and `tests/unit/geo.test.ts`.
- Verification:
  - `pnpm lint`: PASS.
  - `pnpm typecheck`: PASS. A baseline parallel run raced with `.next/types`; the serial rerun was
    clean and all later serial checks passed.
  - `pnpm test`: PASS, 8 files / 43 tests. Non-failing Vite future-config warning remains.
  - `pnpm build`: PASS. Shared first load 102 kB; `/map` 244 kB; `/media` 242 kB; `/money` 247 kB;
    `/today` 254 kB; middleware 94.5 kB.
  - `node scripts/verify-seed.mjs`: PASS after replacing the stale zero-passenger expectation with
    the durable invariant `flight_passengers = trip_members × flights`; production has 2 = 1 × 2.
  - Supabase security advisor after DDL: no anonymous SECURITY DEFINER finding and no mutable
    search-path finding. Remaining: private allowlist has intentionally no policies (INFO),
    `citext` in public, six intentional authenticated helper/RPC warnings, and password leak
    protection (not relevant to magic-link-only auth).
  - Supabase performance advisor after DDL: 39 unindexed FKs, 36 auth-initplan policies, two
    cache tables without PKs, 18 currently unused indexes, and four multiple-policy findings. These
    are inherited schema-wide backlog; at five users, do not add dozens of speculative indexes
    before query-plan evidence.
  - Production browser check redirects the fresh automation session to `/login`; therefore no
    authenticated production visual matrix was possible without requesting another magic link.
- Live changes: three production Supabase migrations above. No Vercel/GitHub mutation and no media
  object/data deletion.
- Unresolved risks/manual UAT:
  - Real-device authenticated Money overflow/keyboard test; map tile/CSP/geolocation/touch test;
    media JPEG/PNG/HEIC upload/edit/private/member test; Roei pending write rejection.
  - Tile-load failures currently leave the map canvas and cached lists; a dedicated visible tile
    error banner can be added after device testing if needed.
  - Media upload queue is online-only and does not yet survive tab closure/network interruption;
    progress is per-file state rather than byte-level XHR progress.
  - MapLibre increases only the `/map` route; non-map routes were not visually bundle-profiled.
- Exact next action: obtain or reuse an authenticated test session, run the viewport/UAT matrix in
  Phase 7, fix only observed defects, then update this checkpoint. If the user explicitly requests
  release, rebuild after commit so `public/sw-manifest.js` records the new commit, push `main`, wait
  for Vercel, and smoke-test the production URL.

### Checkpoint 2 — Trip-scoped media RLS, full verification, authorized release

- Timestamp: 2026-09-11 11:45 (Asia/Jerusalem)
- Agent: continuation session (opencode), resuming from Checkpoint 1 + post-compaction media work.
- Branch/HEAD: `main` / `a7a5032` at session start; worktree carried all Phase 1–5 changes.
- Completed since Checkpoint 1:
  - Media library UI: search (title/caption/tags/people/place/album), day/album/place/mine
    filters, metadata editor (rename/title, caption, album, place, people tags, day tags), album
    creation, bounded two-file upload concurrency.
  - `20260911083601_scope_media_metadata_to_trip.sql` applied to production: media insert/update
    RLS now enforces that `album_id`, `linked_place_id`, and `tagged_member_ids` all belong to the
    same trip, blocking direct REST cross-trip linkage.
  - `supabase migration list --linked`: local and remote fully in sync (0001–0017 + four
    2026-09-11 migrations).
  - `verify-seed.mjs` now asserts the durable invariant `flight_passengers = trip_members ×
    flights` instead of a stale zero expectation (production: 2 = 1 × 2).
- Verification (serial runs, all PASS): `pnpm lint`, `pnpm typecheck`, `pnpm test` (8 files / 43
  tests), `pnpm build` (shared first load 102 kB; `/map` 244 kB; `/media` 242 kB; `/money` 247 kB;
  middleware 94.5 kB).
- Secret scan: diff scanned for service-role keys/tokens; only `env.SUPABASE_SERVICE_ROLE_KEY`
  reads in `scripts/verify-seed.mjs` (no hardcoded values). `.env.local` not staged.
- Release authorization: the user explicitly requested commit + push to trigger the Vercel deploy
  in this turn, satisfying the release rule. `public/sw-manifest.js` regenerates on Vercel from
  `VERCEL_GIT_COMMIT_SHA`, so no post-commit local rebuild is required.
- Exact next action: after deploy smoke test, start Phase 6 (profile identity + warm field-journal
  visual refinement), then Phase 7 manual UAT items.

## 11. Current progress summary

| Phase | Status | Exit gate |
|---|---|---|
| 0. Baseline and plan | PARTIAL | Authenticated visual baseline pending |
| 1. Allowlist | IMPLEMENTED | Manual five/stranger/Roei login UAT pending |
| 2. Performance | IMPLEMENTED/PENDING METRICS | Post-deploy production timings pending |
| 3. Money mobile | IMPLEMENTED/PENDING UAT | Authenticated viewport matrix pending |
| 4. Real map | IMPLEMENTED/PENDING UAT | Device tiles/location/touch checks pending |
| 5. Media library | CORE IMPLEMENTED | Upload/edit/private/device UAT pending |
| 6. Profiles/design | NOT STARTED | Secure coherent UI passes |
| 7. Release verification | AUTOMATED PASS/PARTIAL | Manual authenticated gates pending |
