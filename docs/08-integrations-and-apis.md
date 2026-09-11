---
id: integrations-apis
title: Integrations & APIs
status: draft
depends_on: [architecture]
last_updated: 2026-09-11
---

# Integrations & APIs

Define every external service the Trip Companion PWA touches: what it is for, which
provider we use and why, exact endpoints, caching, and what happens when it fails.

Guiding rules:

- **Client never calls external APIs directly.** All third-party data flows through a
  daily server-side cron into Supabase cache tables (`weather_cache`, `exchange_rates`);
  the app reads only from the DB. This keeps us offline-first, avoids API-key exposure,
  and makes failure states uniform ("stale badge" instead of a broken widget).
- **Never state dynamic facts as absolute.** Prices, schedules, and rates carry
  `source` + `last_verified_at` and render as estimates (see
  [docs/03-data-model-and-rls.md](03-data-model-and-rls.md)).
- Deep links (maps, WhatsApp, tel:) are not "integrations" in the data sense — they are
  URL builders in one helper module. Keep them dumb and testable.

Trip anchors used below: Budapest center lat `47.4979`, lon `19.0402`; timezone
`Europe/Budapest` (UTC+2 in October); trip window 2026-10-04 → 2026-10-08.

## 1. Weather — Open-Meteo

**Purpose:** daily forecast on the Today screen (dress decisions, rain warnings).

**Provider: Open-Meteo** — free for non-commercial use, **no API key**, reliable,
and returns machine-readable daily fields without parsing HTML.

**Endpoint:**

```text
https://api.open-meteo.com/v1/forecast
  ?latitude=47.4979&longitude=19.0402
  &daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunset
  &timezone=Europe%2FBudapest
  &start_date=2026-10-04&end_date=2026-10-08
```

**Caching:** one server-side cron call per day (Vercel Cron → route handler) upserts
into `weather_cache (date, temp_min, temp_max, precipitation_probability, wind, sunset, fetched_at)`.

**Failure fallback:** render the last cached row with a visible "stale" badge
(Hebrew: "נתונים ישנים") showing `fetched_at`. If no cache exists, hide the widget —
never show a spinner forever.

- [ ] Implement cron route `app/api/cron/weather/route.ts` (service-role key, server-only).
- [ ] Verify Open-Meteo non-commercial terms still cover this use at build time.
- [ ] Test fallback by pointing the cron at an invalid URL and confirming the stale badge renders.

## 2. FX rates — Frankfurter.app

**Purpose:** show HUF prices with approximate ILS/EUR context on the Money screen.

**Provider: Frankfurter.app** — free, **no API key**, sourced from ECB reference
rates, simple JSON.

**Endpoint:**

```text
https://api.frankfurter.app/latest?from=HUF&to=ILS,EUR,USD
```

**Caching:** daily cron upserts into `exchange_rates (base='HUF', quote, rate, fetched_at, source='frankfurter.app')`.

**Manual override:** `exchange_rates` includes an `is_override` flag so the group can pin
the rate they actually got at an exchange booth or from a card statement; the UI prefers
an override row over the ECB row and labels it.

