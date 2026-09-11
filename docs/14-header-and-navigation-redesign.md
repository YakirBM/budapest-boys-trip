---
id: header-and-navigation-redesign
title: Header and Navigation Redesign — Live Header + 4-Tab Shell
status: approved-spec
owner: Yakir
approved_at: 2026-09-11
last_updated: 2026-09-11
depends_on:
  - 02-architecture
  - 03-data-model-and-rls
  - 04-security-and-privacy
  - 05-ui-ux-design-system
  - 06-features
  - 07-pwa-and-offline
  - 08-integrations-and-apis
  - 11-acceptance-criteria
decisions_locked:
  - build_order: parallel-tracks-after-shell
  - personal_schedule: separate-table-personal-items
  - place_scrape: server-side-og-plus-extended-metadata
  - map_pins: shared-synced-table-with-realtime-and-offline
---

# Header and Navigation Redesign — Full Specification

## 0. Purpose and scope

This document is the single professional spec for the requested redesign:

1. A new **live global header** (full date, full Budapest time, full Israel time,
   weather, theme switch, emergency button, profile dropdown with full edit +
   prominent logout).
2. A new **sticky bottom navigation shell with 4 tabs**:
   - Tab 1 — "Our Day" (`היום שלנו`): unified dashboard with sub-tabs
     `Our schedule | What to do | Map` (`הלו״ז שלנו | מה עושים | מפה`),
     group/personal schedule toggle, tile cards with blur background, bottom
     drawer editor, shared interactive map with pins, fully redesigned places
     library with link scraping.
   - Tab 2 — "Lists" (`רשימות`): group + personal checklists under 3 top tabs
     (`הכנה לטיסה | מטיילים | חזרה לארץ`), styled, with drag-and-drop ordering.
   - Tab 3 — "Money" (`כספים`): same finance logic, clearer SplitWise wording,
     upgraded live FX converter (ILS/HUF/EUR/USD with icons), comfortable
     numeric input, full action table, reports/graphs.
   - Tab 4 — "Memory Wall" (`קיר זיכרונות`): media space with albums
     (shared/private), tags/people/places, auto compression, views by
     album/person/place/map/day.

Existing routes (`/route`, `/map`, `/flights`, `/stay`, `/transit`, `/safety`,
`/decisions`, `/more`) are **kept as deep-linkable pages** and linked from
inside the tabs. No deep link or offline snapshot is broken.

Conventions (non-negotiable, per `AGENTS.md` + `docs/01,02,04,05,07`):

- Docs in English; app UI in Hebrew RTL via `messages/he.json` +
  `messages/he/<feature>.json` merged in `lib/i18n.ts`. No hardcoded Hebrew
  in components.
- RLS mandatory on every table and `storage.objects`. No public buckets;
  signed URLs for media/documents.
- Sensitive data (passport, insurance numbers, medical, exact home address,
  ICE phones) is opt-in, private, never rendered in shared views.
- Zero ambiguity: every scheduled item shows time + timezone, address, owner,
  cost, status, navigation link.
- Dynamic data (prices, hours, FX) carries `source + last_verified_at` and is
  presented as an estimate via `EstimateBadge`.
- Mobile-first: bottom nav 64px + safe-area, touch targets ≥ 48px, one-thumb
  use, offline-first for daily plan, emergency numbers, bookings, addresses.

Current-state references used by this spec:

- Shell: `app/(app)/layout.tsx:13-27`, `components/layout/Header.tsx:24-58`
  (per-page title only), `components/layout/BottomNav.tsx:15-21` (5 items:
  `/today, /route, /map, /money, /more`).
- Today: `components/feature/today/TodayView.tsx`, `StatusStrip.tsx:24-90`
  (clocks + weather pill), `DaySelector.tsx`, `TodayTimeline.tsx`,
  `EmergencySheet.tsx`.
- Route/places: `components/feature/route/RouteView.tsx`,
  `RouteItemList.tsx:34-109` (up/down buttons, not drag),
  `AddItemSheet.tsx`, `PlacesInbox.tsx:52-111`, `lib/data/route.ts`,
  `places` table (`supabase/migrations/0003_planning.sql:7-32`).
- Map: MapLibre 6.9.0 (`package.json:31`), `MapView.tsx:32-41`,
  `InteractiveMap.tsx:4-38`, OSM raster tiles, `lib/utils/geo.ts`.
- Money: `MoneyView.tsx`, `ExpenseForm.tsx`, `ConverterSheet.tsx:71-102`,
  `visuals.tsx`, `lib/utils/money.ts:7` (`HUF,ILS,EUR,USD`),
  FX cron `app/api/cron/fx/route.ts:16-18` (Frankfurter/ECB),
  weather cron `app/api/cron/weather/route.ts:52-57` (Open-Meteo).
- Checklists: `ChecklistsView.tsx:174` (`mine|group|all`), `ReadinessWidget.tsx`.
- Media: `MediaView.tsx:212-221` (filters), `uploadOne:328-408` (WebP+thumb),
  `lib/data/media.ts:62-134`.
- Theme: `lib/theme/ThemeProvider.tsx:70-129`, `lib/theme/logic.ts`
  (auto-dark after Budapest sunset ≈ 18:05 until 06:30, override until next
  sunrise), `public/theme-init.js`.
- Profile: `components/feature/more/ProfileCard.tsx:34` (name/role/status
  only), `app/(app)/more/page.tsx:53-129` (theme radio + links).

---

## 1. Global live header (`AppHeader`)

### 1.1 Placement and mechanics

- New client component `components/layout/AppHeader.tsx`, rendered once in
  `app/(app)/layout.tsx` above `<main>`, below `OfflineBanner`.
- `position: sticky; top: 0; z-40`, `bg-background/90 + backdrop-blur`,
  `pt-safe`. Two compact rows, total height ≤ 104px, never pushes content
  sideways. Per-page `Header` (title/subtitle/action) stays as the page-level
  `h1` below it.
- Data flow: clocks tick locally (no network); weather reads the existing
  `weather_cache` row via TanStack Query (`staleTime 60s`, `refetchInterval
  5min` when online); date derived from `Europe/Budapest` zone.
- Offline: clocks keep ticking; weather shows last-known + stale badge +
  `common.offlineBanner`. Never blank.

### 1.2 Row 1 — identity and actions (start → end in RTL)

1. **Trip identity (start edge):** small brand mark + `בודפשט 2026` +
   full Hebrew date, e.g. `יום ראשון, 4 באוקטובר 2026`.
   Format via `Intl.DateTimeFormat('he-IL', { weekday:'long', day:'numeric',
   month:'long', year:'numeric', timeZone:'Europe/Budapest' })`.
2. **Theme button:** icon-only 48px, `aria-label = a11y.themeToggle`.
   Behavior: tap cycles `system → light → dark → system` (uses existing
   `useTheme()`); long-press / second tap opens 3-option sheet
   (`theme.light/dark/system + systemHint`). Immediate class flip on `<html>`
   with ≤ 200ms transition (existing `flashTransition`). Persisted in
   `localStorage theme-override` (existing logic, no change).
