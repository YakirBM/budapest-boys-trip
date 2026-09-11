---
id: feature-today-dashboard
title: Today Dashboard
status: draft
depends_on: [data-model]
last_updated: 2026-09-11
---

# Today Dashboard ("היום")

## Goal

Build the operational control center of the trip — the screen the group opens 20+ times a day.
Answer in under 5 seconds: **what's next, when do we leave, how much will it cost, and is the day still feasible.**

Trip frame: Budapest, 2026-10-04 → 2026-10-08 (5 days / 4 nights).

| Day | Date | Character |
|---|---|---|
| 1 | Sun 2026-10-04 | Arrival evening (IZ291 TLV T3 16:35 IL → BUD; arrival time not printed on ticket — verify from Arkia, ~3.5h flight) |
| 2–4 | Mon 05.10 – Wed 07.10 | Full days |
| 5 | Thu 2026-10-08 | Departure morning — IZ292 departs 10:25 Budapest local ⇒ short, tightly timed day, early start |

- All times render in `Europe/Budapest` (UTC+2; Israel −1h during the trip). Devices still in Israel show a "שעון הונגריה" (Hungary time) label.
- Bottom-nav entry: "היום". Default tab on app open.
- Group: 4 confirmed members (+ Roei pending; support 4–6). Owner: Yakir.

## User stories

- As a member, I want date, day number (יום X/5), weather, and group readiness at a glance, so I never ask "what's the plan" in chat.
- As a member, I want one "Next Up" hero card with a leave-by countdown and a navigate button, so we stop leaving late.
- As the owner, I want feasibility warnings *before* the day breaks, so I can push a reservation instead of discovering the conflict on the street.
- As a member, I want to report "מאחר ב-10 דקות" (running 10 min late) in one tap, so the group adjusts without a chat flood.
- As a member, I want the emergency sheet (112, my own insurance doc, accommodation address) one tap away, offline included.
- As a member, I want to swipe between Days 1–5 and jump back to today in one tap.

## Screen layout

```text
RTL layout — first element renders on the RIGHT.

┌────────────────────────────────────────────┐
│ יום 2/5 · ב׳ 05.10.2026              [🆘] │  ← StatusStrip (sticky)
│ 📍 יהודי/ליפוטווארוש · 🌦 14° / 19°–9°    │
│ גשם 40% · רוח 12 קמ"ש · שקיעה ~18:10 *    │
│ ✈ צ'ק-אין 4/4 · מוכנים 3/4 · [שתף מיקום לשעה]│
├────────────────────────────────────────────┤
│ ◀ יום 1 │ יום 2 │ יום 3 │ יום 4 │ יום 5 ▶ │  ← DaySelector (swipe)
├────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐ │
│ │ הבא בתור: סצ'ני — רחצה                │ │  ← NextUpCard (hero)
│ │ מתחיל 14:00 · עזיבה 13:20 ⏱ 00:42:10  │ │
│ │ כתובת · 18 דק' הליכה · הזמנה: מאושרת  │ │
│ │ ~₪ / Ft לאדם · סה"כ לקבוצה *מקור       │ │
│ │ [נווט] [כרטיס] [יצאנו] [מאחר ב-X דק'] │ │
│ │ 🌧 תוכנית גשם: …                       │ │
│ └────────────────────────────────────────┘ │
├────────────────────────────────────────────┤
│ ⚠ האם המסלול אפשרי?                        │  ← FeasibilityPanel (collapsible)
│ ⚠ ארוחת צהריים 13:00: רק 7 דק' מרווח —    │
│   דחה הזמנה או קצר ביקור                  │
├────────────────────────────────────────────┤
│ ציר היום                                   │  ← TimelineList
│ ●──── 09:00 🍳 ארוחת בוקר · אולגה  [נווט] │
│ │     חובה · ~מחיר *מקור · [מאושר]        │
│ ●═══▶ 14:00 🛁 סצ'ני · 2.5 שעות  (בתהליך)│
│ ○──── 19:30 🍽 ערב · חרדי/בשרי  [גיבוי↗] │
├────────────────────────────────────────────┤
│ שינויים והחלטות                            │  ← DayFeed
│ • יקיר הזיז ערב ל-19:30 (לפני 20 דק')     │
│ • ⚑ משימה קריטית: סגירת דירה עד 20.09     │
│ • 🗳 סקר פתוח: סירה בדנובה? (2/4 הצביעו)  │
│ • 💬 "מי לוקח כרטיס 100E?" 👍2 ❓1         │
└────────────────────────────────────────────┘
│ היום │ מסלול │ מפה │ כספים │ עוד           │  ← bottom nav
```

