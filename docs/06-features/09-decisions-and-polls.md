---
id: feature-polls-decisions
title: Decisions & Polls
status: draft
depends_on: [data-model]
last_updated: 2026-09-11
---

# Decisions & Polls ("החלטות")

## Goal

Kill the group-chat loop of "מה סוף סוף החלטנו?" — one mechanism to propose options,
vote with a deadline, close with a clear rule, and **convert the winner into the plan**
with a recorded rationale, so every decision is made once and never re-litigated.

Entry points: a section under the "עוד" tab, shortcut chips in Today's DayFeed
([00-today-dashboard.md](00-today-dashboard.md)), "vote" actions on place sheets in
Route & Places ([01-route-and-places.md](01-route-and-places.md)), and WhatsApp share
deep links. Output: an `itinerary_items` row on a chosen DayPlan + a permanent,
append-only decision log.

Group: 4 confirmed members (+ Roei pending → support 4–6). Owner: Yakir — tie-break
and override authority (stated in the UI, logged when used).

## User stories

- As any member, I create a poll with 2–5 options where each option shows cost,
  travel time, time needed, and availability, so we compare real trade-offs instead
  of vibes.
- As a member, I vote once and can change my vote until the deadline.
- As a poll creator, I keep votes anonymous until close when the topic is sensitive
  (usually budget).
- As the owner, ties and deadlocks end with my call — and that call is logged.
- As a member, the winning option becomes a scheduled itinerary item in one tap, with
  "why we decided" attached forever.
- As a member, I browse the decision log to recall what we decided and why, without
  scrolling chat history.

## Screen layout

### Polls list (`/more/polls`)

```text
┌────────────────────────────────────────────┐
│ החלטות                      [+ סקר חדש]    │
│ 🗳 פתוחים (1)                              │
│ ┌────────────────────────────────────────┐ │
│ │ איפה ארוחת ערב ביום 3?                 │ │
│ │ ⏱ נסגר 06.10 20:00 (בעוד 3:10) · רוב   │ │
│ │ אנונימי עד סגירה · הצביעו 2/4          │ │
│ │ [הצבע / שנה הצבעה] [שיתוף בוואטסאפ]    │ │
│ └────────────────────────────────────────┘ │
│ 📜 יומן החלטות                              │
│ • 05.10 — סצ'ני 14:00 יום 2 · 4/4          │
│   "הכי זול עם כרטיס מקוון" · [פעילות ↗]    │
│ • 04.10 — שייט בדנובה: ללא הכרעה (0 הצבעות)│
└────────────────────────────────────────────┘
```

### Create poll (bottom sheet)

```text
┌────────────────────────────────────────────┐
│ סקר חדש                                    │
│ שאלה: [איפה ארוחת ערב ביום 3?]             │
│ אפשרות 1: [חרדי/בשרי — רובט]               │
│   מחיר ~[4,500 Ft/אדם] *מקור ☐             │
│   נסיעה [12 דק'] · זמן במקום [75 דק']       │
│   זמינות: [פתוח עד 22:00 ☐ אומת]           │
│   מקום מקושר: [— בחירה מהספרייה]           │
│ אפשרות 2: [אולגה] · …                      │
│ (+ עד 5 אפשרויות)                          │
│ סגירה: [06.10 20:00] · כלל: ◉ רוב ○ פה אחד │
│ ☐ אנונימי עד סגירה                         │
│ ⓘ בתיקו — יקיר (מנהל הטיול) מכריע          │
│ [שיתוף בוואטסאפ]            [פרסום הסקר]    │
└────────────────────────────────────────────┘
```

### Vote screen (open poll)

```text
┌────────────────────────────────────────────┐
│ איפה ארוחת ערב ביום 3?                     │
│ נסגר 20:00 (בעוד 3:10) · רוב · הצביעו 2/4  │
│ ◉ א׳ חרדי/בשרי · ~4,500 Ft/אדם * · 12 דק'  │
│ ○ ב׳ אולגה · ~3,800 Ft/אדם * · 25 דק'      │
│ ○ ג׳ שייט + ארוחה · ~9,000 Ft/אדם * · 40 דק'│
│ [שמור הצבעה]                                │
│ ⓘ אנונימי: התוצאות ייחשפו בסגירה           │
└────────────────────────────────────────────┘
```

### Closed poll → convert

```text
┌────────────────────────────────────────────┐
│ ✅ נסגר: א׳ חרדי/בשרי — 3 מתוך 4 הצבעות    │
│ פירוט: יקיר א׳ · בר א׳ · אהרן ב׳ · יהונתן א׳│
│ למה: "הכי קרוב לדירה והזול מבין הבשריים"   │
│ [🗓 הפוך לפעילות ביום 3] → 19:30 · ארוחה    │
│    סטטוס: ◉ מאושר ○ מתוכנן                 │
└────────────────────────────────────────────┘
```