3. **Emergency button (end edge, always visible):** solid danger fill,
   white phone/siren icon + `חירום` label, 48px+. Opens the global
   `EmergencySheet` (moved from `TodayView` to shell so it works from every
   tab). Content unchanged: `tel:112`, booked accommodation address or
   `noAccommodation`, own-insurance pointer, offline note.
4. **Profile button (endmost):** round avatar (photo or initials) 40px inside
   a 48px target. Opens profile menu (see §1.4).

Order at the end edge (RTL `end` = visual left): `[Emergency] [Profile]`.
This satisfies "leftmost emergency + profile" in an RTL-correct way using
logical properties only (`ms/me/ps/pe`, never `ml/mr/left/right`).

### 1.3 Row 2 — live times + weather (the creative compact strip)

Goal: four facts (full Budapest time, full Israel time, full date is in row 1,
weather) in one glanceable, non-cluttered strip.

- Layout: horizontally scrollable single row (`overflow-x-auto`,
  `scrollbar-none`) with three pills: `[Clock pill] [Weather pill]`.
- **Clock pill (flag switch):** segmented control with two segments:
  `🇭🇺 בודפשט 14:32:05` (primary, bold, tabular-nums, LTR-isolated time) and
  `🇮🇱 ישראל 15:32:05` (secondary). Tapping a flag swaps primary/secondary.
  Selection persisted in `localStorage clock-primary = HU|IL`.
  - Each segment shows: flag (object icon, never mirrored) + city label +
    full time `HH:MM:SS` (24h, `hour12:false`) + short zone tag (`HU`/`IL`).
  - Ticking: `setInterval 1000ms` while header mounted; renders via
    `Intl.DateTimeFormat('he-IL', { hour:'2-digit', minute:'2-digit',
    second:'2-digit', hour12:false, timeZone })`. Seconds make "full time"
    explicit; minutes-only variant used inside timeline rows to save space.
  - Timezones fixed: `Europe/Budapest` (UTC+2, DST-aware via Intl) and
    `Asia/Jerusalem` (UTC+3). Never hardcode offsets.
- **Weather pill:** reuses `WeatherPill` logic from
  `StatusStrip.tsx:55-90`: `tempMin–tempMax`, `rainPct`, `wind`, sunset
  `Europe/Budapest`. Tapping opens a 3-line sheet (today detail + source +
  `fetched_at` + stale warning if `> 3h`). Hidden only when `weather_cache`
  row is null (pre-horizon, before ~2026-09-20); then shows nothing rather
  than invented data, per rule 5.
- Bidi: every time/temperature/number is an isolated LTR span
  (`dir="ltr"`, `[unicode-bidi:isolate]`, `tnum`).

### 1.4 Profile dropdown / sheet

- Trigger: avatar button (§1.2.4). Desktop: popover anchored to button;
  mobile: `BottomSheet` sliding from bottom (existing component).
- Sections:
  1. **Header:** large avatar, full name, role badge
     (`profile.roleOwner/roleMember`), status badge
     (`profile.statusActive/Pending/Declined` + `pendingHint` when pending).
  2. **Edit full profile (form):** fields — full name, phone (LTR,
     `inputMode="tel"`), full address (street + number + city + country;
     private, see §1.5), ICE emergency contact name + phone, profile photo
     (pick → client compress → upload to private bucket `avatars` →
     store `avatar_path`, render via 1h signed URL).
     Save via new `updateMyProfileAction` (owner/member-active only;
     pending users read-only). Optimistic UI + toast + offline queue via
     outbox (`profiles/update`).
  3. **My documents shortcut:** link to `/safety` (insurance/medical stay
     there; not duplicated in header).
  4. **Logout (prominent):** full-width danger-outline button with logout
     icon + `התנתק` label, 48px+, separated by divider, `confirmSheet`
     (`common.confirm/cancel`). Calls `supabase.auth.signOut()` + clears
     TanStack cache + redirects `/login`.
- A11y: `aria-haspopup="menu"`, `aria-expanded`, focus trap in sheet,
  `Esc` closes, `a11y.closeSheet/dismiss` labels.

### 1.5 Data model — profile extension

Migration `0017_profile_extended.sql` (additive, nullable):

```sql
alter table public.profiles
  add column if not exists phone text,
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists country text default 'Hungary',
  add column if not exists avatar_path text,
  add column if not exists ice_name text,
  add column if not exists ice_phone text;
```

- RLS: `profiles` select stays trip-members-visible for
  `full_name/avatar`; `phone/address/ice_*` readable **only by owner row**
  (`auth.uid() = user_id`) — enforce via a restricted view
  `v_profile_private` or column-level policy + server action that never
  returns private columns to other members. Writes: self-only, except owner
  role may update `status/role` (existing behavior preserved).
- Storage: new private bucket `avatars` (no public access); policies:
  insert/select/update/delete own path (`auth.uid() || '/' || filename`);
  render via `createSignedUrl(3600)`.
- i18n keys (new, `messages/he.json` → `profile.*`):
  `editProfile, fullName, phone, addressLine, city, country, iceName,
  icePhone, avatar, changePhoto, removePhoto, logout, logoutConfirm,
  logoutDescription, saved, saveFailed, privateBadge`.

### 1.6 Acceptance — header

- [ ] Full date + full HU time (sec) + full IL time (sec) + weather visible
  without scrolling on 360px width (scrollable row allowed, no wrap break).
- [ ] Clocks tick every second, correct zones (verified against
  `time.is` during UAT), survive offline.
- [ ] Flag switch swaps primary clock and persists across reload.
- [ ] Theme button flips `<html>.dark` ≤ 200ms, persists, auto resumes.
- [ ] Emergency opens from every tab, works offline (`tel:112`).
- [ ] Profile edit saves phone/address/ICE/avatar; other members cannot read
  them (RLS test); logout signs out with confirmation.

---

## 2. Bottom shell — 4 tabs

### 2.1 New tab map

```ts
// components/layout/BottomNav.tsx (replaces items array)
[
  { href: "/today",      label: t("nav.ourDay"),  icon: CalendarDays },
  { href: "/checklists", label: t("nav.lists"),   icon: ListChecks  },
  { href: "/money",      label: t("nav.money"),   icon: Wallet      },
  { href: "/media",      label: t("nav.memories"),icon: Images      },
]
```

- Active style unchanged (brand color + 12px top indicator, doc 05 §6).
- `isActive()` extended: `/today` active for `/today/**`, `/route`, `/map`
  (since they render inside Tab 1 sub-tabs); `/checklists` for
  `/checklists/**`; etc. Keeps the indicator truthful while preserving old
  routes.
- i18n: `nav.ourDay = היום שלנו`, `nav.lists = רשימות`,
  `nav.money = כספים` (keep), `nav.memories = קיר זיכרונות`.
  Old keys (`nav.today/route/map/more`) kept as aliases until links migrate.
