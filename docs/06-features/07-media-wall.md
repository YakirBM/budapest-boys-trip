---
id: feature-media-wall
title: Media Wall — "The Memory Wall"
status: implemented-partial
depends_on: [data-model]
last_updated: 2026-09-11
---

# 07 — Media Wall ("קיר הזיכרונות")

A shared photo wall for the Budapest trip (2026-10-04 → 2026-10-08). Every member dumps photos from their phone in seconds, the group watches the wall fill up in real time during the trip, and nothing escapes the trip: private buckets, signed URLs, stripped metadata, hard RLS.

## Goal

Answer three questions with "yes, always":

1. Can any member upload the day's photos in under a minute — offline-tolerant, without thinking about formats or sizes?
2. Can the group browse, like and comment live — including on flaky hotel WiFi?
3. Is it structurally impossible for a photo to leak (no public URLs, EXIF/GPS stripped, private toggle enforced by RLS)?

Hard rule: this page is for **group memories only**. Sensitive documents (passport scans, insurance PDFs) never enter `trip-media` — they live in `trip-documents` (see `docs/06-features/08-medical-safety.md`).

## User stories

- As a member, I multi-select ~20 photos from my camera roll, tap once, and walk away — compression, thumbnails and upload happen in the background with per-file progress.
- As a member on a phone, I can select several photos and the app processes at most two concurrently
  to avoid memory spikes. Offline upload replay remains a future enhancement.
- As a member, I browse a fast masonry grid filtered by day / uploader / place / tag, open fullscreen, like, and drop a short comment.
- As an uploader, I can mark any photo private — visible only to me, enforced by RLS.
- As a member, I tag who appears in a photo so we can filter "everything with Aharon".
- As the group, one photo per day is featured as "רגע היום" (moment of the day).
- As the uploader / trip owner, I can download the best available original; other members download the compressed copy.
- As a member, no upload ever fails silently — every failure is visible with a retry.

## Screen layout

Entry: bottom-nav **More** ("עוד") → "קיר הזיכרונות". Single scroll page, RTL, mobile-first, touch targets ≥ 48px.

