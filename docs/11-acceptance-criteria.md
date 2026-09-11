---
id: acceptance-criteria
title: Acceptance Criteria
status: draft
depends_on: [implementation-roadmap]
last_updated: 2026-09-11
---

# 11 — Acceptance Criteria

Definition of done for the app and each feature. Build order: [10-implementation-roadmap.md](10-implementation-roadmap.md).
A feature is done only when its own list AND the global DoD both pass.

## Global Definition of Done

The release (and every feature PR) satisfies ALL of:

- [ ] RLS enabled and tested on every table and on `storage.objects`; deny-by-default verified with
      negative tests ([03-data-model-and-rls.md](03-data-model-and-rls.md), [04-security-and-privacy.md](04-security-and-privacy.md)).
- [ ] Hebrew RTL correct everywhere: `dir="rtl"`, logical CSS properties only
      (`ms-/me-/ps-/pe-`, `start/end`) — zero physical `left/right` in app CSS
      ([05-ui-ux-design-system.md](05-ui-ux-design-system.md)).
- [ ] Every screen implements all four states: loading, empty, error, offline
      ([05-ui-ux-design-system.md](05-ui-ux-design-system.md)).
- [ ] Every scheduled time carries its timezone; rendered with `Intl` in the correct target zone —
      no naive `Date` math.
- [ ] Every dynamic price/rate/route renders `source` + `last_verified_at`; unverified values display
      as estimates (hard rule 5).
- [ ] PWA installable: Lighthouse PWA checks pass, install prompt works on Android Chrome,
      manifest + icons valid ([07-pwa-and-offline.md](07-pwa-and-offline.md)).
- [ ] Zero console errors/warnings on the core flows (login, today, expense, checklist).
- [ ] `pnpm build` and `pnpm lint` + typecheck pass in CI.
- [ ] No secrets in repo: `gitleaks` (or manual scan) clean over history; publishable key only in
      `.env.local`/Vercel, never committed.
- [ ] Touch targets ≥ 48px on all interactive elements.
- [ ] All user-facing strings come from the messages/i18n file — no hardcoded Hebrew strings in components.

## Per-feature acceptance

### Today dashboard — [00-today-dashboard.md](06-features/00-today-dashboard.md)

- [ ] Opens on the correct trip day (1–5) based on Europe/Budapest local date.
- [ ] Shows that day's items ordered by time, each with time + tz, title, address, owner, cost, status.
- [ ] Weather strip renders with source + last_verified_at (Phase 2), degrades gracefully when absent.
- [ ] Tomorrow preview section present; tapping an item opens its detail.
- [ ] Works offline: day plan + item details render from cache ([07-pwa-and-offline.md](07-pwa-and-offline.md)).
- [ ] Empty day still renders a useful screen (not a blank page).

### Route & places — [01-route-and-places.md](06-features/01-route-and-places.md)

- [ ] Quick-add inbox: pasting/typing an idea creates a place candidate in seconds.
- [ ] Promoting a candidate to an itinerary item requires time + tz, address, owner; cost optional but
      labeled estimate if unverified.
- [ ] Every item has a working navigation deep link (Google Maps).
- [ ] Drag/reorder of items within a day persists.
- [ ] Items appear on the Today dashboard for their date.
- [ ] Deletion is confirmed and reflected offline.

### Flights — [02-flights.md](06-features/02-flights.md)

- [ ] Both flights render: IZ291 TLV T3 → BUD 2026-10-04 16:35 Asia/Jerusalem; IZ292 BUD → TLV
      2026-10-08 10:25 Europe/Budapest; each shows its timezone explicitly.
- [ ] Arrival times display as "unverified estimate (~3.5h)" until `arrival_time_verified = true` —
      never as fact.
- [ ] Booking ref shown masked (1385•••93) — grep proves no full ref renders.
- [ ] All 4 passengers listed per direction with masked serials.
- [ ] Baggage rules shown: handbag 40×30×20 included, combined carry-on ≤8kg, trolley/checked extra fee.
- [ ] Arkia contact + check-in guidance present (airport ≥3h; online window when verified).
- [ ] Private e-ticket PDF reachable via signed URL from the flights page only.