- `More` page shrinks to: settings (theme, about, version), links to
  flights/stay/transit/safety/decisions, pending-sync badge. Linked from Tab
  1 overflow (`⋯`) and Tab 2/3 where relevant.

---

## 3. Tab 1 — "Our Day" unified dashboard (`/today`)

### 3.1 Information architecture

```
/today?day=1..5&sub=schedule|discover|map
  sub=schedule  → §3.2 Group/personal timeline tiles + drawer editor
  sub=discover  → §3.4 Places library (redesigned) + scrape + add-to-day
  sub=map       → §3.3 Shared interactive map + pins
```

- `day` param unchanged (`currentTripDayClamped()`, `?day=N` links in
  `DaySelector`). `sub` param new, default `schedule`.
- Sticky stack: `AppHeader` (shell) → day buttons row → sub-tab bar
  (sticky `top-<headerH>`, 3 equal tabs, `aria-selected`, 48px).
- RSC page `app/(app)/today/page.tsx` parses `day+sub`, prefetches
  `fetchTodayData + fetchRouteData + fetchMapData` in parallel; client root
  `TodayDashboard.tsx` (new; composes existing `TodayView` pieces + new
  schedule/discover/map panes) shares one TanStack QueryClient + one
  Realtime channel (`itinerary_items → [today,route]`,
  `places → [places,route]`, `map_pins → [map-pins]`).
- Every pane has `EmptyState` with CTA to the next pane
  (schedule-empty → discover; discover-empty → scrape form; map-empty →
  add pin).

### 3.2 Pane A — "Our schedule" (group + personal)

#### 3.2.1 Scope toggle and sorting

- Toggle `קבוצתי | אישי` (segmented, sticky under sub-tabs).
  - `קבוצתי`: rows from `itinerary_items` joined to `day_plans`
    (existing `TripItem`, `lib/data/today.ts:49-73`).
  - `אישי`: rows from new `personal_items` (same trip+day, `owner = me`).
  - Merged view never mixes writes: group writes require active member;
    personal writes require login only.
- Day timeline sorted by `start_time` then `sort_order`, grouped under hour
  headers (`08:00`, `10:30`…). Times always rendered
  `Europe/Budapest HH:MM` + tiny `HU` tag; Day 5 departure anchor (IZ292
  10:25 HU) gets a non-movable anchor card with warning if any item
  `> 06:00` conflicts (existing `AddItemSheet.tsx:88,223-228` logic reused).

#### 3.2.2 Tile cards (redesign)

- Each schedule card is a **tile**: full-bleed background image
  (`image_url` or category fallback gradient) + dark scrim + `backdrop-blur`
  content plate. Guarantees legibility in sunlight (doc 05 principle 2).
- Content (zero-ambiguity preserved): time (LTR) + timezone tag, title (bold),
  address (truncate + nav icon), owner avatar chips, cost
  (`MoneyAmount`, HUF base + original), status chip
  (`planned/confirmed/in_progress/completed/skipped/cancelled`), backup/rain
  badge, comments count, `נַוֵט` button (`googleMapsDir` coords else
  `googleMapsSearch` address).
- Category frame: 3px `border-start` + icon tint from existing
  `--color-cat-*` tokens (`food/attraction/walk/transit/rest/nightlife/
  flight/accommodation/other`); nightlife gets darker scrim variant.
- States: `completed` (checkmark overlay, dimmed), `skipped/cancelled`
  (striped, collapsed), `in_progress` (brand glow), `pending/syncing`
  (`PendingSyncBadge`). Touch target: whole tile opens detail; explicit
  buttons ≥ 48px for status/nav/overflow.

#### 3.2.3 Ordering (drag-and-drop)

- Replaces `RouteItemList` up/down buttons with pointer + touch drag
  (`@dnd-kit/sortable`, vertical list, long-press 250ms activation on touch,
  keyboard fallback keeps up/down for a11y).
- Drop commits `sort_order` rebalance (steps of 10, same server arithmetic as
  today) via `reorderItemAction` (group) / `reorderPersonalItemAction`
  (personal). Optimistic reorder + revert on error + offline queue
  (`itinerary_items/update` in outbox, LWW by `updated_at`).
- Personal and group lists order independently; cross-list drag is disabled
  (prevents permission confusion).

#### 3.2.4 Bottom drawer editor (add/edit tile)

- `ScheduleItemSheet` (new, `BottomSheet`, 90dvh, grabber, `Esc`/scrim close):
  - Fields: title* (required), detailed description, address* (required for
    group items; personal may omit), important links (repeatable URL inputs),
    cost breakdown (repeatable `{label, amount, currency}` + auto HUF base via
    current FX row), participants + responsibility (member multiselect +
    free-text role per member), day + start time (`Europe/Budapest` fixed
    label) + duration, category select (icon preview), cover image (auto from
    links, manual override upload), status select (legal transitions only,
    `LEGAL_TRANSITIONS lib/data/today.ts:313-320`).
  - Auto-image: on link blur, calls `POST /api/scrape` (see §3.5), fills
    `image_url` preview + `image_source`; user can keep/replace/remove.
    Image URL stored with `source + fetched_at`; rendered with `next/image`
    (remotePatterns allowlist) or plain img fallback offline.
  - Validation: group item requires title + address; Day 5 start `> 06:00`
    shows hard-anchor warning but allows save (owner override logged to
    `app_events`).
  - Footer: sticky save (`common.save`), delete (owner/self, `ConfirmSheet`),
    offline note (`errors.network` → queued toast).
- Comments per tile: thread under the tile detail (`item_comments` table or
  `day_notes` with `entity_id`; decision: new `item_comments` to keep queries
  small). 280-char limit (matches `sendComment`), optimistic + offline queue,
  author name + relative time.

#### 3.2.5 Data model — personal schedule + comments

```sql
-- 0018_personal_schedule.sql
create table public.personal_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 5),
  title text not null, description text,
  address text, links jsonb not null default '[]',
  costs jsonb not null default '[]',           -- [{label, amount_minor, currency}]
  category itinerary_category not null default 'other',
  start_time timestamptz, duration_min int,
  image_url text, image_source text, image_fetched_at timestamptz,
  status itinerary_status not null default 'planned',
  sort_order int not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS: owner-only select/insert/update/delete (auth.uid() = owner_id).

-- 0019_item_comments.sql
create table public.item_comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  item_id uuid not null,                        -- itinerary_items.id or personal_items.id
  item_kind text not null check (item_kind in ('group','personal')),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
-- RLS: trip members can read group-item comments; personal-item comments
-- readable only by the item owner. Insert: author = self.
```

- Realtime: `personal_items` channel per-user (no broadcast of others'
  rows — RLS already blocks them); `item_comments` group channel by trip.
- Offline: Dexie snapshots `schedule-day-N` (group+personal merged read
  model) + outbox ops `personal_items/insert|update|delete`,
  `item_comments/insert`.