\* Weather values come from `weather_cache` only (with `source` + `fetched_at`); typical early-October
Budapest norms (day ~16–19°C, night ~7–10°C, rain possible, sunset ~18:05–18:15) are climate estimates for
planning only — never render them as live data. ☐ Verify against live provider at runtime.

## Components

| Component | Responsibility |
|---|---|
| `<StatusStrip>` | Sticky header: full date + "יום X/5", current area (nearest anchor/district), weather pill, group status, share-location, emergency button |
| `<WeatherPill>` | Now temp, min/max, rain %, wind, sunset — exclusively from latest `weather_cache` row; stale badge when `fetched_at` older than 3h; shows `source` |
| `<GroupStatusPill>` | Compact counts: flight check-in (from `reservations` flags) and "מוכנים" readiness (ephemeral realtime presence, not persisted) |
| `<ShareLocationButton>` | "שתף מיקום לשעה" — opens a 1-hour live-location share via native targets (WhatsApp live location / Google Maps / Apple share; pick the ~1h option where the target offers it). The app never receives, stores, or displays coordinates |
| `<EmergencyButton>` + `<EmergencySheet>` | 112 (EU emergency), accommodation address (once booked), link to the **viewing member's own** private insurance document (RLS-scoped; never render other members' docs) |
| `<DaySelector>` | Day 1–5 chips, horizontal swipe, "חזור להיום" jump-back chip; default = today mapped to day number |
| `<NextUpCard>` | Hero: name, start, leave-by + live countdown, address + walking distance, reservation state, cost pp + group, quick actions, backup-plan line |
| `<CountdownBadge>` | Ticks every 30s; turns amber ≤15 min, red ≤5 min to leave-by |
| `<TimelineList>` / `<TimelineItem>` | Vertical timeline; current item highlighted; per item: time, category icon, title, place, duration, cost, status, nav link, required/optional badge, backup indicator (↗) |
| `<StatusBadge>` + `<StatusMenu>` | Shows status; menu offers only legal transitions (see rules) |
| `<FeasibilityPanel>` | "האם המסלול אפשרי?" — warnings list, collapsible, recompute on any edit |
| `<DayFeed>` | Changes & decisions zone: today's update feed, open critical tasks, active-polls shortcut, quick notes with emoji reactions (not a chat) |
| `<PriceTag>` | Price + currency + `source` + `last_verified` + "אומת לאחרונה" quick action |

## Data & queries

Source of truth: `docs/03-data-model-and-rls.md`. All queries scoped to the single trip row and filtered by RLS.

| Data | Tables | Query shape |
|---|---|---|
| Trip frame | `trips` | Single row: `start_date=2026-10-04`, `end_date=2026-10-08`, `home_tz`, `dest_tz` |
| Members / counts | `trip_members` | Active members (4 confirmed; Roei `pending` excluded from denominators until accepted) |
| Selected day | `day_plans` → `itinerary_items` | `itinerary_items JOIN places LEFT JOIN reservations WHERE day_plan_id = $1 ORDER BY position` |
| Next Up | same join | First item `status IN ('planned','confirmed')` with `start_time >= now - 15m`, else current `in_progress` item, else first item of next day |
| Weather | `weather_cache` | Latest row for Budapest grid point: `now_temp, min, max, rain_pct, wind, sunset, source, fetched_at` |
| Costs | `expenses` + item estimates | Per-item est and per-day rollup; per-person = total ÷ active member count |
| Check-in status | `reservations` | Flight reservation per member → check-in flag (4/4 style counter) |
| Open polls shortcut | `polls`, `votes` | `polls WHERE status='open'` + cast-count for "2/4 הצביעו" |
| Feed | `day_notes`, `note_reactions` (schema gap — see Tasks) + activity derived from `itinerary_items.updated_at` | Latest 20 entries for the day |

