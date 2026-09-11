---
id: feature-route-places
title: Route & Places
status: draft
depends_on: [data-model]
last_updated: 2026-09-11
---

# Route & Places ("מסלול")

## Goal

The trip-planning core: the screen where ideas become a feasible, costed, day-by-day
plan. Route & Places is the hub the other screens orbit — the Today dashboard renders
what is built here, map markers visualize it, day costs roll up into the Money tab, and
open polls decide what enters the plan.

Scope: a shared **Places Inbox** (suggestion pipeline), a **Route builder** (5 day plans,
drag-to-order), a **Map tab** (places + transit anchor stations), **bulk import** of
Google Maps links, and a one-tap **rain plan**. The feasibility engine itself lives in
[00-today-dashboard.md](00-today-dashboard.md) — reuse it here, do not duplicate it.

Trip frame: Budapest, 2026-10-04 → 2026-10-08. Day 1 = arrival evening (IZ291 dep
16:35 IL; arrival est. ~19:50 HU, verify), Days 2–4 full days, Day 5 = departure
morning (IZ292 dep 10:25 HU — hard anchor, early start). Group: 4 confirmed members
(+ Roei pending, support 4–6). Owner: Yakir. All times render `Europe/Budapest` (UTC+2;
Israel −1h).

## User stories

- As any member, I paste a Google Maps link with a note ("good for first night",
  "rain backup"), so ideas stop dying in the WhatsApp scrollback.
- As a member, I review the inbox with the group and approve/reject ideas, so the plan
  only contains vetted places.
- As the owner, I drag items across slots and days, assign an owner per item, and the
  app keeps times, owners, costs, and feasibility consistent.
- As a member, I see each day's cost rollup while planning, so we stay on the tight
  student budget.
- As a member, I see all places plus transit anchor stations (Deák Ferenc tér, our
  stop, 100E airport stops, night meeting point) on one map, so I understand the city
  at a glance.
- As the owner, when it rains I tap one button and outdoor items swap to their indoor
  backups.
- As a member, I want the classic Budapest sights pre-loaded as ideas, so we start
  from a checklist and not a blank page.

## Screen layout

### Route builder (`/route`)

```text
RTL — first element renders on the RIGHT.

┌────────────────────────────────────────────┐
│ מסלול                  [📥 ספריית מקומות]  │
│ [יום 1][יום 2•][יום 3][יום 4][יום 5]       │  ← DayTabs
│ יום 2 · ב׳ 05.10 · 💰 ~12,400 Ft ליום *    │  ← DayCostRollup
├────────────────────────────────────────────┤
│ ⠿ 09:00 🍳 ארוחה · אולגה  [יקיר · 60 דק'] │  ← SortableItem
│    חובה · [מאושר] · 🌧 גיבוי: קפה מקור     │
│ ⠿ 11:00 🏛 פרלמנט · [בר · 90 דק']           │
│    ⚠ נדרשת הזמנה! · ~Ft * · [נווט]         │
│ ⠿ 14:00 🛁 סצ'ני · [אהרן · 2.5 שע']         │
├────────────────────────────────────────────┤
│ ⚠ מרווח בצהריים: 7 דק' בלבד → פירוט ב"היום"│  ← FeasibilityChip
│ [+ הוסף מקום מהספרייה]                     │
└────────────────────────────────────────────┘
```

### Places Inbox (`/route/places`)

```text
┌────────────────────────────────────────────┐
│ ספריית מקומות            [📋 הדבקת קישורים] │
│ [💡 רעיונות 12][🔍 בבדיקה 3][✅ מאושרים 8] │  ← pipeline tabs
│ [📅 משובצים 15][🚫 נפסלו 2]                │
├────────────────────────────────────────────┤
│ 💡 שייט בדנובה · מרכז · ~6,000 Ft/אדם *    │
│    "טוב לערב הראשון" · הוצע על-ידי בר      │
│    [✅ אשר][🔍 לבדיקה][🚫 פסול][🗓 שיבוץ]  │
├────────────────────────────────────────────┤
│ 💡 היכל השוק הגדול · רובט 9 · שעות: ☐ אומת │
└────────────────────────────────────────────┘
```

### Map tab (`/map` — bottom-nav "מפה")