- i18n (new `messages/he/today.json`): `schedule.group/personal`,
  `tile.navigate/openDetails/comments/addComment/commentPlaceholder`,
  `editor.title/description/address/links/addLink/costs/addCost/
  participants/responsibility/day/startTime/duration/category/cover/
  fetchImage/useImage/removeImage/anchorWarning/deleteItem/deleteConfirm`,
  `dnd.reorderHint/reordered/offlineQueued`.

### 3.3 Pane B — shared interactive map

#### 3.3.1 Base (keep) + new layers

- Keep: MapLibre (`InteractiveMap.tsx`), OSM raster + attribution, Budapest
  center `[19.0402,47.4979]`, zoom 12.4, `cooperativeGestures`, cluster grid
  (`lib/utils/geo.ts:70-93`), `dir="ltr"` container, offline text fallback
  (`MapView.tsx:183-186`), `PlaceSheet` nav links.
- New POI layers (all from DB, never hardcoded as facts without source):
  - ` essentials`: airport (BUD), night-meeting anchor, accommodation (once
    booked) — from `transit_anchor_stations + accommodations`.
  - `metro`: curated anchor stations (`role=central`, lines array).
  - `river/malls/kosher`: `places` filtered by `type/tag`
    (`tags @> '{kosher}'`, `type in ('mall','market')`), plus Danube polyline
    overlay (static geo asset with source credit).
- Toggles as icon chips above map (multi-select, persisted in URL
  `?layers=essentials,metro,kosher`). Legend below (existing colors
  `MapView.tsx:26-30` extended).

#### 3.3.2 Interactions

- Tap marker → bottom mini-card: name, type icon, address, scheduled day
  (if `scheduledByPlace`), distance from map center (`haversineMeters` +
  `estimatedWalkingMinutes`, labelled estimate), buttons: details (→
  discover item), navigate (`googleMapsDir`), add to day (→ schedule drawer
  prefilled `placeId`).
- Tap empty map → "add pin here?" affordance (see §3.3.3).
- `Locate me` (existing `locateMe()`): one-shot geolocation, display-only,
  never stored/transmitted (existing comment preserved).
- Calculations row: tapping two pins (or pin + me) shows
  `distance + walk estimate` with `EstimateBadge`-style "estimate" label.

#### 3.3.3 Shared pins (locked decision: synced table)

```sql
-- 0020_map_pins.sql
create table public.map_pins (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  lat double precision not null check (lat between 47.2 and 47.7),
  lng double precision not null check (lng between 18.8 and 19.4),
  label text not null check (char_length(label) between 1 and 80),
  note text check (char_length(note) <= 280),
  kind text not null default 'custom'
    check (kind in ('custom','meeting','food','warning')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- RLS: trip members select/insert; update/delete own pin or owner role.
```

- Realtime broadcast on `map_pins` (trip channel) → all viewers see new pins
  live. Offline: create locally (optimistic, `local-` id), queue
  `map_pins/insert` in outbox, reconcile on reconnect (server id replaces
  local, same pattern as `reconcileExpenseSplits`).
- Long-press / tap-empty flow: `PinSheet` (label* + note + kind icon) →
  save. Edit/delete from pin card (own or owner). All pins visible to all
  members (shared by design; no private pins in v1).
- i18n (`messages/he/map.json`): `pins.addHere/title/note/kind*/save/
  deleteConfirm/sharedHint/offlineQueued`, `layers.essentials/metro/
  river/malls/kosher`, `measure.distance/walkEstimate/estimateLabel`.

### 3.4 Pane C — "What to do" / places library (full redesign)

#### 3.4.1 Presentation

- Replaces `PlacesInbox` pipeline tabs with a modern colorful responsive grid
  (2 cols mobile, 3 cols ≥ 480px): cover image top (scraped or gradient by
  type), type icon chip, name, district, price estimate (`est_price +
  price_currency + EstimateBadge` or `unverified`), status ribbon
  (`idea/under_review/approved/scheduled/visited`), suggester avatar.
- Filters row: search text + type multiselect + `unverified-only` toggle +
  sort (name/price/district). Counts per status kept as compact segmented
  summary (pipeline preserved underneath: `idea→under_review→approved→
  scheduled`, `rejected` needs reason — existing `setPlaceStatus` semantics
  unchanged).
- Tap card → `PlaceDetailSheet`: full info, hours, links, map preview link,
  status stepper with reason input for reject, `הוסף ללו״ז` (deep-links to
  schedule drawer with `placeId` prefilled), comments reuse `item_comments`
  with `item_kind='place'` (extend check constraint) or `day_notes`.

#### 3.4.2 Drawer form (add/edit place)

Fields (all with Hebrew labels, validation inline):

1. Name*, type* (`place_type`), Google Maps URL / website URL, district,
   address*, lat/lng (auto from scrape or pick-on-map button → returns to
   form), tags (chips incl. `kosher`), est. price + currency + `price_source`,
   opening hours (7-row mini editor → `jsonb`), `needs_reservation` switch,
   note, cover image (auto, replaceable), `source + last_verified_at`
   auto-stamped.
2. `Fetch from link` button (§3.5) fills every field it can; user confirms.
3. Save: `quickAddPlace` (extended) / `updatePlaceAction`; unverified
   (`last_verified_at IS NULL`) renders `לא אומת` (existing rule kept).

### 3.5 Link scraping engine (locked: OG + extended)

New server-only route `app/api/scrape/route.ts` (POST `{url}` → JSON):

1. Validate `http(s)` URL, 8s timeout, 2MB cap, follow ≤ 3 redirects,
   Hungarian + English `Accept-Language`.
2. Parse: `og:title/description/image`, `<title>`, `meta description`,
   `JSON-LD schema.org` (`TouristAttraction/Restaurant/LodgingBusiness` →
   `address/geo/openingHours/telephone/priceRange`), `<address>` fallback,
   Google Maps URL `?q=`/`place/` id extraction (existing `parseMapsLink()`
   reused).
3. Return `{ title, description, imageUrl, address, lat, lng, openingHours,
   phone, priceHint, source: url-host, fetchedAt }`. Never persist raw HTML;
   never expose scraper to the browser (docs/08: browser never calls data
   APIs except raster tiles).
4. Callers: schedule drawer (image+address), place form (all fields), map pin
   from shared link. Every autofill stamps `source + last_verified_at` and
   shows `EstimateBadge`; user must confirm before save (no silent facts).
5. Abuse: per-user rate limit 20/day (upstash-free: in-memory + `app_events`
   log `place.scraped`), SSRF guard (block private ranges, `file:`/`data:`),
   image proxy via `next/image` remotePatterns only.
6. Tests: fixtures for OG page, JSON-LD page, Maps URL, timeout, invalid URL.

### 3.6 Acceptance — Tab 1

- [ ] Sub-tabs switch without full reload, deep-linkable (`?sub=`), sticky.
- [ ] Group/personal toggle filters correctly; personal rows invisible to
  others (RLS negative test with second user).
- [ ] Tiles always show image/gradient + blur plate, category frame, time+TZ,
  address, owner, cost, status, nav link.
- [ ] Drawer creates/edits group + personal items incl. costs/participants/
  image-from-link/comments; validation + Day-5 anchor warning work.