\* Every price is an estimate carrying `source` + `last_verified` (rule 9).

## Components

| Component | Responsibility |
|---|---|
| `<PollList>` | Open polls (deadline countdown + turnout) and the decision log below |
| `<PollComposer>` | Question, 2–5 option rows, deadline, quorum rule, anonymity toggle, tie-break explainer |
| `<OptionRow>` (composer) | Label, cost estimate + `<PriceTag>`, `travel_min`, `time_needed_min`, availability note, optional linked place |
| `<VotePanel>` | Radio list of options; save/change vote until deadline; live turnout |
| `<ResultReveal>` | Post-close counts + per-member breakdown (per anonymity rules) |
| `<QuorumPicker>` | רוב (majority) / פה אחד (unanimous); always shows "בתיקו — הכרעת המנהל" |
| `<ConvertDialog>` | DayPlan + start time (+ tz) + category + status (confirmed/planned) → creates the item; shows feasibility preview |
| `<DecisionLog>` | Closed polls: winner, rationale, votes, linked item — append-only |
| `<WhatsAppShareButton>` | Deep link out: question + options as URL-encoded text |
| `<ClosingSoonToast>` | Realtime T-2h reminder to non-voters |

## Data & queries

Canonical tables: `polls`, `poll_options`, `votes` (see `docs/03-data-model-and-rls.md`).

| Data | Tables | Notes |
|---|---|---|
| Poll header | `polls` | `question`, `status: open/closed`, `deadline_at` (tz-aware), `quorum_rule: majority/unanimous`, `anonymous_until_close: bool`, `created_by`, `decision_note`, `closed_at`, `closed_reason: deadline/manual`, `winner_option_id`, `overridden_by`, `winner_item_id` |
| Options | `poll_options` | `label`, `cost_est_amount` + `currency` + `source` + `last_verified_at`, `travel_min`, `time_needed_min`, `availability_note`, `place_id` (nullable) |
| Votes | `votes` | `poll_id`, `option_id`, `member_id`, `voted_at`; **unique(`poll_id`,`member_id`)** — one vote per member |
| Convert output | `itinerary_items` | New `poll_id` column (schema gap — Tasks) |
| Linked place | `places` | Reuses cost/map data for the option |

Typical queries:

```ts
// Open polls with turnout for the list
supabase.from('polls').select('*, poll_options(*), votes(member_id)').eq('status', 'open');

// My vote (upsert target; RLS: write own row only)
supabase.from('votes')
  .upsert({ poll_id, option_id, member_id: myMemberId }, { onConflict: 'poll_id,member_id' });

// Decision log
supabase.from('polls').select('*, poll_options(label), itinerary_items(id, start_time)')
  .eq('status', 'closed').order('closed_at', { ascending: false });
```

Schema gaps to reconcile in the data model (see Tasks): `polls.decision_note`,
`polls.closed_reason`, `polls.winner_option_id`, `polls.overridden_by`,
`polls.winner_item_id`, `itinerary_items.poll_id`.

## Logic/rules

1. **Creation.** Any member creates a poll. 2–5 options enforced client- and
   server-side. Deadline required and must be in the future. Quorum rule required.
   Anonymity optional. The composer always states: "בתיקו — יקיר (מנהל הטיול) מכריע".
2. **Voting.** One vote per member per poll (DB unique index). Changeable (upsert)
   until `deadline_at`; locked after. RLS: a member writes only their own vote row.
3. **Visibility.** `anonymous_until_close = true` → per-option counts and voter
   identities hidden until close (only turnout n/4 shows). After close, reveal counts
   + voters. State honestly in the composer: anonymity is display-level only — rows
   are member-readable in the DB. Non-anonymous polls show live counts.
4. **Close.** Automatic at `deadline_at` (authoritative server function: scheduled
   sweep + lazy reconcile on first read/write after the deadline), or manual close by
   the creator or the owner.
5. **Resolution at close.**
   - Non-votes at the deadline count as **abstain** — they never block a result.
   - `majority`: winner = strict majority (>50%) of **cast votes**; if no strict
     majority, the top option wins labeled "רוב יחסי" (plurality).
   - `unanimous`: passes iff all **cast** votes select one option (abstentions don't
     block); if cast votes split, fall back to majority of cast votes.
   - Tie or zero votes → no auto-winner. The owner picks an option or "ללא הכרעה";
     the override is logged (`overridden_by` + `decision_note`).
6. **Convert.** One tap on the winner → `<ConvertDialog>`: choose DayPlan, start time
   (+ tz), category, status (`confirmed` default when the option has a reservation,
   else `planned`). Creates one `itinerary_item` with `poll_id` set and `decision_note`
   copied; the poll stores `winner_item_id` (bidirectional link). Idempotent — a
   second convert opens the existing item. After convert, re-run that day's
   feasibility (Today engine) and surface warnings.
