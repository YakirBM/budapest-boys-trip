---
id: feature-checklists
title: Checklists — Prep, Daily & Departure
status: draft
depends_on: [data-model]
last_updated: 2026-09-11
---

# 06 — Checklists ("רשימות")

One screen that carries the group from today (2026-09-11, 23 days before departure) through
pre-flight prep, the 5 trip days, departure morning, and up to 7 days after return. Three list
types with strict permissions, pre-seeded template lists, item dependencies (blocked-by),
per-list progress, and reminders that ping the assignee only — never the group.

## Goal

1. Nobody forgets a prep step: every member sees exactly which items are theirs, with due dates
   and priorities, on the Today dashboard and in the Checklists tab.
2. Status is shared truth online or offline: a toggle anywhere updates everyone's progress bars
   via realtime, and queued via the outbox when offline.
3. Hard sequencing is enforced by the data model: a blocked item cannot be marked done until
   all of its `blocked_by` items are done.
4. Templates are reusable: every seeded list can be duplicated (statuses reset) for future trips.

## User stories

- As Yakir (owner), I seed all template lists once so the group never rebuilds prep from memory.
- As a member, I see "my items" across all lists with due dates, so my prep is one glance.
- As an assignee, I get a reminder for my item — and only I get it, no group spam.
- As a member, I cannot check "עלינו למטוס" until all four members finished online check-in.
- As a member, I see per-list progress (e.g. 13/17) and the group pre-flight readiness widget on Today.
- As a member offline at the airport, I toggle items and they sync when I reconnect.
- As the group, after the trip we duplicate this trip's lists as templates for the next one.

## List types & permissions

| Type | Scope enum | Who sees it | Who edits fields | Who toggles status | Typical use |
|---|---|---|---|---|---|
| Personal | `personal` | Owner only | Owner | Owner | Medications, private packing |
| Group | `group` | All members | Any member | Any member | Apartment arrival, departure day |
| Assigned | `assigned` | All members | Creator or assignee | **Assignee only** | Pre-flight per-member items |

Permission matrix (enforced in UI **and** RLS — `docs/04-security-and-privacy.md`):

| Action | personal | group | assigned |
|---|---|---|---|
| View list + items | owner | all members | all members |
| Create item | owner | any member | any member (recorded as creator) |
| Edit item fields | owner | any member | creator or assignee |
| Toggle status / mark done | owner | any member | assignee only |
| Attach file | owner | any member | creator or assignee |
| Delete list | owner | creator | creator |

RLS sketch: personal rows require `owner_id = auth.uid()`; assigned status updates require
`assignee_id = auth.uid()`; every policy additionally gates on active trip membership.

## Screen layout

### Lists overview (`/checklists`)

```text
┌─────────────────────────────────┐
│ רשימות                    [+ חדשה]│
│ ┌─────────────────────────────┐ │
│ │ ✈ לפני הטיסה       ▓▓▓░ 9/14│ │ ← ProgressRow
│ │ 🎒 יום הטיסה       ░░░  0/7 │ │
│ │ 🏠 כניסה לדירה     ░░░  0/6 │ │
│ │ 🌅 כל בוקר         ▓░░  1/6 │ │
│ │ 🍺 יציאה ללילה     ░░░  0/5 │ │
│ │ 🧳 יום החזרה       ░░░  0/6 │ │
│ │ 📦 אחרי הטיול      ░░░  0/5 │ │
│ └─────────────────────────────┘ │
│ tabs: שלי · קבוצתי · תבניות     │
│ [+ שכפול רשימה מתבנית]          │
└─────────────────────────────────┘
```

### List detail

