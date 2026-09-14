# Premium Shell Rebuild — Decision Log and Phase 1

Status: approved and implemented locally on 2026-09-13. Owner: Yakir.

## Understanding summary

- The previous redesign is considered functionally and visually broken; this is a rebuild, not a polish pass.
- The target is a premium, clean, modern Hebrew RTL experience for a small private travel group.
- The four-tab information architecture remains, while the shell and each product area are rebuilt and verified in stages.
- The first phase is the global shell: live header, bottom navigation, travel hub, profile/emergency access, and chat/search drawer.
- Existing trip data, deep links, offline snapshots, Supabase Auth, and RLS remain authoritative.
- Sensitive profile, medical, booking, and address data must never be sent to the research assistant.
- Every stage must pass type, lint, unit, build, mobile RTL, dark-theme, and interaction checks before release.

## Assumptions

- The PWA targets Safari on iOS and Chromium browsers on Android; phone portrait is primary and larger widths remain supported.
- All gesture interactions have visible click/button alternatives and minimum 48px hit targets.
- The travel bubble may be moved freely, is clamped away from system/browser edges, and persists only on the device.
- Group chat is private to trip members. Attachments use a private bucket and short-lived signed URLs.
- AI search is optional at runtime and fails explicitly when its server-only credential is absent.

## Approaches considered

1. Patch the existing screens. Rejected because the reported problems are systemic and the current shell is already overloaded.
2. Replace the entire application in one release. Rejected because it creates a large regression surface across auth, offline data, finance, and private media.
3. Rebuild by stable product slices. Selected: shell first, then Our Day, Lists, Money, and Memory Wall, each behind its own verification gate.

## Design direction

“Budapest Night Concierge”: warm urban minimalism, a deep Danube-green anchor, paprika action accent, restrained translucent surfaces, and dense but legible live information. The memorable element is the combination of the three-part live console and the movable dual travel bubble. DFII: 13/15.

## Decision log

| Decision | Alternatives | Rationale |
|---|---|---|
| Stable-slice rebuild | patching; big-bang rewrite | Limits regressions while permitting structural replacement. |
| Dedicated `/travel` hub | modal with duplicated content; old separate links | Reuses authoritative flight/stay views, stays deep-linkable, and supports offline navigation. |
| Draggable travel shortcut with click fallback | fixed FAB; gesture-only orb | Meets the requested interaction without excluding keyboard or motor-impaired users. |
| Left-side chat/search drawer | separate page; bottom sheet | Keeps conversation available across all four work areas without competing with bottom navigation. |
| Separate group and AI modes | mixed conversation stream | Makes data ownership, reliability, and provenance unambiguous. |
| OpenAI Responses API web search with `store:false` | client API key; unsourced model response | Keeps credentials server-side and returns source annotations and verification time. |
| New `trip_messages` table + private `chat-media` bucket | repurpose day notes; public storage | Preserves message semantics and applies trip-member RLS to text and files. |

Deployment coordination note: migration `0025` defines the narrow shared
profile grants, while `0026` temporarily restores the legacy table-level read
required by the currently deployed ProfileMenu. Once this code version (which
reads `v_profile_private`) is deployed, a follow-up migration must remove the
compatibility grant in the same release window.

## Phase 1 acceptance

- Header shows the full Budapest date, both second-resolution clocks, weather state, theme, emergency, and profile access without horizontal overflow at 360px.
- Four-tab navigation remains reachable above safe areas and identifies `/travel` as part of Our Day.
- Travel bubble supports tap, keyboard, drag, bounds clamping, resize clamping, and persisted position.
- `/travel` switches between complete flight and stay views without duplicating business logic.
- Group chat supports realtime text and private image/video/PDF attachments after migration `0024` is applied.
- AI search authenticates the caller, rate-limits requests, uses live web search, returns source links and verification time, and can save a source to Places.
- Drawer traps focus, closes with Escape/backdrop, respects reduced motion, and never exposes server secrets.

## Next slices

1. **Implemented locally:** Our Day uses instant client pane switching, Next
   navigation between days, deferred pane data, optimistic schedule ordering,
   parallel persistence, and an accessible drag handle.
2. **Implemented locally:** Lists switches life phases and sub-filters without
   an RSC round-trip, removes a duplicate item-id query, and retains deep links.
3. **Implemented locally:** Money uses explicit payer/debtor language and
   incremental rendering for the long ledger. Full split-path device UAT remains.
4. **Implemented locally:** Memory Wall moves upload metadata into a bottom
   drawer, fixes the sticky view switcher offset, and progressively renders the
   masonry grid. Video transcoding remains a separate server-pipeline task.
5. **Implemented and migrated:** Places now persists full address and phone,
   preserves image/opening-hours/source/verification data across edit sessions,
   and renders extracted imagery and contact details in the library. The link
   parser supports nested JSON-LD graphs and maps explicit schema.org types to
   the existing `place_type` enum. Scraped price ranges remain labeled hints;
   they are never silently converted into an amount.

## 2026-09-13 desktop interaction follow-up

The shell now uses two profile presentations: an anchored popover with its own
scroll region at desktop widths, and the existing modal bottom sheet on mobile.
Global smooth scrolling was removed because it delayed routine route and anchor
movement. Overlay scroll locking is reference-counted, which prevents a closing
sheet from leaving the page locked when overlays overlap. The travel shortcut
uses a deliberate drag threshold and a native click activation path. Its stored
position key was versioned so existing desktop users receive the corrected
default placement. Primary navigation is prefetched shortly after hydration and
the heavy chat/search implementation is delivered as a separate client chunk.

## 2026-09-13 places persistence repair

Migration `20260913090000_places_contact_details.sql` adds nullable,
length-constrained `address_text` and `phone` columns to `places`. It was applied
to the linked project after a successful dry run. Add/edit no longer writes a
nonexistent column, an edit retains the place pipeline status and original
suggester, and the form resets between records instead of leaking stale values.
The exact `fetchedAt` timestamp returned by `/api/scrape` is stored as
`last_verified_at`; manual entries remain unverified.

An authenticated Chromium audit created a place through the actual form,
verified address/phone persistence in Postgres, reopened the detail and edit
drawers, checked for console errors, and removed the exact test row afterward.

Supabase Advisors subsequently identified the self-only profile view as a
security-definer view. Migration
`20260914104229_fix_profile_view_security_invoker.sql` switches it to
`security_invoker` while retaining `security_barrier`; the linked-project
security advisor now reports no error-level findings. The profile editor now
uses the explicit, argument-free `get_my_private_profile()` RPC introduced by
`20260914105540_profile_private_rpc.sql`. It always filters by `auth.uid()` and
allows the temporary broad table grant to be removed immediately after the new
frontend is live.

Video upload is intentionally not represented as "complete" yet. The requested
compression needs a bounded server-side transcoding pipeline (format allowlist,
duration/file caps, private source and derivative paths, and failed-job cleanup).
Shipping unrestricted original-video uploads would conflict with the storage,
privacy, and performance requirements.