## Logic/rules

1. **Day mapping.** `day_number = trip.start_date - today + 1` (clamped 1–5). Day 1 = 2026-10-04 … Day 5 = 2026-10-08. Default selection = today's mapping; outside the trip window default to Day 1 pre-trip and Day 5 post-trip.
2. **Timezone.** Store every item time with its timezone; render Budapest wall time everywhere. No mid-trip clock change: EU DST ends 2026-10-25, after the trip.
3. **Leave-by.** `leave_by = start_time − (walking_min + transit_min + buffer_min)`; buffer fixed 10–15 min (default 12, configurable per day).
4. **Reservation state badge** (one of): `מאושר` (confirmed), `נדרש תשלום` (payment needed), `להגיע מוקדם` (arrive early — derive recommended arrival), `ללא` (none).
5. **Status transitions** (enforce in UI + DB check):
   `planned → confirmed → in_progress → completed`; `planned|confirmed → skipped | cancelled`; `in_progress → completed | skipped`.
   `skipped|cancelled → planned` allowed for owner only (revert). Never allow `completed → anything`.
6. **"יצאנו" (we left).** Sets a realtime day-note "יצאנו ב-HH:MM", marks the preceding transit leg `completed` if one exists, refreshes feasibility.
7. **"מאחר ב-X דקות".** Presets 5/10/15/20 + custom. Posts a realtime note to the day feed and re-runs feasibility against the shifted start. Does **not** auto-move items; show a hint banner instead.
8. **Feasibility engine ("האם המסלול אפשרי?").** MVP = heuristic, no external API.
   - Inputs per item: estimated dwell (`duration_min`), user-entered `travel_min_to_next` (+ "בדוק במפות Google" deep link to validate), walking time, buffer 10–15 min, opening hours (only if verified: `source` + `last_verified`), hard reservation times.
   - For each consecutive pair: `arrival = prev_end + travel`; `slack = next_start − arrival`.
   - Warn when `slack < buffer`; hard-conflict when the next item has a reservation and `arrival > next_start`.
   - Warning format (example): "עזיבה 10:15 → הגעה 10:42; הפעילות מסתיימת 12:30; ארוחת צהריים 13:00 במרחק 23 דק' → רק 7 דק' מרווח — דחה הזמנה או קצר ביקור".
   - Auto travel-time API = **Phase 2** (out of scope here).
9. **Price display rule.** Every rendered price carries `source` + `last_verified` + a "אומת לאחרונה" one-tap action (stamps `last_verified = now`). Missing verification ⇒ render with "לא אומת" badge. Never present dynamic prices as facts.
10. **Share location.** Pure deep-link-out (OS share sheet / `https://wa.me/?text=<maps link>`). Zero location persistence — no coords in DB, logs, or realtime payloads.
11. **Emergency sheet.** Works fully offline: 112 dial link, accommodation address (cached once booked), own insurance doc link via signed URL when online / cached copy pointer when offline.

## Offline & realtime

- **Offline-first:** on load, cache all 5 `day_plans` + items + places + reservations + latest `weather_cache` into IndexedDB. The dashboard must render the full day with zero network.
- **Realtime channels** (Supabase): `itinerary_items` (status/order edits), `day_notes` (feed + late/we-left signals), `votes` (poll shortcut counters). Readiness ("מוכנים 3/4") = ephemeral presence broadcast, never persisted.
- **Writes offline:** status transitions and notes go through an outbox with background sync; optimistic UI with rollback on conflict (last-write-wins + feed entry "עודכן לאחר סנכרון").
- **Countdowns and feasibility** compute client-side — always available offline.

## Edge cases