```text
┌─────────────────────────────────┐
│ ✈ לפני הטיסה        ▓▓▓░ 9/14   │
│ ── שלי (3) ──────────────────── │
│ ☑ ביטוח נסיעה + פוליסה   קריטי │
│ ☐ צ׳ק-אין אונליין  🔒  קריטי   │  ← locked: blocked_by
│ ☐ eSIM פעיל             חשוב   │
│ ── של אחרים ─────────────────── │
│ ☑ תוקף דרכון — בר       קריטי │
│ ☐ תוקף דרכון — אהרון    קריטי │
│ [ + פריט ]                      │
└─────────────────────────────────┘
```

Touch targets ≥ 48 px; checkbox is the primary tap; row tap opens the item editor.

## Item structure (`checklist_items`)

| Field | Type | Notes |
|---|---|---|
| `title` | text | Required. Hebrew UI string. |
| `description` | text | Optional context, links, rules. |
| `type` | text | Free classification (e.g. `doc`, `purchase`, `pack`, `safety`) for filtering. |
| `assignee_id` | uuid → members | Null on group items = "whoever gets to it". |
| `due_at` + `tz` | timestamptz + enum | Pre-trip: `Asia/Jerusalem`; in-trip: `Europe/Budapest`. Always labeled. |
| `priority` | enum | `critical` / `important` / `normal`. |
| `status` | enum | `not_started` / `in_progress` / `done` / `blocked` (with reason). |
| `link_url` | text | Deep link (e.g. Arkia check-in, BudapestGO). No tokens/identifying params (docs/04). |
| `attachment_path` | storage path | Private bucket only, signed URLs, sensitive-aware. |
| `reminder_offset_minutes` | int | Minutes before `due_at`; null = no reminder. |
| `blocked_by` | uuid[] self-ref | May reference items in other lists of this trip. |
| `list_id`, `created_by`, timestamps | FK/audit | Standard audit columns. |

Status rules:

```text
not_started → in_progress → done
any state   → blocked (reason required) → previous state
can_complete(item) = ∀ b ∈ item.blocked_by : status(b) = done
```

## Templates (pre-seeded)

Seeding rules:

- Run once per trip; creates the 7 lists below with the scopes shown.
- Assignee `each member` expands to N `assigned` items at seed time (4 now; re-run expansion
  if Roei confirms before seed; `docs/09-import-and-seed.md` owns the seed script).
- Assignees are **suggestions** — editable by anyone with edit rights.
- Items marked ⚠ are dynamic/assumed facts: carry `source` + `last_verified_at` in the
  description and keep the verify checkbox until confirmed.

### (a) Pre-flight — due before 2026-10-03 (`pre-flight`, assigned/group mix)

| # | Item (UI string) | Assignee | Priority | Due | Notes |
|---|---|---|---|---|---|
| 1 | בדיקת תוקף דרכון (≥ 6 ח׳ אחרי 2026-10-08) | each member | critical | 2026-09-18 | ⚠ Schengen ≥6-month rule — verify; log each expiry |
| 2 | רכישת ביטוח נסיעה + העלאת פוליסה | each member | critical | 2026-09-25 | Policy number is sensitive: private bucket, opt-in view (docs/04) |
| 3 | צ׳ק-אין אונליין Arkia | each member | critical | 2026-10-03 16:35 IL | ⚠ T−24h window — verify from Arkia; deep-link to flights page |
| 4 | eSIM או חבילת רואמינג | each member | important | 2026-10-01 | Install + activate test before flight day |
| 5 | החלפת מט"ח ראשונית / כרטיסים בין-לאומיים | Yakir (suggestion) | important | 2026-10-02 | Amount = **group decision placeholder** — poll; HUF is base (docs/06-features/05-finance.md) |
| 6 | מטענים + מתאם EU (Type C/F) | each member | normal | 2026-10-03 | |
| 7 | תרופות אישיות | each member | critical | 2026-10-03 | Private note allowed (personal copy) |
| 8 | הורדת BudapestGO + מפות אופליין | each member | important | 2026-10-03 | Offline maps for Budapest region |
| 9 | הצטרפות לאפליקציה + בדיקת מג׳יק לינק | each member | critical | 2026-09-20 | Allowlisted email; confirm magic-link login works |