### Accommodation — [03-accommodation.md](06-features/03-accommodation.md)

- [ ] Intake form captures: name, full address, check-in/out date+time+tz, total cost + currency,
      confirmation ref, host contact, booking link.
- [ ] Page renders the record with address + navigation deep link once entered.
- [ ] Before booking: page shows deadline (2026-09-20) and candidate list state.
- [ ] Confirmation ref masked in shared views per security doc; full value via reveal + signed doc link.
- [ ] Check-in/out times carry timezone; day 1 route includes "get keys", day 5 includes checkout.

### Transportation — [04-transportation.md](06-features/04-transportation.md)

- [ ] Hub page renders anchor (Deák Ferenc tér) + airport transfer options (100E bus emphasized).
- [ ] 100E price shown with source + last_verified_at; "verify" badge until confirmed on bkk.hu.
- [ ] BudapestGO guidance + deep links; ticket/fare-block options explained.
- [ ] Every transit item has a navigation deep link and works from the Deák anchor.
- [ ] Offline: page + links usable in airplane mode (links open the maps/transit apps).

### Finance — [05-finance.md](06-features/05-finance.md)

- [ ] Expense entry in ≤15s on a real phone (measured, see budgets).
- [ ] Supports HUF/ILS/EUR/USD entry; HUF base; conversion renders source + last_verified_at.
- [ ] Splits: equal and custom; each expense shows payer, participants, per-head amount.
- [ ] Balances view computes who-owes-whom with a minimal settlement suggestion.
- [ ] Mark-settled flow with confirmation; history preserved.
- [ ] Offline entry queues to outbox and syncs with last-write-wins
      ([07-pwa-and-offline.md](07-pwa-and-offline.md)).

### Checklists — [06-checklists.md](06-features/06-checklists.md)

- [ ] 4 seeded templates present with expected item counts (per [09-import-and-seed.md](09-import-and-seed.md)).
- [ ] Toggle persists online and queues offline; conflict resolution last-write-wins.
- [ ] Progress indicator per list; per-member assignment visible.
- [ ] Adding a custom item works and syncs.
- [ ] Templates render in Hebrew; no placeholder English leaks to UI.

### Media wall — [07-media-wall.md](06-features/07-media-wall.md)

- [ ] Upload from phone gallery to `trip-media` (private bucket) starts ≤3s (see budgets).
- [ ] Grid view with day grouping; images load progressively; failures show retry.
- [ ] Client-side compression applied before upload (Phase 2).
- [ ] Reactions render and sync.
- [ ] Videos: explicitly out of scope (cut list) — UI must not offer video upload.
- [ ] All access via short-TTL signed URLs; no public URLs anywhere.

### Medical & safety — [08-medical-safety.md](06-features/08-medical-safety.md)

- [ ] Emergency screen: 112 call button (≥48px) + Arkia numbers + consular entry (with verify badge).
- [ ] Numbers are `tel:` links and available offline from the app shell.
- [ ] Insurance section is PRIVATE-PER-USER: a member sees only their own policy number/document.
- [ ] Passport scans open only via signed URL from owner's private view — never in shared views.
- [ ] Viewing a member's medical/emergency profile records an audit event (app_events).
- [ ] Any member's allergy/medication emergency card renders offline if owner opted in to share.

### Decisions & polls — [09-decisions-and-polls.md](06-features/09-decisions-and-polls.md)

- [ ] Create poll: question + 2–N options + optional deadline.
- [ ] One vote per member per option set; changing a vote allowed until close.
- [ ] Results update for all members (Realtime online; refresh offline).
- [ ] Open polls surface on the Today dashboard when relevant.
- [ ] Roei accept/decline decision tracked as a poll or explicit status (see
      [09-import-and-seed.md](09-import-and-seed.md)).