- **Pre-trip:** dashboard shows countdown to Day 1 + critical pre-trip tasks (accommodation booking, deadline 2026-09-20 — critical). Day selector still browsable.
- **Post-trip:** read-only summary mode; hide countdown and quick actions.
- **Day with no items:** empty state with deep link to Route builder ("בנה את היום במסלול").
- **All items skipped (rain day):** show rain-day banner + one-tap link to backups in Route & Places (`01-route-and-places.md`).
- **Weather cache missing/stale:** show "אין נתוני מזג אוויר עדכניים" pill; never fabricate numbers; fall back to climate-norm note labeled as estimate.
- **Device in Israel pre-trip:** keep Budapest wall time + "שעון הונגריה" label; never mix device-local and Budapest times on one card.
- **Day 5 compressed morning:** feasibility buffer floor raised to 15 min; IZ292 dep 10:25 is a hard fixed anchor; warn if any item is scheduled within the airport-arrival window (airport arrival target = owner-entered estimate, e.g. 2h before — verify Arkia recommendation ☐).
- **Location share canceled externally:** app shows nothing (it never knew); no broken UI state.
- **Roei pending → joins:** denominators (per-person costs, poll counts) recompute from `trip_members` on next render.

## Tasks

- [ ] Add `day_notes` + `note_reactions` tables to `docs/03-data-model-and-rls.md` (migration + RLS) — schema gap for the feed.
- [ ] Add `checkin_done` flag source on flight `reservations` (or derive from member checklist) — reconcile with data model.
- [ ] Build `<StatusStrip>`, `<WeatherPill>`, `<GroupStatusPill>`, `<ShareLocationButton>`, `<EmergencySheet>`.
- [ ] Build `<DaySelector>` with swipe + today-jump.
- [ ] Build `<NextUpCard>` with `<CountdownBadge>` and the four quick actions.
- [ ] Build `<TimelineList>` with legal-transition `<StatusMenu>`.
- [ ] Implement feasibility engine (heuristic) + `<FeasibilityPanel>` warnings.
- [ ] Implement `<DayFeed>`: derived activity entries + notes + emoji reactions + critical-task + open-poll shortcut.
- [ ] Implement `<PriceTag>` with source/last_verified + "אומת לאחרונה" action everywhere a price renders.
- [ ] Implement offline cache (IndexedDB) for the 5 days + outbox sync for status/notes.
- [ ] Wire realtime channels: `itinerary_items`, `day_notes`, `votes`.
- [ ] Seed emergency sheet: 112; accommodation address placeholder (pending booking); own-insurance-doc link.
- [ ] Verify Arkia IZ291 arrival time and IZ292 recommended airport arrival (source: Arkia; last_verified: —). ☐

## Acceptance criteria

- [ ] Opening "היום" on trip days shows correct "יום X/5", Budapest-time clock, and the day's timeline from cache within 1s, offline.
- [ ] Next Up card shows leave-by + live countdown; countdown reaches red ≤5 min without drift.
- [ ] All four quick actions work: navigate deep link opens maps; ticket/booking opens reservation; "יצאנו" and "מאחר ב-X דקות" appear in the group feed via realtime within 2s (online).
- [ ] Only legal status transitions are offered; illegal ones are impossible via UI and rejected by DB.
- [ ] Feasibility panel produces the slack warning for a deliberately overloaded day and clears when the item is moved.
- [ ] Every price on screen shows source + last_verified; "אומת לאחרונה" updates the stamp.
- [ ] Weather renders only from `weather_cache` with source + fetched_at; stale data is badged.
- [ ] Share-location opens the OS share target; no coordinates are stored anywhere (code review + network trace).
- [ ] Emergency sheet opens offline with 112, accommodation address, and own-insurance link only.
- [ ] "מאחר" note triggers feasibility re-evaluation and shows the shift-hint banner.
- [ ] Hebrew RTL renders correctly on a 360px-wide device; touch targets ≥ 48px.

## Out of scope

- Auto travel-time API (Google Routes / BKK) — Phase 2.
- Native push notifications — Phase 2 (in-app realtime toasts only).
- Full chat / message threads — feed is notes + reactions only.
- Live GPS member tracking inside the app — explicitly rejected (privacy); share goes out via OS apps.
- Weather radar / map layers.