### (b) Flight day — 2026-10-04 (`flight-day`, group + assigned)

| # | Item (UI string) | Assignee | Priority | Notes |
|---|---|---|---|---|
| 1 | דרכון בתיק | each member | critical | |
| 2 | ארנק | each member | critical | |
| 3 | eSIM פעיל | each member | important | |
| 4 | משקל מזוודה בתקנה | each member | important | ⚠ carry-on ≤ 8 kg combined per Arkia — verify against booking (docs/06-features/02-flights.md) |
| 5 | הגעה לטרמינל 3 עד 13:35 | group | critical | = dep 16:35 `Asia/Jerusalem` − 3h airport check-in rule |
| 6 | כרטיסי עלייה למטוס שמורים אופליין | each member | critical | blocked_by: my item #3 (cross-list) |
| 7 | עלינו למטוס (ספירה בשער) | Yakir | critical | blocked_by: all 4 × item #3 — the canonical dependency demo |

### (c) Apartment arrival — Day 1 evening (`apartment-arrival`, group)

| # | Item (UI string) | Assignee (suggestion) | Priority | Notes |
|---|---|---|---|---|
| 1 | Wi-Fi עובד | Yakir | important | Password → shared (non-sensitive) note |
| 2 | קוד לדלת עובד | Yakir | critical | |
| 3 | ספירת מיטות ×4 | Yehonatan | critical | +1 if Roei confirmed |
| 4 | תיעוד ניקיון/נזקים בתמונות | Bar | important | Photos → `trip-media`, signed URLs; protects deposit |
| 5 | מפתחות/קודים אצל כולם | Aharon | critical | |
| 6 | מיקום מרכול קרוב | Bar | normal | Pin on shared map |

Accommodation is **not booked yet** — this list activates only after booking
(`docs/06-features/03-accommodation.md`); keep it in `draft` until then.

### (d) Every morning — 2026-10-05 → 10-07 (`morning`, group, duplicated daily)

| # | Item (UI string) | Priority | Notes |
|---|---|---|---|
| 1 | מטענים | normal | |
| 2 | מים | normal | |
| 3 | פאוור בנק טעון | important | |
| 4 | ארנק | critical | |
| 5 | שכבה ל־7–18°C | normal | ⚠ October climatology estimate — verify real forecast (docs/08-integrations-and-apis.md) |
| 6 | מטרייה לפי התחזית | normal | Conditional: shown when forecast rain-probability high |

Implementation: one template list; tap "שכפול ליום חדש" each morning (statuses reset).
No recurring engine in v1.

### (e) Night out (`night-out`, group, duplicated per night)

| # | Item (UI string) | Assignee | Priority | Notes |
|---|---|---|---|---|
| 1 | תוכנית חזרה ידועה (קו אחרון) | Yakir | critical | ⚠ verify night transport schedule that day (BudapestGO) |
| 2 | סוללה | each member | normal | |
| 3 | אמצעי תשלום (כרטיס + מעט מזומן) | each member | important | |
| 4 | נקודת מפגש אם נפרדים | group | important | Set before first drink |
| 5 | לא להשאיר משקה ללא השגחה | each member | critical | Safety rule — checkbox = acknowledgment |

### (f) Departure day — 2026-10-08, IZ292 departs 10:25 `Europe/Budapest` (`departure-day`, group)

Timeline (times from `docs/06-features/02-flights.md`):

```text
06:10 יציאה מהדירה → 06:30 קו 100E → ~07:25 הגעה ל-BUD → 10:25 המראה IZ292
      (כל השעות: Europe/Budapest)
```

| # | Item (UI string) | Assignee | Priority | Notes |
|---|---|---|---|---|
| 1 | אריזה מלאה | each member | critical | Due 2026-10-07 22:00 (night before) |
| 2 | סוויפ של החדר (מטענים, מתאם, דרכון!) | each member | critical | |
| 3 | צ׳ק-אאוט | Yakir | critical | |
| 4 | החזרת מפתחות/קודים | Yakir | critical | |
| 5 | יציאה בזמן — 06:10 | group | critical | ⚠ verify 100E schedule on BudapestGO closer to date |
| 6 | תוכנית לשארית HUF | group | normal | ⚠ airport FX rates are poor — verify; prefer spending or keeping |