```text
┌─────────────────────────────────┐
│ קיר הזיכרונות          [📷 העלאה]│
│ ┌ יום▾ │ מעלה▾ │ מקום▾ │ תג▾ ┐ │ ← FilterChips
│ │ יום 1│ יום 2│ יום 3│ ...   │ │
│ └─────────────────────────────┘ │
│ ┌──┐┌──┐┌──┐                   │
│ │  ││  ││  │  ┌──┐┌──┐        │ ← MediaGrid (2-col narrow / 3-col wider)
│ │  │└──┘└──┘  │  ││  │        │   infinite scroll
│ └──┘┌──┐┌──┐  └──┘└──┘        │
│     │  ││ ⏳ממתין│               │ ← pending badge item (outbox)
│     └──┘└──────┘               │
│ ┌─────────────────────────────┐ │
│ │ ⭐ רגע היום — יום 3          │ │ ← MomentBanner
│ │ [featured photo · ♡ 4 · 💬 2]│ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ⏫ מעלה 3 תמונות… ▓▓▓░ 2/3  │ │ ← UploadBar (sticky)
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

Fullscreen viewer (`MediaViewer`):

```text
┌─────────────────────────────────┐
│ [←]  יום 3 · 21:14          [⋯] │
│                                 │
│        (pinch-zoom image)       │
│                                 │
│ 📍 Széchenyi Fürdő · העלה: Yakir│
│ 👥 Yakir, Aharon   [♡ 4] [💬 2] │
│ [הורדת עותק איכותי]  [🔒 פרטי]  │
└─────────────────────────────────┘
```

## Components

| Component | Purpose |
|---|---|
| `MediaGrid` | Masonry (2 columns on narrow phones, 3 on wider phones) of signed 400px thumbnails; currently capped at 240 rows. |
| `MediaPicker` | `<input type="file" multiple accept="image/*">`, `capture="environment"` on mobile for direct-camera shots. |
| `UploadBar` | Sticky bar during uploads: N files, per-file progress, cancel, "X ממתין לסנכרון" state. |
| `FilterChips` | Free search across title/caption/person/place/album/tag plus day, album, place and "רק שלי" filters; combinable. |
| `MomentBanner` | "רגע היום" featured strip per day (see rules below). |
| `MediaViewer` | Fullscreen swipe pager, pinch-zoom, info panel (time/place/uploader/tags), like, comments sheet, download, ⋯ menu (edit caption/tags, private toggle, delete). |
| `CommentsSheet` | Short comments (≤ 280 chars), realtime updates. |
| `TagEditor` | Metadata sheet: title, caption, day, virtual album creation/selection, member chips, place and free tags. |
| `PrivateBadge` | Lock chip rendered only for the uploader on private items. |

## Data & queries

Tables `media_items` and `media_reactions` (canonical definitions live in `docs/03-data-model-and-rls.md` — keep the two in sync; this table is the working field list).

### `media_items` — all fields

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | **Generated client-side** → idempotent outbox replay. |
| `trip_id` | uuid FK → trips | RLS scope. |
| `uploader_id` | uuid FK → members | |
| `storage_path` | text | Compressed WebP object path in `trip-media` (scheme below). |
| `thumb_path` | text | 400px thumbnail path in `trip-media`. |
| `original_path` | text, nullable | Set only when the uploader opted in to keep the untouched original (private, uploader-only). |
| `width` / `height` | int | Post-compression dimensions — drive masonry aspect ratio before the thumb loads. |
| `mime_original` | text | `image/jpeg` / `image/png` / `image/webp` / `image/heic` as picked. |
| `mime_stored` | text | `image/webp` for the shared derivative (always). |
| `bytes_original` | bigint | Pre-compression size. |
| `bytes_stored` | int | Compressed size. |
| `sha256` | text | Of compressed bytes; duplicate-detection key. |
| `caption` | text | ≤ 200 chars, optional. |
| `title` | text | Human-editable name, ≤ 120 chars. |
| `original_filename` | text | Sanitized base filename for search; never a device path. |
| `album_id` | uuid FK → media_albums, nullable | Virtual folder; changing it does not move objects. |
| `tags` | text[] | Up to 20 normalized manual tags. |
| `tagged_member_ids` | uuid[] | People tags. |
| `place_id` | uuid FK → places, nullable | Optional place link. |
| `captured_at` | timestamptz, nullable | EXIF time if available, else upload time. |
| `captured_tz` | text | Normally `Europe/Budapest` during the trip. |
| `trip_day` | int (1–5) | Derived from `captured_at` local day; manual override allowed. |
| `visibility` | enum `members` / `private` | `private` = uploader-only, RLS-enforced. |
| `status` | enum `pending` / `needs_conversion` / `ready` / `failed` / `deleted` | Soft-delete = `deleted`. |
| `is_moment_of_day` | bool | Max one per `trip_day` (partial unique index). |
| `created_at` / `updated_at` | timestamptz | |

### `media_reactions`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `media_item_id` | uuid FK → media_items | Cascade on item delete. |
| `member_id` | uuid FK → members | |
| `type` | enum `like` / `comment` | |
| `comment_text` | text, nullable | Required when `type=comment`, ≤ 280 chars. |
| `created_at` | timestamptz | |

Constraint: one `like` per (member, item) — unique partial index; comments are unlimited.

### Queries

| Query | Notes |
|---|---|
| Paged grid | `media_items` where trip + status=`ready` + visibility allowed, order `captured_at desc`, keyset pagination 30/page (TanStack `useInfiniteQuery`). |
| Batch signing | Collect returned `thumb_path`s → `storage.createSignedUrls(paths, 3600)` in **one batch call** per page. |
| Signed-URL cache | In-memory map `path → {url, expires_at}`; re-sign when remaining TTL < 5 min; **never persist signed URLs to IndexedDB or logs**. |
| Reactions | `media_reactions` by `media_item_id`; Realtime keeps counters + comments live. |
| Moment of day | `media_items` where `is_moment_of_day = true` grouped by `trip_day`. |

## Upload pipeline (client)

```text
pick (multi-select) → per file:
  1. decode (ImageBitmap; HEIC decodes natively only on Safari — see edge cases)
  2. compress: canvas → WebP, long edge ≤ 2048px, quality ≈ 0.8
  3. thumbnail: WebP, 400px long edge, quality ≈ 0.7
  4. sha256(compressed bytes)
  5. metadata: EXIF/GPS STRIPPED by default (canvas re-encode drops it).
     Opt-in "keep original" → untouched original uploaded as an extra
     PRIVATE object (original_path, uploader-only); the shared derivative
     is always stripped.
  6. INSERT media_items (client uuid, status=pending)
     → upload derivative + thumbnail → status=ready