```text
┌────────────────────────────────────────────┐
│ [▣ מקומות ▣ תחנות עוגן]  מקרא: 🟨 רעיון    │
│                           🟩 מאושר 🟦 משובץ │
│          (מפת בודפשט)   🟦2 פרלמנט          │
│   ⭐ דיאק פרנץ טר        🟩 בזיליקה         │
│   🚏 100E · ⭐ תחנת הדירה (אחרי הזמנה)      │
├────────────────────────────────────────────┤
│ ┌─ כרטיס מקום ──────────────────────────┐  │
│ │ 🛁 סצ'ני · יום 2 · [מאושר]            │  │
│ │ [נווט] [🗓 שיבוץ ליום] [🗳 הצבעה פתוחה]│  │
│ └────────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

\* Every price is an estimate with `source` + `last_verified` — see rule 8.

## Components

| Component | Responsibility |
|---|---|
| `<PlacesInbox>` | Pipeline board with status tabs + live counts; any member can add |
| `<PlaceCard>` | Name, type icon, district, est price + `<PriceTag>`, note chips ("טוב לערב הראשון" / "גיבוי גשם"), suggester, transition actions |
| `<PlaceSuggestionSheet>` | Paste Maps link → parse preview → edit fields: type, est price + currency, district, opening hours, needs-reservation flag, note tags |
| `<BulkImportDialog>` | Paste multi-line list of Maps links → per-line parse status → create all in one action |
| `<RouteBuilder>` | Day tabs (1–5) + drag-to-order list; add items from approved places |
| `<SortableItem>` / `<ItineraryItemCard>` | Time + tz, category icon, title, owner select, duration, cost, status menu, backup attach, nav link, required/optional badge |
| `<OwnerPicker>` | Member select per item (active members only) |
| `<DayCostRollup>` | Day total + per-person; source stamps on every figure |
| `<MapView>` / `<MapLayerToggle>` | Markers colored by status/day + anchor-stations layer |
| `<PlaceSheet>` (from map) | Place details + navigate / schedule-to-day / vote-on-open-poll |
| `<RainPlanButton>` | Per-day "הפעל תוכנית גשם" / revert; summarizes the swaps before applying |
| `<FeasibilityChip>` | Compact warning per violating gap; deep-links to the full panel in Today |

## Data & queries

Canonical schema: `docs/03-data-model-and-rls.md`. All rows scoped to the single trip; RLS members-only.

| Data | Tables | Query shape |
|---|---|---|
| Day frame | `trips` → `day_plans` | 5 rows: `date` 2026-10-04…08, `day_number` 1–5 |
| Inbox pipeline | `places` | `WHERE trip_id=$1 AND status=$s ORDER BY created_at DESC` |
| Day itinerary | `itinerary_items` JOIN `places` | `WHERE day_plan_id=$1 ORDER BY position` |
| Backup links | `itinerary_items.backup_item_id` | Self-join for 🌧 badges + rain-plan swap |
| Day cost rollup | `expenses` + item estimates | Σ actuals linked to day + Σ estimates of unbooked items; per-person ÷ active members |
| Map markers | `places` (+ day via items) | `lat, lng, status, scheduled_day_number` |
| Anchor layer | `places WHERE kind='transit_anchor'` | Deák Ferenc tér, 100E stops, accommodation stop, night meeting point |

Schema gap to reconcile in the data model (see Tasks): `places` needs `status`
(pipeline enum), `suggested_by`, `gmaps_place_id`, `kind`, `tags`, `est_cost_amount` +
`currency`, `source`, `last_verified_at`.

## Logic/rules

1. **Place pipeline.** `idea → under_review → approved → scheduled → visited`, with
   `rejected` reachable from any pre-scheduled state. Any member suggests; any member
   can advance idea→under_review→approved (small trusted group). `scheduled` is set
   automatically when the place is added to a DayPlan; `visited` is set automatically
   when its linked `itinerary_item` reaches `completed` in Today. `rejected` requires a
   one-line reason; rejected places are kept (never deleted) so duplicates aren't re-suggested.
2. **Google Maps link parsing.** Accept `maps.app.goo.gl/…`, `google.com/maps/…` and
   bare coordinate pairs. Extract name, `lat/lng`, and `place_id` when present. **Strip
   all query/tracking parameters before persisting** — never store URLs with identifying
   query params (security rule). Unparsable link → manual-entry fallback (name +
   district required; coords optional).
3. **Dedupe.** On create (single or bulk), match by `place_id`, else by ~100 m radius +
   similar name; offer merge instead of creating a second row.
4. **Bulk import.** Multi-line paste → per-line parse preview (✅ parsed / ⚠ failed) →
   one action creates all as `status='idea'`, `suggested_by` = importer. Failed lines
   stay in an editable list.
5. **Zero-ambiguity on scheduling.** Saving an `itinerary_item` requires: start time +
   timezone, address (from place), owner, cost (estimate allowed, with source), status,
   navigation link. Missing fields block the save with per-field errors.
6. **Ordering.** Drag-to-order renumbers `position` in steps of 10 (10, 20, 30…) to
   keep offline inserts cheap. Reordering never auto-shifts `start_time`; overlaps
   raise an immediate warning.
7. **Leave-by + feasibility.** `leave_by` and slack warnings reuse the Today engine
   ([00-today-dashboard.md](00-today-dashboard.md), Logic rules 3 + 8): dwell time,
   user-entered `travel_min_to_next` with a Google-Maps check link, 10–15 min buffer,
   verified opening hours, hard reservation times. Render compact `<FeasibilityChip>`
   per violation here; the full panel lives in Today. Auto travel-time API = Phase 2.
8. **Cost rollup + price rule.** Day total = Σ linked `expenses` (actual) + Σ item
   estimates; per-person = ÷ active members (4; 5 if Roei joins). Every figure renders
   via `<PriceTag>`: price + currency + `source` + `last_verified` + "אומת לאחרונה"
   one-tap action. Missing verification ⇒ "לא אומת" badge. Never present dynamic
   prices as facts.
9. **Rain plan.** Any outdoor item (attraction / walk / nightlife outdoors) can attach
   an indoor backup via `backup_item_id` (typically a food/rest/indoor place tagged
   "rain backup"). "הפעל תוכנית גשם" (per day): each outdoor item → `skipped`, its
   backup → `confirmed` in the same slot; every swap writes a feed entry. Owner can
   revert. If a backup is already scheduled elsewhere → warn before swapping.
10. **Map layers.** Places layer: idea 🟨, approved 🟩, scheduled 🟦 (+ day-number
    badge), visited ✓, rejected hidden by default. Anchor layer (always starred):
    Deák Ferenc tér (default anchor), nearest stop to accommodation (disabled
    placeholder until the booking lands — critical deadline 2026-09-20), 100E airport
    express stops, night meeting point (owner-set). Tap marker → `<PlaceSheet>`:
    navigate / schedule / vote.
11. **Never-invent rule.** Seeded places arrive with `opening_hours = null` and no
    price; each carries a verify-hours/price task (see Tasks). Nothing renders as fact
    without `source` + `last_verified`.

## Offline & realtime

- Cache all `places` + 5 `day_plans` + items in IndexedDB on load; the builder and
  inbox are fully usable offline.
- Drags/edits are optimistic + outbox; sync on reconnect. Position conflicts resolve
  last-write-wins with a feed note.
- Realtime channels: `places` (new suggestions appear live in the inbox),
  `itinerary_items` (order/status changes across members' devices).
- Map: cache central-Budapest tiles for the trip bbox at zooms 12–15 on first load;
  markers render from the cached place table offline. No tiles ⇒ markers on a plain
  background, never a blank screen.

## Edge cases

- **Link parses without a name** (coords-only share): prompt for a name before saving.
- **Rejected place still referenced by a scheduled item:** block the rejection until
  unlinked ("המקום משובץ ביום 3").
- **Rain plan with zero backups attached:** banner "אין גיבויים ליום זה — שייכו
  גיבויים" + deep link to attach; activation is a no-op, not an error.
- **Backup activated twice:** idempotent; second tap shows the current state.
- **Item added to Day 5:** any start after 06:00 triggers the hard-anchor warning
  (IZ292 departs 10:25 — airport chain starts ~06:10).
- **Accommodation unbooked:** anchor "התחנה הקרובה לדירה" renders as a disabled
  placeholder until the booking lands (deadline 2026-09-20).
- **Two members reorder offline concurrently:** both apply locally; on sync the later
  `updated_at` wins, the loser gets a feed note with the final order.
- **Manual place without coords:** no marker; listed in a "רשימה בלי מיקום" tray on
  the map tab so it is never lost.
- **Roei still pending:** appears in no `<OwnerPicker>`; per-person costs use 4 until
  his membership is accepted.
- **Place "deleted":** never hard-deleted; only → `rejected`/archived. Scheduled items
  keep an address snapshot so the plan survives.

## Tasks

- [ ] Reconcile `places` schema in `docs/03-data-model-and-rls.md`: add `status`
      pipeline enum, `suggested_by`, `gmaps_place_id`, `kind`, `tags`,
      `est_cost_amount`/`currency`, `source`, `last_verified_at` (+ migration + RLS).
- [ ] Seed the idea bank — 12 Budapest classics as `status='idea'`, each with verify
      sub-tasks (hours ☐ / price ☐ — never pre-filled as fact):
  - [ ] Parliament (Országház) — hours ☐ / tour price ☐
  - [ ] Fisherman's Bastion (Halászbástya) — hours ☐ / terrace fee ☐
  - [ ] Széchenyi Baths — hours ☐ / online-ticket policy ☐
  - [ ] Szimpla Kert (ruin bar) — hours ☐
  - [ ] Great Market Hall — hours ☐ / early-close day ☐
  - [ ] St. Stephen's Basilica — hours ☐ / dome ticket ☐
  - [ ] Chain Bridge — walk-over, no hours
  - [ ] Buda Castle + funicular — hours ☐
  - [ ] Gellért Hill / Citadel — plan vs sunset ~18:05–18:15
  - [ ] Dohány Street Synagogue — hours ☐ / Saturday closure ☐
  - [ ] City Park (Városliget) + Vajdahunyad — open area
  - [ ] Danube cruise — operators / est prices ☐
- [ ] Build the Maps-link parse util (+ unit tests: short link, full URL, bare coords,
      tracking params stripped) and `<PlaceSuggestionSheet>`.
- [ ] Build `<PlacesInbox>` with pipeline tabs + reject-with-reason.
- [ ] Build `<BulkImportDialog>` multi-line import.
- [ ] Build `<RouteBuilder>` drag-to-order (position renumbering + offline outbox).
- [ ] Build `<DayCostRollup>` reusing `<PriceTag>`.
- [ ] Build map tab: status-colored markers, anchor layer, `<PlaceSheet>` actions.
- [ ] Seed anchor stations: Deák Ferenc tér + 100E stops (verify current stop list ☐);
      night meeting point via owner input.
- [ ] Implement rain-plan activate/revert with feed entries.
- [ ] Wire `<FeasibilityChip>` to the Today engine (shared module, no duplication).

## Acceptance criteria

- [ ] Pasting a Maps link creates a place with name + coords parsed and tracking
      params stripped (unit + manual test).
- [ ] Bulk import of 5 links creates 5 ideas in one action; failed lines are reported
      per line.
- [ ] Pipeline transitions work and are auditable; `rejected` requires a reason and
      cannot be scheduled.
- [ ] Scheduling enforces the zero-ambiguity fields; a save without owner/time is
      blocked with field errors.
- [ ] Drag-to-order persists across reload and across an offline→online sync on two
      devices.
- [ ] Day cost rollup matches Σ expenses + estimates and shows per-person for 4
      members; every figure carries source + last_verified.
- [ ] Map shows status-colored markers + the 4 anchor pins; `<PlaceSheet>` navigate /
      schedule / vote all work.
- [ ] Rain plan swaps outdoor→backup statuses in one tap, is reversible, and writes a
      feed entry per swap.
- [ ] Feasibility chip appears for a deliberately overloaded gap and deep-links to the
      Today panel.
- [ ] Idea bank: 12 seeded ideas visible in the inbox, each with an open verify task;
      no hours/price rendered as fact anywhere.
- [ ] Hebrew RTL on a 360px device; touch targets ≥ 48px; builder usable in airplane
      mode.

## Out of scope

- Auto travel-time API (Google Routes / BKK) — Phase 2 (heuristic + user-entered times
  only for MVP).
- Route optimization / automatic reordering algorithms.
- In-app turn-by-turn or transit routing — deep links out to Google Maps /
  BudapestGO instead.
- Importing place reviews or photos from Google.
- Accommodation booking itself (see
  [03-accommodation.md](03-accommodation.md)) — only its anchor stop lives here.