### (g) Post-trip — due by 2026-10-15 (`post-trip`, group + assigned)

| # | Item (UI string) | Assignee | Priority | Due | Notes |
|---|---|---|---|---|---|
| 1 | סגירת חובות (עד 7 ימים) | each member | critical | 2026-10-15 | Cross-link finance settlement plan (docs/06-features/05-finance.md) |
| 2 | הורדת תמונות משותפות | each member | important | 2026-10-15 | Media wall |
| 3 | גיבוי קבצים (קבלות, מסמכים) | Yakir | important | 2026-10-15 | |
| 4 | דירוג מקומות | each member | normal | 2026-10-15 | Feeds future-trip templates |
| 5 | ייצוא CSV מהכסף | Yakir | normal | 2026-10-15 | |

## Dependencies & blocked-by

- `blocked_by` holds item UUIDs, possibly cross-list (check-in → boarding passes → boarded).
- The done-toggle renders **locked** (🔒, disabled) while any blocker is open; tapping it shows
  "חסום ע״י: …" with tappable links to the blockers.
- Server-side validation rejects `status = done` with unresolved blockers — an outbox replay
  that violates the rule is rejected and the item reverts (see Edge cases).
- The example to unit-test: item (b)#7 "עלינו למטוס" is blocked by all four (a)#3 check-in items;
  it unlocks only when the fourth member checks in.

```text
list_progress(L) = |done(L)| / |eligible(L)|          # eligible = not deleted
readiness        = list_progress(pre-flight)          # drives Today widget
member_ready(m)  = done_assigned(m) / total_assigned(m)
```

## Progress & readiness widget

- Every list header shows a progress bar + count in `done/total` form (e.g. `13/17`).
- **Pre-flight readiness widget** on the Today dashboard
  (`docs/06-features/00-today-dashboard.md`): overall readiness %, one mini-bar per member
  (4 bars; 5th appears if Roei confirms), and the single most urgent open critical item.
  Tap → deep-link into `pre-flight`. Updates via realtime.

## Reminders

- Delivered **to the assignee only** (personal lists: owner). Group items with no assignee get
  no reminder — that is intentional anti-spam behavior.
- Default offsets by priority: `critical` → T−24h, `important` → T−2h, `normal` → T−1h;
  per-item override via `reminder_offset_minutes`.

```text
notify_at = due_at − reminder_offset
if notify_at ∈ quiet_hours: notify_at = next quiet_end
quiet_hours = 22:00–07:30 local (owner-configurable)
```

- Local timezone for quiet hours: `Asia/Jerusalem` pre-trip, `Europe/Budapest` from landing.

## Template reuse

- **Duplicate-list** ("שכפול רשימה"): copies list + items with all statuses reset to
  `not_started`; preserves intra-list `blocked_by` topology; drops cross-list blockers with a
  visible notice. Used daily for `morning`/`night-out` and once for future trips.
- Export/import a list as JSON (no attachments) for portability across trips.

## Data & queries

Tables: `checklists`, `checklist_items` (schema: `docs/03-data-model-and-rls.md`).

| Query | TanStack key | Notes |
|---|---|---|
| Lists for member | `['lists', memberId]` | personal (own) + all group/assigned |
| Items of list | `['items', listId]` | ordered by section → priority → due |
| My open items | `['my-items', memberId]` | Today widget + badge counts |
| Progress | derived client-side | recompute on any item mutation |

Realtime: subscribe to `checklist_items` changes for the trip's list IDs; invalidate the
affected keys; toggles are optimistic and reconcile with the server response.

## Offline & realtime