7. **Notifications.** On create: realtime toast to all members + WhatsApp share deep
   link (question + options, URL-encoded text, no tokens or identifying params).
   T-2h before deadline: "closing soon" realtime toast targeted at non-voters.
   Native push = Phase 2.
8. **Decision log.** Closed polls are append-only history: question, winner,
   rationale, votes, linked item. Polls cannot be deleted; the owner can annotate.
9. **Price rule.** Option cost estimates render via `<PriceTag>`: source +
   `last_verified` + "אומת לאחרונה" quick action. Unverified ⇒ "לא אומת" badge.
   Never present estimates as facts.

## Offline & realtime

- Realtime channels: `polls` (new poll / closed) and `votes` (turnout counters;
  option-level detail only when non-anonymous).
- Voting works offline: optimistic write + outbox. On sync, the server enforces the
  deadline — a vote arriving after close is rejected and rolled back with a toast:
  "הסקר נסגר — ההצבעה לא נכללה".
- Close resolution is authoritative server-side; clients that were offline show
  "ממתין לסגירה" until reconcile.
- The decision log and open polls are cached in IndexedDB (read-only offline).

## Edge cases

- **Unanimous rule with non-voters at deadline:** non-votes = abstain; voters'
  unanimity wins — no deadlock (rule 5).
- **Tie:** routes to the owner; the pick is logged with "override" in the decision log.
- **Zero votes:** closes as "ללא הכרעה"; the owner may reopen once with a new deadline
  or decide directly (logged).
- **Roei joins mid-poll:** turnout/quorum denominators recompute from active
  `trip_members` at close; his vote counts only if he is a member before close.
- **Vote sent offline, arrives after close:** rejected server-side, user notified,
  not counted.
- **Winning option's linked place was rejected/visited meanwhile:** convert warns and
  offers to detach the place or re-pick.
- **Convert into an overloaded day:** feasibility warning inside `<ConvertDialog>`
  ("יום 3 צפוף — מרווח 7 דק'"), suggest another slot before confirming.
- **Deadline in the past or < 15 min ahead at creation:** validation error.
- **Double convert:** idempotent — opens the same item.
- **Creator unavailable to close manually:** deadline auto-close always applies; the
  owner can also close any poll manually.

## Tasks

- [ ] Reconcile schema in `docs/03-data-model-and-rls.md`: `polls.decision_note`,
      `closed_reason`, `winner_option_id`, `overridden_by`, `winner_item_id`;
      `itinerary_items.poll_id` (+ migration; RLS unchanged — members read/write).
- [ ] DB function `close_expired_polls()` (sweep + lazy-on-read reconcile)
      implementing rule 5 resolution logic.
- [ ] Unique index `votes(poll_id, member_id)` + server-side deadline enforcement on
      vote writes.
- [ ] Build `<PollComposer>` (2–5 options, per-option fields, quorum + anonymity +
      tie-break copy).
- [ ] Build `<PollList>` / `<VotePanel>` with realtime turnout and
      change-until-deadline.
- [ ] Build `<ResultReveal>` + `<DecisionLog>`.
- [ ] Build `<ConvertDialog>` (day/time picker, feasibility preview, idempotency).
- [ ] WhatsApp share deep-link builder (sanitized text, no identifying params).
- [ ] T-2h closing-soon reminder (realtime toast + local scheduling).
- [ ] Today feed integration: new/closed polls appear as DayFeed shortcut chips.

## Acceptance criteria

- [ ] A 2-option poll can be created, voted by 4 members, auto-closes at the deadline,
      and shows per-option counts only per the anonymity rule.
- [ ] Changing a vote before the deadline works; after the deadline the write is
      rejected server-side (tested with an outbox replay).
- [ ] A unanimous poll with only 2/4 cast votes resolves without deadlock (abstain
      rule) — verified scenario test.
- [ ] A tied poll routes to the owner; the owner's pick appears in the log flagged as
      an override.
- [ ] One-tap convert creates an `itinerary_item` on the chosen day with
      `decision_note` + `poll_id`; tapping convert again opens the same item.
- [ ] The converted item triggers a feasibility re-check; overloading the day shows
      the warning.
- [ ] New-poll and T-2h reminders arrive via realtime; WhatsApp share opens with the
      question + options text.
- [ ] The decision log lists all closed polls with rationale; deletion is impossible
      via UI and API.
- [ ] Option cost estimates always render source + last_verified; unverified shows
      the "לא אומת" badge.
- [ ] Hebrew RTL on a 360px device; touch targets ≥ 48px; polls list renders offline
      from cache.

## Out of scope

- Native push notifications — Phase 2 (realtime in-app toasts only).
- Ranked-choice / weighted / proxy voting — one member, one vote.
- Cryptographic anonymity — display-level only (members share one DB).
- External voters (non-members) or in-WhatsApp voting bots.
- Chat threads around polls — light discussion stays in the Today notes feed.