**Warning copy (Hebrew UI, spec'd here):** card charges and cash exchange differ from
the mid-market rate — expect spread + fees. Render this as a standing disclaimer on the
Money screen. Never present converted amounts as exact.

- [ ] Implement cron route `app/api/cron/fx/route.ts`.
- [ ] Add the mid-market disclaimer string to the i18n messages file.
- [ ] Verify Frankfurter.app is up and free at build time; fallback = last cached + stale badge.

## 3. Maps & navigation deep links

**Purpose:** every place/schedule item gets a "navigate" action — zero ambiguity.

**Approach:** universal URL deep links, no Maps SDK, no API key. One helper module
owns all URL building: `lib/utils/deeplinks.ts`.

**Spec for `lib/utils/deeplinks.ts`:**

```ts
// All functions return strings only. No fetching, no side effects.
googleMapsDir(origin: string, destination: string, mode: 'transit' | 'walking' | 'driving'): string
//   https://www.google.com/maps/dir/?api=1&origin=<enc>&destination=<enc>&travelmode=<mode>
googleMapsSearch(query: string): string
//   https://www.google.com/maps/search/?api=1&query=<enc>
appleMapsDir(destination: string): string
//   https://maps.apple.com/?daddr=<enc>
wazeNav(lat: number, lon: number): string        // optional
//   https://waze.com/ul?ll=<lat>,<lon>&navigate=yes
```

Rules:

- `destination` accepts an address string or `"lat,lon"`; always `encodeURIComponent`.
- Default `travelmode=transit` in Budapest; walking for ≤ 1.5 km hops.
- On iOS offer Apple Maps as fallback; Waze is optional and car-only (rare on this trip).
- Open links in a new tab / external app (`target="_blank" rel="noopener"`).

- [ ] Implement `lib/utils/deeplinks.ts` with unit tests for encoding and mode selection.
- [ ] Verify each deep-link pattern opens the native app on Android and iOS before the trip.

## 4. BudapestGO / BKK transit

**Purpose:** routes, real-time departures, and digital tickets in Budapest.

**Approach:** BudapestGO is the official BKK app and has **no public API suitable for
MVP** — so we **deep-link out** and store static guidance in the app.

Content the app must surface (Transport screen):

- BudapestGO install links — App Store and Google Play.
  - [ ] Verify both store URLs before the trip (source: bkk.hu, last_verified: TBD).
- **100E Airport Express warning:** requires a **special ticket**; regular BKK tickets
  and passes are **NOT valid** on it. Price is ~2,500 HUF per BKK
  (source: bkk.hu — dynamic, tag `source` + `last_verified_at`).
  - [ ] Verify current 100E price and validity rules on bkk.hu before the trip.
- Anchor station: **Deák Ferenc tér** (metro interchange M1/M2/M3) — default origin
  for transit directions until accommodation is booked.
- Link to BKK info pages: `https://bkk.hu/en/` for tickets/prices.
  - [ ] Verify the English tickets page URL and current single-ticket / 72h / group
        24h pass prices before the trip; store results in `places`/`transit_notes`
        with `source` + `last_verified_at`, never hardcoded in components.

**Failure fallback:** none needed — content is static and offline-cached; the deep
link simply fails to open if the user hasn't installed BudapestGO, so always show the
install links next to the deep link.

## 5. Calendar export

**Purpose:** let members add flights and key schedule items to their personal calendars.

**Approach:** generate `.ics` files **library-free** (build the string by hand — the
format is trivial and a dependency is not justified), plus a Google Calendar template
link as a one-tap alternative.

ICS requirements:

- Always emit `DTSTAMP`, `DTSTART`, `DTEND`, `UID`, `SUMMARY`, `DESCRIPTION`.
- Use `TZID=Europe/Budapest` for local Budapest events and `TZID=Asia/Jerusalem` for
  the TLV departure — never floating times.
- Example skeleton:

```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//budapest-boys-trip//EN
BEGIN:VEVENT
UID:iz291-outbound@trip
DTSTAMP:20260911T000000Z
DTSTART;TZID=Asia/Jerusalem:20261004T163500
DTEND;TZID=Europe/Budapest:20261004T190000
SUMMARY:Flight IZ291 TLV → BUD
DESCRIPTION:Arkia reservation 1385•••93 — check-in ≥3h prior
END:VEVENT
END:VCALENDAR
```

- Google Calendar template link pattern:

```text
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text=<enc>&dates=<UTC start>/<UTC end>&details=<enc>&location=<enc>
```

- [ ] Implement `lib/utils/ics.ts` with unit tests (VTIMEZONE not required when TZID is an IANA name on modern clients — verify on iOS + Android).
- [ ] Verify the flight arrival time above against the e-ticket before shipping the flight event (source: Arkia e-ticket res. 13859993; mask in UI as `1385•••93`).

## 6. Communication links

**Purpose:** one-tap contact and sharing.

- WhatsApp share: `https://wa.me/?text=<url-encoded text>` — for sharing the day plan
  or a poll to the group chat.
- `tel:` links: EU emergency **112**; Arkia customer service **+972-3-6903712**
  (source: Arkia e-ticket / arkia.co.il — verify before trip); accommodation host
  (fill after booking, see [docs/06-features/03-accommodation.md](06-features/03-accommodation.md)).
- `mailto:` links for pre-trip email drafts to the group.
- [ ] Verify Arkia's phone number on arkia.co.il before the trip (last_verified: TBD).
- [ ] Verify Israeli consular contact details from the MFA website before the trip and
      store them in the medical/emergency screen (see
      [docs/06-features/08-medical-safety.md](06-features/08-medical-safety.md)).

## 7. Arkia airline

**Purpose:** manage booking, online check-in, flight status.

**Approach:** link out; **manual flight status in MVP**.

- Manage booking / online check-in: `https://www.arkia.co.il` (exact deep path —
  verify). Reservation 13859993, masked as `1385•••93` in UI.
- Check-in rule: arrive ≥ 3 hours before departure — outbound IZ291 dep 16:35 (IL) ⇒
  airport by 13:35; return IZ292 dep 10:25 (HU) ⇒ airport by 07:25.
- Flight status: a member updates status manually in the app (`scheduled / delayed /
  boarding / landed`) with a timestamp; Realtime pushes it to the group.
  A future API-based status feed is **out of scope** for MVP.
- [ ] Verify the exact Arkia manage-booking and online check-in URLs before the trip.
- [ ] Verify online check-in opening window on arkia.co.il and add it to the checklist
      template in [docs/09-import-and-seed.md](09-import-and-seed.md).

## 8. Image processing — client-side only

**Purpose:** keep uploads small (storage + bandwidth) and strip metadata.

**Approach:** no server service. Compress in the browser with
`createImageBitmap` + Canvas, encode to **WebP**, and generate a **400 px thumbnail**.
Transcoding through Canvas drops EXIF/GPS by default — this is our metadata-strip
mechanism (see [docs/04-security-and-privacy.md](04-security-and-privacy.md) §5).

Spec:

- Max input 15 MB; reject larger with a friendly Hebrew error.
- Output: max edge 2048 px (full) and 400 px (thumb), WebP quality ~0.8.
- Opt-in toggle: "keep location" — skips compression only for that upload's metadata
  (note: Canvas always strips; to truly keep EXIF we would attach the original — MVP:
  toggle records `has_location=true` and stores lat/lon read before stripping).

- [ ] Implement `lib/utils/image.ts` (compress + thumbnail) and test on iOS Safari
      (HEIC input) and Android Chrome.
- [ ] Verify EXIF absence in a processed output file as part of the security checklist.

## 9. Summary table

| Integration | Provider | Cost | Key required | Cache | Fallback |
|-------------|----------|------|--------------|-------|----------|
| Weather | Open-Meteo | Free | No | `weather_cache`, daily cron | Last cached + stale badge |
| FX rates | Frankfurter.app (ECB) | Free | No | `exchange_rates`, daily cron + manual override | Last cached + stale badge |
| Maps / navigation | Google Maps URLs / Apple / Waze | Free | No | n/a (URL builders) | Alternate provider link |
| Transit | BudapestGO / bkk.hu | Free | No (no API in MVP) | Static content, offline-cached | Install links + bkk.hu link |
| Calendar | Hand-built ICS + Google template | Free | No | n/a | Manual entry |
| Communication | wa.me / tel: / mailto: | Free | No | n/a | Copy-to-clipboard |
| Flights | Arkia website, manual status | Free | No | Manual status in DB | Member updates manually |
| Image processing | Browser Canvas (client-side) | Free | No | n/a | Upload original if compression fails |

## 10. Rate limits & cost guardrails

- Cron runs **once per day** per feed (weather, FX). Do not poll client-side.
- **Justification for "no client-side external calls":** (a) offline-first requirement —
  the app must work on the plane and in metro tunnels from DB/IndexedDB cache; (b) zero
  API keys in the client bundle; (c) one code path for failure handling (stale badge);
  (d) free-tier rate limits cannot be exhausted by 5 users refreshing.
- Set Vercel Cron schedules for ~06:00 Europe/Budapest so data is fresh at breakfast.
- Guardrail: if any provider ever requires a key or payment, swap provider before paying
  — open an ADR per [docs/02-architecture.md](02-architecture.md).
- [ ] Add both cron schedules to `vercel.json` and protect the routes with a cron secret header.

## Acceptance criteria

- [ ] Today screen shows weather from `weather_cache`; killing the network still shows
      the last cached day with a stale badge.
- [ ] Money screen converts HUF → ILS via `exchange_rates`, shows the mid-market
      disclaimer, and prefers a manual override row when present.
- [ ] Every place and schedule item renders a working navigate deep link (Google Maps,
      transit mode default) on Android and iOS.
- [ ] Transport screen shows the 100E special-ticket warning and BudapestGO install
      links, all readable offline.
- [ ] Downloaded `.ics` for IZ291 imports correctly with `Europe/Budapest` /
      `Asia/Jerusalem` timezones on Google Calendar and Apple Calendar.
- [ ] No external API call originates from the browser (verify via DevTools network tab).
- [ ] All dynamic figures in UI carry visible or inspectable `source` + `last_verified_at`.

## Out of scope

- Real-time flight status APIs, live transit APIs, in-app ticket purchasing.
- Map SDKs (Google Maps JS, Mapbox) — deep links only.
- Server-side image processing pipelines.
- Paid tiers of any provider.