- [ ] Drag reorder persists order after reload; offline reorder reconciles.
- [ ] Map shows essentials/metro/kosher/malls layers, pin tap → info +
  distance + navigate; shared pins appear on a second device ≤ 5s online and
  after reconnect offline.
- [ ] Places grid filter/sort/status flow work; scrape fills ≥ title+image
  for OG fixture; unverified items labelled.

---

## 4. Tab 2 — "Lists" (`/checklists`)

### 4.1 Structure

Top tabs (3, sticky, full-width segmented):

```
[🧳 הכנה לטיסה] [🚶 מטיילים] [🛬 חזרה לארץ]
```

- Data: additive column `checklists.group text default 'preflight'
  check (group in ('preflight','travelers','return'))`
  (migration `0021_checklist_groups.sql`) + backfill:
  packing/preflight → `preflight`; shared-gear → `travelers`; post-trip →
  `return` (seed mapping reviewed in migration comments).
- Inside each group tab, secondary filter `שלי | קבוצתי | הכל` (existing
  `tab` state in `ChecklistsView.tsx:174` preserved as sub-filter).
- Personal vs group semantics unchanged: `assignee`/`owner` scoping,
  `checklist_item_blocks` dependency (`23514` blocked error → `blockedBy`
  sheet), `ReadinessWidget` per group (overall bar + urgent critical).

### 4.2 Design and mechanics

- Each list card: large category icon, title, progress bar with `%` + counts
  (`done/total`), due badge, assignee avatars, chevron. Color-coded per group
  (preflight=info blue, travelers=success green, return=warning amber).
- List detail: item rows with 48px checkbox, title, priority chip
  (`critical/important/normal`), `dueAt`, `doneBy`, blocker lock icon.
  Add-item sheet (`AddItemSheet` existing, extended with group preselect).
- **Drag-and-drop numbering:** same `@dnd-kit/sortable` as schedule;
  reorder commits `position`/`sort_order` (add column if missing:
  `checklist_items.position int default 1000`); numbers re-render 1..n
  instantly (optimistic), persist server-side, queue offline.
- Assignments: member picker per item; `drag` never changes assignment
  (separate gesture to avoid accidents).
- i18n (`messages/he/checklists.json`): `groups.preflight/travelers/return
  + hints/icons`, `dnd.hint/reordered`, keep all existing keys.

### 4.3 Acceptance — Tab 2

- [ ] 3 group tabs render with correct lists; counts match DB.
- [ ] Mine/group/all sub-filter works inside each group.
- [ ] Drag reorder renumbers 1..n, persists, works offline (reconcile).
- [ ] Blocked toggle still blocked with explanation (`23514` path tested).
- [ ] Progress + readiness bars update live via Realtime.

---

## 5. Tab 3 — "Money" (`/money`)

Logic preserved (`getMoneyBoard`, splits equal/exact/percent/shares,
`v_member_balances`, `suggest_settlements`, outbox + `reconcileExpenseSplits`).
This spec changes **wording, converter, inputs, and reporting** only.

### 5.1 Unambiguous settlement wording (replaces vague terms)

Banned in UI: `מאוזן`, `מצב שווה`, bare `owed/owes/even` labels without
context. New patterns (with examples):

- Balance row: `[avatar] דני — החברים חייבים לו 4,133 Ft` (net > 0) /
  `[avatar] יוסי — חייב 2,050 Ft (לדני 1,200, לאבי 850)` /
  `[avatar] אבי — סגור, לא חייב ולא חייבים לו` (net == 0).
- Transfer row: `[avatar-from] יוסי → [avatar-to] דני · 4,133 Ft ·
  החזר על ״מסעדת גונדל״ · 2 משתתפים`. Button `סמן כבוצע` → `✓ בוצע`
  (existing `markTransferPaid` + `app_events money.transfer_marked_paid`).
- Expense row: `[icon] מסעדת גונדל · דני שילם 12,400 Ft ·
  מתחלק בין יוסי, אבי, דני (3) · יום 2 · 19:40 HU`.
- Every amount: LTR isolated span, `MoneyAmount` with HUF base + original
  currency note (`fxLine` provenance already in `ExpenseForm.tsx:224-231`,
  keep).
- Payer identity always includes 28px round photo frame
  (`MemberAvatar` existing) — satisfies "identity + round picture".

### 5.2 Live FX converter (compact, modern, always fresh)

- Placement: same `QuickActionBar → ConverterSheet` entry (keep), sheet
  redesigned: two currency selectors with **coin icons**
  (₪ ILS green, Ft HUF red-white-green dot, € EUR blue, $ USD slate),
  amount field, swap button, result large + `explainer` line
  (`X HUF = Y ILS לפי שער …`) + fee input + source + timestamp +
  stale badge.
- Freshness: reads `exchange_rates` (Frankfurter/ECB cron, existing).
  Add: manual `רענן` (revalidate server fetch, rate-limited), `stale`
  threshold 24h (existing `money.fx.stale`), `missing` state when no rate
  for pair (inverse `1/rate` fallback already in `ConverterSheet:20-33`,
  keep + label as calculated).
- Precision: per-currency decimals (HUF 0, ILS/EUR/USD 2); results rounded
  with `formatMoney`; never show > 2 decimals for ILS.
- Offline: works on cached rates + `stale` badge; manual refresh disabled
  offline with hint.

### 5.3 Numeric input ergonomics

- Amount field: `inputMode="decimal"`, `autocomplete="off"`,
  LTR, large 20px tabular font, currency suffix chip, clear (×) button.
- Decimal handling: normalize `,`/`٫` → `.`; show explicit decimal hint
  (`0.00` placeholder for ILS/EUR/USD, `0` for HUF); live formatted preview
  under the field (`12,400 Ft ≈ ₪132.50`).
- Mobile keyboard: `enterKeyHint="done"`, `₪/Ft/€/$` quick-suffix not needed
  (currency chosen separately); tip/fee fields reuse the same component
  (new `components/ui/AmountInput.tsx` shared by `ExpenseForm` +
  `ConverterSheet` + schedule cost rows).

### 5.4 Dashboard, reports, full action table

- Keep: `myTotal/personalTotal/groupTotal/recentCount` stat cards,
  day-grouped feed, FAB + `ExpenseForm` (add `AmountInput`, keep split
  methods + `manualRate`), owner-only `closeSettlement` (`ConfirmSheet`).
- Add (CSS-only, no chart lib): category donut (conic-gradient from
  `--color-cat-*`) + daily bars (7 flex bars, HUF heights) + per-member totals
  row. All labelled estimates where FX-involved.
- Full table: existing feed extended with `למי חייב` column data (from
  `splits`: show other participant names, not just count) + status chip +
  personal chip. Export route (`/money/export`) unchanged.
- i18n (`messages/he/money.json`): new `balances.owedTo/owesDetail/
  settledClean`, `transfer.repayFor/participants`, `converter.refresh/
  refreshedAt/staleHint`, `amount.hint/decimals/preview`, `reports.title/
  byCategory/byDay/byMember`. Old `owed/owes/even` keys deprecated but kept
  until components migrate (no breakage).