## Performance budgets

Measured on Moto G-class device, throttled 4G, production build (source: doc 11 budgets,
last_updated: 2026-09-11).

| Metric | Budget | Measured |
|---|---|---|
| LCP (Today, cold) | < 2.5s | [ ] |
| TTI | < 3.5s | [ ] |
| CLS | < 0.1 | [ ] |
| Expense entry (open → saved) | < 15s human time | [ ] |
| Upload start (tap → bytes moving) | < 3s | [ ] |
| Service worker precache total | < 2MB | [ ] |

## Security checklist

- [ ] Allowlist trigger test: 6th, non-allowlisted email is rejected at signup.
- [ ] RLS negative tests: user A cannot SELECT user B's insurance policy, documents, or emergency
      profile rows; anonymous (anon key) cannot read any app table.
- [ ] Masked refs in UI: grep shipped code for `13859993` / full e-ticket serials — only masked forms.
- [ ] EXIF (GPS, serials) stripped from media before/at upload — verified with a test photo.
- [ ] Signed URLs expire (≤1h TTL) — verified by re-opening an old URL.
- [ ] Audit log (`app_events`) records medical/emergency profile and document views.
- [ ] No public buckets: CI assertion + dashboard check for `trip-media` and `trip-documents`.
- [ ] No secrets in repo (gitleaks or manual scan clean).

## Airplane-mode UAT script

Run on a real Android phone (and once on iOS with step 10 adapted) on a fresh install:

1. Install the PWA (or open once and Add to Home Screen on iOS) while online; log in.
2. Wait for the offline pack to build (Today + safety + bookings + addresses cached).
3. Enable airplane mode; confirm the offline banner/state indicator.
4. Open **Today** → day plan for that date renders with times, tz labels, addresses, owners.
5. Open an itinerary item → address + navigation deep link render (maps may fail to load tiles —
   the app must not crash; deep link into the maps app is acceptable).
6. Open **Safety/Medical** → the 112 call button is present and tappable; Arkia numbers render.
7. Open **bookings** → flights (times + tz + passengers + baggage) and accommodation (address, refs)
   render from cache.
8. Toggle a checklist item and create an expense while offline → UI shows pending-sync state.
9. Inspect the outbox (in-app indicator or DevTools → IndexedDB) → 2 queued mutations.
10. Disable airplane mode → mutations sync automatically (Background Sync); on iOS trigger manual retry.
11. Verify the checklist toggle and the expense now appear for a second member on another device.
12. Turn airplane mode back on → cached content still renders; no stale-sync errors.
13. (Online again) Confirm no duplicate expenses/checklist entries were created by the sync.

Pass = steps 4–13 succeed with no console errors and no data loss.

## Pre-trip sign-off

Complete for every member before departure (2026-10-04). Owner: Yakir.

| Member | PWA installed | Logged in | Insurance uploaded (private) | Check-in done (T−24h) | Offline pack verified |
|---|---|---|---|---|---|
| Yakir Elazar Ben Menashe | [ ] | [ ] | [ ] | [ ] | [ ] |
| Aharon Meyer Lawrence | [ ] | [ ] | [ ] | [ ] | [ ] |
| Yehonatan Winestate | [ ] | [ ] | [ ] | [ ] | [ ] |
| Bar Mevorach Johan | [ ] | [ ] | [ ] | [ ] | [ ] |
| Roei (pending) | [ ] | [ ] | [ ] | [ ] | [ ] |

Notes:

- Check-in: Arkia airport check-in opens ≥3h before departure (verified e-ticket fact); the **online
  check-in window is unverified** — complete this row after verifying with Arkia
  (source: arkia.co.il / *5758 — to verify; T−24h is the working assumption).
- Offline pack = the airplane-mode UAT steps 4–7 pass on that member's own phone.
- Roei's row only applies if the membership decision lands positive
  ([09-import-and-seed.md](09-import-and-seed.md)).