- Status toggles work offline: write to IndexedDB + outbox (pending badge on the row), replay
  FIFO via background sync (`docs/07-pwa-and-offline.md`).
- Conflicts: last-writer-wins on `updated_at`, with an audit row; done-wins is NOT applied —
  an explicit un-check after sync is respected.
- Full lists readable offline from cache; item creation and editing also outbox-queued.
- Attachment upload/camera requires connectivity; queued and flushed on reconnect.
- Realtime propagates other members' toggles to all progress bars within ~5 s.

## Edge cases

- **Roei confirmed mid-trip:** expansion of `each member` seeds runs for him from confirmation
  (pre-flight items still relevant get assigned; already-passed ones are skipped); readiness
  widget gains a fifth bar; group lists unchanged.
- **Delete list:** cascade-delete items, write an audit row, offer undo snackbar for 10 s.
- **Offline done on a blocked item:** accepted locally, rejected at sync; item reverts to
  previous status with an explanatory banner linking to the blocker.
- **Duplicate with cross-list blockers:** blockers dropped; notice lists which items lost links.
- **Sensitive attachment** (e.g. insurance policy in item (a)#2): private bucket, signed URLs,
  never rendered in shared views (docs/04-security-and-privacy.md).
- **Due-date timezones:** every due date renders with a tz chip; the 100E timeline and flight-day
  items are `Europe/Budapest`, pre-flight items `Asia/Jerusalem`.
- **Reminder fires offline:** queued locally; delivered as a local notification on next app open
  if the push window passed.
- **List with zero items:** progress renders as `0/0` + "ריקה" state, not NaN.

## Tasks

- [ ] Implement `checklists` + `checklist_items` with RLS policies per the permission matrix.
- [ ] Build lists overview + list detail screens (RTL, ≥48px targets, progress bars).
- [ ] Implement `blocked_by` validation client- and server-side; unit-test the check-in→boarded chain.
- [ ] Write the seed script for the 7 template lists incl. `each member` expansion (docs/09-import-and-seed.md).
- [ ] Build item editor (title, description, assignee, due+tz, priority, link, attachment, reminder, blockers).
- [ ] Build duplicate-list action with status reset + cross-list blocker notice.
- [ ] Build pre-flight readiness widget on Today + cross-link.
- [ ] Implement reminders (assignee-only, priority offsets, quiet hours).
- [ ] Outbox + pending badge + background sync for item toggles/creates.
- [ ] Realtime subscription + optimistic progress updates.
- [ ] JSON export/import for a list.
- [ ] Verify ⚠ items (passport rule, Arkia check-in window, baggage allowance, 100E schedule) and record source + `last_verified_at`.

## Acceptance criteria

- [ ] All 7 template lists seed with the exact items above; `each member` expands to 4 (5 if Roei confirmed).
- [ ] Permission matrix holds under RLS: personal invisible to others; assigned status togglable by assignee only.
- [ ] "עלינו למטוס" stays locked until all four check-in items are done; unlocking updates on all devices ≤ 5 s.
- [ ] Progress bars show `done/total` per list; readiness widget on Today matches list math exactly.
- [ ] Offline toggle syncs on reconnect with no duplicates and correct conflict resolution.
- [ ] Reminders reach only the assignee; quiet hours respected; no group-channel notifications.
- [ ] Duplicate-list resets statuses and preserves intra-list dependencies.
- [ ] Deleting a list cascades, audits, and offers 10 s undo.
- [ ] Every ⚠ item carries source + `last_verified_at` or an open verify checkbox.
- [ ] Sensitive attachments open only via signed URLs for the owner/authorized member.

## Out of scope

- Sub-tasks/nested checklists (flat items only in v1).
- Recurring-rule engine (daily lists are duplicated manually).
- External calendar/reminder sync (Google Calendar, iOS Reminders).
- Gamification (streaks, points).
- Push-notification infrastructure beyond the shared app service (`docs/07-pwa-and-offline.md`).