### 5.5 Acceptance — Tab 3

- [ ] No occurrence of `מאוזן/מצב שווה` in rendered UI (grep test).
- [ ] Every balance/transfer/expense names payer + counterparties + reason.
- [ ] Converter converts all 12 pairs among 4 currencies, shows icons,
  source+time, stale state, works offline on cache.
- [ ] Amount input opens decimal keyboard on Android/iOS, accepts `,` and
  `.`, formats preview correctly per currency.
- [ ] Reports render with real data; owner settle flow unchanged; RLS tests
  pass (members cannot delete others' expenses unless owner).

---

## 6. Tab 4 — "Memory Wall" (`/media`)

### 6.1 Library model (albums shared/private, tags, people, places)

Keep: `media_items` (status active, 240 cap query), `media_albums`, `places`,
`media_reactions`, upload pipeline (compress → WebP+thumb → `trip-media`
private bucket → `registerMediaItemAction`), signed-URL thumbs
(`signedUrlCache`, never cached in Dexie), offline read snapshots, uploads
blocked offline (`requiresConnection`).

Add:

```sql
-- 0022_media_organization.sql (additive; exact columns reconciled with
-- 0001…0016 before writing the migration)
alter table public.media_albums
  add column if not exists visibility text default 'shared'
    check (visibility in ('shared','private')),
  add column if not exists owner_id uuid references auth.users(id),
  add column if not exists cover_item_id uuid;
alter table public.media_items
  add column if not exists people uuid[] not null default '{}',
  add column if not exists place_id uuid references public.places(id),
  add column if not exists address_text text,
  add column if not exists taken_at timestamptz,
  add column if not exists lat double precision,
  add column if not exists lng double precision;
-- RLS: private-album items visible only to album members/owner (existing
-- private-item rule extended to album visibility); shared visible to trip.
```

- Upload sheet gains: album picker + `+ אלבום חדש` (name + shared/private),
  people tagger (member multiselect → `people[]`), place (select from
  `places` or free `address_text` with autocomplete — see §6.2), day auto
  (from `taken_at` or current day, editable).
- Edit metadata sheet (existing `updateMediaMetadata`) extended with the
  same fields; `createMediaAlbum` extended with visibility.

### 6.2 Address completion (metadata-first, server-assisted)

1. Client reads EXIF (existing `exifNote` path): GPS → reverse-lookup is
   **server-only** (`POST /api/geocode {lat,lng}` → Nominatim/Open-Meteo
   geocoding, cached in `places` to avoid repeat calls). Result pre-fills
   `address_text + place_id?` as suggestion (user confirms).
2. Manual address field: debounced `POST /api/geocode?q=` suggestions
   (min 3 chars, 300ms, abort on type), keyboard navigable, LTR addresses
   isolated. Selection stores `address_text + lat/lng + place_id?`.
3. No location is ever stored from `Locate me` map flow (display-only rule
   preserved). Photo GPS stored only when present in the file user chose to
   upload (documented in `uploadHint`).

### 6.3 Views (5 modes, one data source)

Sticky view switcher under the upload bar:

```
[🖼 אלבומים] [👥 אנשים] [📍 מקומות] [🗺 מפה] [📅 ימים]
```

- Albums: cover grid → album detail (shared/private badge, counts).
- People: member chips (avatar + count) → filtered grid (uses `people[]`).
- Places: place chips → filtered grid; unknown-address bucket at end.
- Map: reuse `InteractiveMap` with photo pins (thumb markers, tap → viewer).
  Only items with `lat/lng` appear; others counted in a "no location" tray
  (same pattern as `MapView.tsx:266-290`).
- Days: sections `יום 1..5 + ללא יום` by `day/taken_at`, time-sorted
  (`DEFAULT_MEDIA_SORT`, `sortMediaItems` in `lib/utils/media.ts` kept).
- Filters (existing `dayFilter/mineOnly/albumFilter/placeFilter/tagFilter/
  visibilityFilter/likedOnly/sortMode/search`) persist across views via URL
  params. Likes/comments/private/delete/toggle flows unchanged.

### 6.4 Compression and storage (keep + tighten)

- Keep: `compressImage/isAllowedImageFile/MAX_INPUT_BYTES`
  (`lib/utils/image.ts`), 2 upload workers, cleanup on fail.
- Add: video cap 200MB + duration hint; HEIC warning (iOS) with convert hint;
  failed-compression message preserved (`compressionFailed`).
- Storage stays in DB-backed `trip-media` bucket per album path
  (`tripId/albumId/file`); no `media/` raw private docs shipped (gitignored,
  never uploaded — existing rule).

### 6.5 Acceptance — Tab 4

- [ ] Upload → compress → album (shared/private) → tagged (people/place) →
  visible in all 5 views consistently.
- [ ] Address autocomplete from EXIF + manual works; user confirms before
  save; no silent location storage.
- [ ] Map view shows only geotagged items; counts reconcile with grid.
- [ ] Private albums invisible to non-members (RLS negative test).
- [ ] Quota/oversize/HEIC/offline states show correct Hebrew messages.

---

## 7. Cross-cutting specifications

### 7.1 Routing table (after redesign)

| Bottom tab | Route | Sub-views | Old route fate |
|---|---|---|---|
| Our Day | `/today?day=N&sub=schedule` | group/personal tiles, drawer, comments, dnd | canonical |
| Our Day | `/today?day=N&sub=discover` | places grid, detail, form, scrape | replaces `/route?tab=places` as entry; `/route` kept, links into this view |
| Our Day | `/today?day=N&sub=map` | layers, pins, measure | replaces `/map` as entry; `/map` kept, renders same component |
| Lists | `/checklists?group=preflight\|travelers\|return&filter=mine\|group\|all` | dnd, readiness | canonical (renamed label only) |
| Money | `/money` | dashboard, converter, reports, table | unchanged path |
| Memories | `/media?view=albums\|people\|places\|map\|days` | upload, edit, filters | unchanged path |
| — | `/route`, `/map`, `/flights`, `/stay`, `/transit`, `/safety`, `/decisions`, `/more` | — | kept, linked from tabs/overflow |

### 7.2 State, realtime, offline matrix

| Entity | Query key | Realtime invalidation | Snapshot key | Outbox ops |
|---|---|---|---|---|
| today/route day | `["today",trip,day]`, `["route",trip]` | `itinerary_items` | `today-day-N` | `itinerary_items/update` (status/order) |
| personal items | `["personal",trip,day]` | user channel | merged in `schedule-day-N` | `personal_items/*` |
| item comments | `["comments",itemId]` | `item_comments` | none (refetch) | `item_comments/insert` |
| places | `["places",trip]` | `places` | `places` | `places/*` (status/order) |
| map pins | `["map-pins",trip]` | `map_pins` | `map-pins` | `map_pins/*` |
| checklists | `["checklists",trip]` | `checklist_items` | `checklists` | `checklist_items/*` |
| money | `["expenses",trip]`, `["balances",trip]` | `expenses` (+poll, existing) | `money-expenses/balances` | `expenses/insert` + split re-attach |
| media meta | `["media",trip]` | `media_items` | `media` (meta only) | likes/comments queued (existing) |
| profile | `["my-profile"]` | none | none (TanStack 5m) | `profiles/update` |

Rules: optimistic updates everywhere with revert; `staleTime 60s` for live
pills; signed URLs never enter Dexie; outbox replay in order, idempotent
PK/LWW (existing `flushOutbox` semantics).

### 7.3 Design tokens and components (new)

- `components/layout/AppHeader.tsx` (rows, flag switch, weather pill slot).
- `components/layout/ProfileMenu.tsx` + `components/feature/profile/ProfileForm.tsx`.
- `components/ui/AmountInput.tsx` (money + schedule costs + converter).
- `components/feature/schedule/ScheduleTiles.tsx`, `ScheduleItemSheet.tsx`,
  `CommentsThread.tsx`, `GroupPersonalToggle.tsx`, `SubTabs.tsx`.
- `components/feature/places/PlacesGrid.tsx`, `PlaceDetailSheet.tsx`,
  `PlaceFormSheet.tsx`.
- `components/feature/map/PinsLayer.tsx`, `PinSheet.tsx`, `LayersChips.tsx`,
  `MeasureBar.tsx`.
- `components/feature/checklists/GroupTabs.tsx` (3 tabs), dnd wrappers.
- `components/feature/media/ViewSwitcher.tsx`, album/people/place/map/days
  panes (composition over existing `MediaView`).
- Tokens: reuse `--color-cat-*`, `--color-brand/success/warning/danger/info`,
  `bg-surface/surface-raised`, `text-primary/secondary/muted`. New tile scrim
  utilities in `globals.css` only (no per-component raw colors).

### 7.4 Security and privacy notes

- Profile private columns + personal items + private albums: owner-only RLS,
  verified by negative tests (second user, anon).
- `storage.objects` RLS for `avatars` + `trip-media` (private buckets only).
- Scrape/geocode routes: SSRF guard, size/time caps, rate limits, no key
  leakage, no logging of personal addresses beyond the user's own save.
- Access logging kept for medical reveal (`app_events
  view.emergency_profile`) and added for `money.transfer_marked_paid`
  (existing) — no new tracking.

### 7.5 i18n key plan (all Hebrew, no hardcode)

- `nav.ourDay/lists/memories` (+ keep old aliases).
- `header.date/clockBudapest/clockIsrael/primary/secondary/weatherTitle`.
- `profile.*` (§1.5), `schedule.*`, `places.*` (extend), `pins.*`,
  `layers.*`, `measure.*`, `groups.*` (lists), `money.*` (§5.4),
  `media.*` (extend: `albumNew/visibilityShared/Private/byAlbums/People/
  Places/MapView/DaysView`).
- `a11y.*`: `themeToggle, emergency, profileMenu, closeSheet, reorder,
  swapClocks, refreshRates`.

---

## 8. Build plan — phases, meaning, results, tests

Conventions for every phase: branch from green `main`, `pnpm dev` smoke,
`pnpm typecheck + lint + test` green, `pnpm build` (SW manifest) green,
update this doc's checkbox + `BUILD_STATUS.md`, never commit secrets, never
`git commit/push` unless asked.

### Phase 0 — Foundations (shell-ready)

- Meaning: i18n scaffolding, tokens, shared primitives, migration numbering
  reconciled with `0001…0016`, RLS test harness runnable.
- Work: add all new i18n keys (Hebrew, fail-soft), `AmountInput`,
  `SubTabs`, `GroupPersonalToggle`, tile scrim utilities, `@dnd-kit`
  dependency (justify in PR: shared by schedule + lists), `AmountInput`
  unit tests.
- Results: primitives render in isolation (story-less gallery page or
  vitest + snapshots), no app behavior change.
- Tests: `vitest` (AmountInput parsing `,`/`.`/HUF-0-decimals, flag-switch
  persist, theme cycle), `tsc`, `eslint`. E2E: none new.

### Phase 1 — Global header + 4-tab shell + profile + emergency

- Meaning: the app frame the user asked for; everything else docks into it.
- Work:
  1. `0017_profile_extended.sql` + `avatars` bucket + policies +
     `v_profile_private` (if chosen) + `rls-tests.sql` additions.
  2. `AppHeader` (rows, clocks 1s tick, weather pill, theme cycle, flag
     switch persist), `ProfileMenu + ProfileForm + updateMyProfileAction +
     logout`, move `EmergencySheet` to shell, rewrite `BottomNav` to 4 tabs
     with extended `isActive`, shrink `More` page.
- Results: every tab shows live header; profile edits persist; logout works;
  old routes still resolve.
- Tests:
  - Unit: clock formatting (HU/IL zones, DST), weather stale threshold,
    theme override-expiry logic (existing `logic.ts` cases extended).
  - RLS: self-read private OK; other-member read denied; anon denied;
    avatar path isolation.
  - E2E (auth): header shows all pills; flag swap persists reload; theme
    persists; emergency opens offline (`context.setOffline(true)` →
    `tel:112` visible); profile save + logout round-trip.
  - Visual audit: 360px + 480px RTL screenshots, light + dark.

### Phase 2 — Tab 1A schedule (tiles + drawer + group/personal + dnd + comments)

- Meaning: the daily dashboard becomes the unified controllable timeline.
- Work:
  1. `0018_personal_schedule.sql + 0019_item_comments.sql` + policies +
     realtime + snapshots/outbox entries.
  2. `TodayDashboard` sub-tabs + `schedule` pane: toggle, tiles, dnd
     (`reorderItemAction` + `reorderPersonalItemAction`), `ScheduleItemSheet`
     (all fields + image-from-link via `/api/scrape`), `CommentsThread`.
- Results: group + personal timelines editable, reorderable, commentable,
  fully offline-capable.
- Tests:
  - Unit: sort-merge (time then order), Day-5 anchor warning predicate,
    legal-transition guard, cost-sum + FX-base calc.
  - RLS: personal rows invisible cross-user; group comments readable,
    personal comments owner-only.
  - E2E: create group tile → appears; create personal tile → invisible to
    second user; drag tile → order persists reload; comment posts; offline
    create → queued → reconciles on reconnect.
  - Perf: day with 40 tiles renders < 200ms client (measure), images lazy.

### Phase 3 — Tab 1B places library + scrape engine

- Meaning: "What to do" becomes the beautiful, fully-fielded, auto-filling
  library feeding the schedule.
- Work: `PlacesGrid + PlaceDetailSheet + PlaceFormSheet`, extend
  `quickAddPlace/updatePlaceAction/setPlaceStatus`, build
  `POST /api/scrape` (OG + JSON-LD + Maps parse, caps, rate limit,
  fixtures), `Add to day` prefill into schedule drawer.
- Results: scrape fills title/image/desc/address/geo/hours; user confirms;
  status pipeline + unverified labelling intact.
- Tests:
  - Unit (fixtures): OG page, JSON-LD restaurant, Maps URL, timeout,
    invalid/SSRF URL, oversize HTML.
  - RLS: member CRUD per existing place policies; rejected-reason required.
  - E2E: paste link → preview fills → save → card in grid → add-to-day →
    tile draft prefilled.
  - Rule-5 audit: every rendered price/hour carries source or `לא אומת`.

### Phase 4 — Tab 1C shared map + pins

- Meaning: the map becomes the shared spatial truth (POIs + pins + measure).
- Work: `0020_map_pins.sql` + realtime + outbox, `PinsLayer + PinSheet +
  LayersChips + MeasureBar`, layer queries (essentials/metro/kosher/malls),
  pin create/edit/delete, distance/walk readout, `PlaceSheet` extended.
- Results: pins sync live cross-device, survive offline, calculations
  labelled estimates.
- Tests:
  - Unit: `haversineMeters/estimatedWalkingMinutes` fixtures,
    bounds-check (reject outside 47.2–47.7/18.8–19.4), cluster cell.
  - RLS: member insert/select; non-owner update/delete denied.
  - E2E (two contexts): pin on A → visible on B ≤ 5s; offline pin on A →
    appears on B after reconnect; layer toggles persist in URL.
  - Offline: map tiles fail gracefully to text fallback (existing
    `MapView:183-186` path asserted).

### Phase 5 — Tab 2 lists (3 groups + dnd)

- Meaning: checklists reorganized into the requested 3 life-phases.
- Work: `0021_checklist_groups.sql` + backfill, `GroupTabs`, sub-filter keep,
  `checklist_items.position` (if missing) + reorder action, per-group
  `ReadinessWidget`, icons/colors.
- Results: preflight/travelers/return each with mine/group/all, progress,
  drag numbering.
- Tests:
  - Unit: backfill mapping, position rebalance, progress math.
  - E2E: switch groups → correct lists; drag item → numbers 1..n persist;
    blocked item still blocked (`23514`); offline toggle queues.
  - A11y: tabs `role=tablist`, checkboxes 48px, reorder keyboard fallback.

### Phase 6 — Tab 3 money wording + converter + inputs + reports

- Meaning: same engine, unambiguous language, delightful converter.
- Work: rewrite balance/transfer/expense rows (avatars + full sentences,
  remove banned words), `AmountInput` adoption in `ExpenseForm +
  ConverterSheet`, converter refresh + icons + decimals, CSS reports
  (donut + bars + per-member), splits counterpart names in table.
- Results: any adult reading a row knows who paid, how much, for what, who
  owes whom; converter fresh/compact; inputs open decimal keyboards.
- Tests:
  - Unit: wording builders (all net sign cases), FX inverse fallback,
    decimal parsing, per-currency rounding.
  - Grep gate: fail CI if `מאוזן|מצב שווה` renders (test scans `money.json`
    + snapshots).
  - E2E: add expense (all split methods) → balances update; mark transfer
    paid → toast + event; converter all pairs; offline add → queued.
  - Visual: 320px/360px money page screenshots (regression for the narrow-
    width bug class in doc 13).

### Phase 7 — Tab 4 memory wall organization + views

- Meaning: media becomes findable (album/person/place/map/day) without
  changing the trusted upload pipeline.
- Work: `0022_media_organization.sql` + album visibility + people/place/
  taken_at/geo columns, upload/edit sheets extended, `ViewSwitcher` + 5
  panes, `POST /api/geocode` (server-only, cached), map-view photo pins.
- Results: 5 coherent views over one source; private albums enforced;
  addresses confirmed by user.
- Tests:
  - Unit: view grouping (album/person/place/day), sort stability, tag
    collection (`collectMediaTags` extended).
  - RLS: private album items denied to non-members; signed URLs short-lived.
  - E2E: upload → tag → each view shows it; geocode autocomplete selects;
    map view pins match geotagged count; offline view renders from snapshot.
  - Storage: oversize/HEIC/offline messages asserted.

### Phase 8 — Hardening and acceptance sweep

- Meaning: prove the whole redesign meets docs `11` budgets.
- Work: full `rls-tests.sql` run (needs direct SQL access, see BUILD_STATUS
  B3), Playwright 12+ suite green, `visual-audit.mjs` RTL/theme pass,
  `verify-seed.mjs` (counts + masked-ref scan), PWA install + background-sync
  check, perf budgets (LCP/INP on Moto-G profile), a11y pass (contrast,
  focus, 48px audit), docs sync (`AGENTS.md` + `docs/10,11` if conventions
  changed).
- Results: release-ready; this doc + `BUILD_STATUS.md` checkboxes all ticked
  with evidence links (commit SHAs, screenshots in `shots/`).

---

## 9. Migration index (new, all additive/nullable)

| File | Content | Risk |
|---|---|---|
| `0017_profile_extended.sql` | phone/address/city/country/avatar_path/ice_* | low; backfill null |
| `0018_personal_schedule.sql` | `personal_items` owner-only | low; new table |
| `0019_item_comments.sql` | `item_comments` group/personal/place | low; extend check for `place` in Phase 3 |
| `0020_map_pins.sql` | `map_pins` shared, bounds checks | low; realtime added |
| `0021_checklist_groups.sql` | `checklists.group` + backfill + `checklist_items.position` | medium; backfill reviewed |
| `0022_media_organization.sql` | album visibility + item people/place/geo/taken_at | medium; reconcile with 0001…0016 first |

Each migration ships with: `up` (idempotent `if not exists`), RLS
enable + policies, `grant` parity with existing tables, seed/backfill notes,
and matching `rls-tests.sql` assertions.

---

## 10. Open risks and mitigations

1. Mobile dnd jank → `@dnd-kit` with long-press activation + keyboard/arrow
   fallback; if perf fails, keep arrows as permanent a11y path.
2. Scraper blocked (JS-heavy sites, anti-bot) → always allow manual entry;
   preview shows what was found field-by-field, never blocks save.
3. Header crowding on 320px → scrollable row 2, truncated labels, icon-only
   actions; visual-audit gate at 320/360/480.
4. Realtime fan-out cost → one trip channel, key-scoped invalidations only
   (existing `realtime.tsx` pattern), no full refetch loops.
5. New tables bloat offline cache → snapshot keys per day/group, caps mirror
   existing limits (`expenses 500`, `media 240`).

---

## 11. Definition of done (release gate)

- [ ] Header §1.6 + Tab 1 §3.6 + Tab 2 §4.3 + Tab 3 §5.5 + Tab 4 §6.5 all
  checked with cited evidence (test run, screenshot, SQL output).
- [ ] `pnpm typecheck`, `lint`, `test`, `test:e2e`, `build` green on final SHA.
- [ ] No hardcoded Hebrew in new TSX (grep gate), all strings via `t()`.
- [ ] No public buckets; no service-role key in repo; masked-ref scan clean.
- [ ] `docs/10,11` + `AGENTS.md` updated if any convention changed.