```

- Input cap: reject files > **15 MB** pre-compression with a clear message. Input MIME: JPEG/PNG/WebP/HEIC. Stored derivative: always WebP.
- **Server validates real content (magic bytes), never the file extension.**
- Per-file progress via `XMLHttpRequest.upload.onprogress` (fetch has no upload progress).
- Uploads continue in the background while the user navigates the app; leaving the app entirely may suspend JS — the service-worker background-sync retry picks the outbox back up (see `docs/07-pwa-and-offline.md`).

## Storage & security

Buckets: `trip-media` (derivatives + thumbnails + optional private originals). **Private bucket. No public buckets anywhere.** Documents go to the separate private `trip-documents` bucket (owned by the medical/documents feature).

### Path scheme

```text
trips/{tripId}/media/{userId}/{uuid}.webp
trips/{tripId}/thumbnails/{userId}/{uuid}.webp
trips/{tripId}/documents/{userId}/{uuid}.pdf   ← other feature; shown for completeness
```

### Signed URL flow

1. Client lists metadata rows only (no storage access).
2. Batch-sign the needed paths (`createSignedUrls`, **TTL 1h**).
3. Cache URLs in memory with expiry; re-sign at < 5 min remaining.
4. Signed URLs are never logged, never cached to disk.

### RLS summary (full policies: `docs/03-data-model-and-rls.md`)

| Object | Policy |
|---|---|
| `storage.objects` on `trip-media` — INSERT + SELECT | Trip members only. **SELECT is required for the upload flow itself to succeed** — do not "harden" it away. |
| `storage.objects` — DELETE | Uploader or trip admin only. |
| `media_items` SELECT | `visibility='members'` → all trip members; `visibility='private'` → uploader only. |
| `media_reactions` | Trip members; reactions on private items visible to the uploader only. |

### MIME & metadata

- Server-side MIME validation on real bytes; only `image/jpeg`, `image/png`, `image/webp`, `image/heic` accepted as input; stored derivative is always WebP.
- EXIF (including GPS) stripped by default on everything shared; the opt-in kept original is private to the uploader.

### Storage budget (Supabase free tier: 1 GB)

| Assumption | Value |
|---|---|
| Avg compressed photo (2048px WebP q≈0.8) | 200–300 KB |
| Avg thumbnail (400px WebP) | ~15–25 KB |
| Per item (photo + thumb) @ 300 KB | ~320 KB → ≈ 3,200 items in 1 GB |
| Per item @ 200 KB | ~220 KB → ≈ 4,700 items |

Planning assumption: **~5,000 compressed photos fit** if the real-world average lands at ≈ 200 KB/photo. This is an assumption, not a guarantee — it must be checked against actual usage.

- [ ] Verify actual storage usage in the Supabase dashboard after Day 1 and again at trip end; set an internal alert threshold (~80%).
- [ ] Set a per-user soft cap on stored bytes (placeholder: 250 MB/user) — group decision before the trip.
- [ ] Decide retention with the group: originals/derivatives "permanently deleted X days after trip" (proposal: 30 days) — drives the purge job below.

### Videos: excluded from MVP

**Decision: photos only.** Rationale: the 1 GB free tier is the binding constraint — an order-of-magnitude estimate for phone 1080p video is ~100–200 MB per minute, i.e. one clip can consume 10–20% of the entire budget, and mobile upload bandwidth on the trip is scarcer still. Revisit post-trip if the group wants clips (requires a paid tier or hard limits like ≤ 30 s / 720p).

## Logic / rules

### Moment of the day ("רגע היום")

| Rule | Spec |
|---|---|
| Default pick | Auto: photo with the **most likes** on that `trip_day` as of **23:00 `Europe/Budapest`**. |
| Owner override | Yakir can pin any photo of that day instead (overrides the auto pick). |
| Tie / zero likes | Owner picks; if nobody picks by 23:59 local, no moment that day — never invent one. |
| Enforcement | Partial unique index: at most one `is_moment_of_day` per `trip_day`. |
| Excluded | `private` items and `status ≠ ready` items are never candidates. |

### Visibility & download permissions

| Action | Uploader | Trip owner (Yakir) | Other members |
|---|---|---|---|
| View / like / comment | ✓ | ✓ (`members` items) | ✓ (`members` items) |
| View own `private` item | ✓ | ✗ | ✗ |
| Delete | ✓ (own) | ✓ (any) | ✗ |
| Download best copy | ✓ | ✓ | Compressed 2048px copy only |
| Download kept original (if exists) | ✓ (own) | ✓ | ✗ |

People tags are **manual only** — no face recognition or auto-tagging.

## Offline & realtime

- Every upload enters the **IndexedDB outbox first** (derivative bytes + thumbnail + row payload, client-generated uuid). The grid shows local pending items inline with a "ממתין להעלאה" badge and progress ring.
- On reconnect, background sync replays the outbox in order; per-item retry; replays are idempotent (client uuid), so no duplicates.
- Browsing offline renders from the IndexedDB metadata cache + already-cached thumbnails; already-viewed photos open in the viewer. Minting new signed URLs needs network — brand-new thumbs do not appear offline.
- Realtime: `media_items` (status → ready) and `media_reactions` stream to all members via Supabase Realtime — the wall fills live during the trip.

## Edge cases

| Case | Behavior |
|---|---|
| Duplicate upload | Same `sha256` already `ready` → offer "כבר נמצא בקיר" deep link to the existing item instead of storing a second copy. |
| Compression fails (decode error / corrupt file) | Reject with a visible privacy-safe error. The untouched original is never uploaded because it may retain EXIF/GPS and consume excess storage. |
| HEIC on desktop browser | If the browser cannot decode HEIC, reject it with guidance to export JPEG/WebP or upload from Safari. A future private server conversion path may be added after explicit threat/cost review. |
| Deletion | Soft-delete (`status='deleted'`) → hidden everywhere immediately; scheduled purge job removes objects + thumbnails after a 7-day grace (undo window), then the row per retention policy. |
| Storage quota hit (1 GB) | Uploads rejected with a clear group-facing message + link to a "largest items" cleanup view. Never fail silently. |
| Upload interrupted mid-file | Outbox retries the whole object on reconnect — derivatives are ≤ ~300 KB, so full resend beats resumable-upload complexity. |
| Member removed from trip | RLS cuts SELECT/INSERT immediately; their previously shared items remain (they keep ownership). |
| Device clock skew | `captured_at` trusts device/EXIF time with timezone; a wrong clock misplaces a photo in the day filter but never blocks it. |

## Tasks

- [ ] Create private bucket `trip-media` + `storage.objects` RLS policies (INSERT+SELECT members, DELETE uploader/admin) mirroring `docs/03`.
- [ ] Implement client compression (canvas → WebP 2048px q≈0.8) + 400px thumbnail; unit-test output dimensions and sizes.
- [ ] Implement server-side MIME validation (magic bytes) + 15 MB reject.
- [ ] Implement sha256 duplicate detection + "already on the wall" flow.
- [ ] Build the IndexedDB outbox upload queue: per-file progress (XHR), background-sync retry, pending badge, client-uuid idempotency.
- [ ] Build `MediaGrid` masonry + keyset-paginated infinite scroll.
- [ ] Implement batch signed-URL flow + in-memory TTL cache (1h, re-sign < 5 min).
- [ ] Build `MediaViewer` (swipe pager, pinch zoom, info panel, like, comments, download, ⋯ menu) + `CommentsSheet`.
- [ ] Build `FilterChips` (day/uploader/place/tag) + `TagEditor`.
- [ ] EXIF strip default + opt-in keep-original-private path (`original_path`).
- [ ] `MomentBanner` + auto-pick job (23:00 `Europe/Budapest`) + owner override.
- [ ] Supabase Realtime subscriptions for items + reactions.
- [ ] Soft-delete + scheduled storage purge job (7-day grace) per retention decision.
- [ ] Storage usage monitor + quota-exceeded cleanup UX.
- [ ] Edge Function: HEIC → WebP server-side conversion fallback (`needs_conversion`).
- [ ] Run group poll: per-user byte soft cap + retention X days — before the trip.

## Acceptance criteria

- [ ] Uploading 10 photos takes ≤ 3 taps and survives a WiFi drop mid-batch — outbox resumes, zero duplicates.
- [ ] Each in-flight file shows its own progress; completed items appear on other members' devices via realtime within ~5 s.
- [ ] A file renamed `photo.jpg` but containing non-image bytes is rejected server-side (magic-byte check).
- [ ] A stored derivative contains no EXIF/GPS (verified with `exiftool` on a GPS-tagged test photo).
- [ ] A `private` photo returns empty/403 for another member on both the REST query and the storage object (RLS-verified).
- [ ] Signed URLs expire after 1 h and are never written to IndexedDB, logs, or analytics.
- [ ] The grid stays smooth with ≥ 500 cached items (thumbnails only, never full images).
- [ ] Moment of the day auto-picks the most-liked photo at 23:00 local and the owner override works; max one per day.
- [ ] Original download respects the permission table above; other members get the compressed copy.
- [ ] A soft-deleted item vanishes for all members instantly; objects purge after the grace period.
- [ ] Storage budget assumption re-verified against dashboard usage after Day 1.

## Out of scope

- Video uploads (MVP = photos only — decision above).
- Photo editing, filters, collages, 24h stories/auto-expiry.
- Public share links or export to social networks (privacy by default).
- Face recognition / automatic tagging (tags are manual).
- AI/natural-language search over photos.
- Albums beyond the day/uploader/place/tag filters.
