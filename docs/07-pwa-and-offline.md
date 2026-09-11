---
id: pwa-and-offline
title: PWA and Offline
status: draft
depends_on: [architecture]
last_updated: 2026-09-11
---

# 07 — PWA and Offline

Implements the offline-first requirements from [01-requirements-and-constraints.md](01-requirements-and-constraints.md)
on top of [02-architecture.md](02-architecture.md). Acceptance budgets: [11-acceptance-criteria.md](11-acceptance-criteria.md).

## PWA goals and install targets

- Make the app installable, and make the offline contract work in airplane mode: daily plan, item details,
  emergency numbers/actions, bookings metadata, addresses, anchor stations, last-known FX rates.
- Primary target: **Android + Chrome** (4 confirmed members) — full install prompt, Background Sync, persistent storage.
- Secondary target: **iOS Safari** — manual install, no Background Sync; degrade gracefully (see iOS specifics).
- [ ] Confirm every member installed the PWA and opened it once online BEFORE departure on 2026-10-04.

## Web app manifest

Serve from `app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "בודפשט 2026",
    short_name: "בודפשט",
    lang: "he",
    dir: "rtl",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff", // placeholder — align with design tokens
    theme_color: "#1d4ed8",      // placeholder — align with design tokens
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] Produce `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` (≥10% safe-zone padding), `apple-touch-icon.png` (180×180).
- [ ] Align `theme_color` / `background_color` with tokens in [05-ui-ux-design-system.md](05-ui-ux-design-system.md) — values above are placeholders (source: placeholder, last_verified: 2026-09-11).
- [ ] Preview the maskable icon against Android circle/squircle masks.

## Service worker strategy

Decision: **custom service worker** at `public/sw.js`, registered from a small client component.
Reject Serwist (`@serwist/next`) and Workbox for this project.

Justification:

1. The outbox/background-sync flow and Dexie integration need explicit, auditable control — a ~200-line custom SW beats an opaque framework for 5 days × 6 users.
2. No build-step coupling with the App Router bundler or a moving plugin API.
3. Precache needs are tiny (app shell + offline fallback); the runtime rules below do the rest.

- [ ] Write `scripts/build-sw-manifest.mjs`: emits `public/sw-manifest.js` (shell assets + build id); bump per deploy.
- [ ] Register the SW in production only; keep dev on plain network to avoid stale-cache confusion.
- [ ] Ship `app/offline/page.tsx` as the navigation fallback.

Precache: `/today`, `/offline`, manifest, icons, bottom-nav SVGs.

### Runtime caching rules

| Resource | Strategy | Notes |
|---|---|---|
| Page navigations (RSC/HTML) | stale-while-revalidate | instant cached shell, refresh in background; fall back to `/offline` when uncached |
| `/_next/static/*` | cache-first | hashed, immutable |
| Supabase PostgREST GET | network-first, cache fallback | key includes user id; never cache mutations |
| Storage signed URLs (media/docs) | cache-first + revalidate | on 400/403 (expired URL) evict entry, request a fresh signed URL |
| Open-Meteo / Frankfurter | never fetched client-side | read `weather_cache` / `exchange_rates` via Supabase only (see cron in [02-architecture.md](02-architecture.md)) |
| Auth + Realtime endpoints | network-only | never cache |

## Offline data layer

Use **Dexie** (IndexedDB wrapper) as the on-device store. Mirror only what the offline contract needs;
Supabase stays the source of truth.

```ts
// lib/offline/db.ts
import Dexie, { type Table } from "dexie";

export class TripDB extends Dexie {
  today_plan!: Table<TodayPlanRow, string>;
  bookings!: Table<BookingRow, string>;
  emergency!: Table<EmergencyRow, string>;
  places_cache!: Table<PlaceRow, string>;
  outbox_expenses!: Table<OutboxExpense, string>;
  outbox_checklist!: Table<OutboxToggle, string>;
  outbox_media!: Table<OutboxMedia, string>;

  constructor() {
    super("budapest-trip");
    this.version(1).stores({
      today_plan: "id, date",
      bookings: "id, kind",
      emergency: "id",
      places_cache: "id, day",
      outbox_expenses: "id, created_at",
      outbox_checklist: "id, item_id",
      outbox_media: "id, created_at",
    });
  }
}
```

- Populate snapshot tables on app load and on realtime events.
- Stamp every snapshot row with `synced_at`; display its age whenever the app is offline.
- [ ] Add `synced_at` rendering to `/today` and `/money`.

## Background sync and conflict policy

Use the **outbox pattern** for every offline mutation:

1. Apply the change optimistically to the UI and TanStack Query cache.
2. Append an op to the matching `outbox_*` table with a client-generated id and `updated_at`.
3. Register Background Sync tag `outbox-flush`; ALSO flush on `online` events and on app foreground —
   this covers iOS, which has no reliable Background Sync (source: MDN, last_verified: 2026-09-11 — - [ ] verify before release).
4. On flush, replay ops in order; on success remove them and invalidate affected queries; on failure keep them and retry with backoff.

Conflict policy:

| Data | Policy | Why |
|---|---|---|
| Checklist toggles | last-write-wins by `updated_at` | low contention in a 6-person group |
| Expense rows | insert-only, conflict-free | new rows never collide |
| Balances / settlements | **server-wins, recomputed** | never trust client-derived totals; recompute from `expenses` — see [06-features/05-finance.md](06-features/05-finance.md) |
| Media uploads | resume from `outbox_media` Blob | request a FRESH signed upload URL at flush time; never persist signed URLs |

- [ ] Show a "ממתין לסנכרון" (pending sync) badge on any entity with outbox ops, plus a total count in `/more`.

## What works offline

| Feature | Offline behavior |
|---|---|
| Daily plan (`/today`) | full — last synced snapshot, `synced_at` shown |
| Item details, addresses, anchor stations | full — from `today_plan` + `places_cache` |
| Emergency numbers and actions (`/safety`) | full — `tel:`/SMS deep links need no data connection |
| Bookings and documents | metadata full; files only if previously opened/cached |
| FX last-known rates | full, labeled with `last_verified_at`, shown as estimate |
| Realtime updates | degraded — paused; resync on reconnect |
| Fresh weather / FX | degraded — last-known values with age label |
| Media upload | degraded — queued, pending badge |
| Polls voting | degraded — queued, applied on flush |

## Update flow

When a new service worker reaches `waiting`: show a toast **"עדכון זמין"** with a confirm action.
On confirm, `postMessage({ type: "SKIP_WAITING" })` and reload on `controllerchange`.
Never force-reload mid-session; the outbox survives reloads in IndexedDB anyway.

## iOS specifics

- iOS Safari never fires `beforeinstallprompt` (source: web.dev, last_verified: 2026-09-11 — - [ ] verify). Render manual instructions: Share → "הוסף למסך הבית" (Add to Home Screen).
- Provide `apple-touch-icon` (180×180) and the `apple-mobile-web-app-capable` meta tag.
- Detect standalone mode via `window.navigator.standalone` to hide install instructions.
- iOS evicts website data of unused apps under storage pressure (source: WebKit blog, last_verified: 2026-09-11 — - [ ] verify current policy); instruct members to open the app once before departure and once more on plane Wi‑Fi.
- No Background Sync → rely on `visibilitychange` + `online` flush.

## Storage quota and eviction

- [ ] Call `navigator.storage.persist()` on first launch; log `navigator.storage.estimate()`.
- Eviction order under pressure: media thumbnails → stale signed-URL responses → old pages. NEVER evict `emergency`, `today_plan`, or `outbox_*`.
- Cap cached media at 200 MB, evicting oldest first.

## Testing plan

Airplane-mode UAT (run on one real Android device and one iPhone before departure):

1. Install the PWA, sign in with magic link, open every bottom-nav tab once while online.
2. Enable airplane mode.
3. Open `/today` — plan renders with its sync timestamp.
4. Open a booking, an address, and `/safety`; tap a `tel:` link (cancel before the call connects).
5. Add an expense and toggle a checklist item offline; verify pending badges appear.
6. Disable airplane mode; verify the outbox flushes, badges clear, and balances are recomputed server-side.
7. Kill and relaunch the app mid-queue (step 5 → kill → step 6); verify no duplicate expenses.
8. Run a Lighthouse PWA audit: installable, offline start URL, zero console errors.

- [ ] Record UAT results in [11-acceptance-criteria.md](11-acceptance-criteria.md).

## Acceptance criteria

- [ ] Lighthouse PWA checks pass (installable, offline shell, valid manifest + icons).
- [ ] Every "works offline" row above verified in airplane mode on Android AND iOS.
- [ ] Outbox ops survive a full app kill and flush on reconnect without duplicates.
- [ ] Update toast appears on new deploys and reloads only on user confirm.
- [ ] Emergency numbers, bookings, addresses, and the daily plan render with zero network.

## Out of scope

- Web push notifications (revisit post-MVP).
- Background fetch of full-resolution media.
- Multi-trip support.
- Periodic Background Sync.
