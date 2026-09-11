---
id: feature-medical-safety
title: Medical & Safety — "רפואה ובטיחות"
status: draft
depends_on: [data-model]
last_updated: 2026-09-11
---

# 08 — Medical & Safety ("רפואה ובטיחות")

The page you hope nobody opens — so it must open instantly, work in airplane mode, and never leak private data. The screen is exactly **four cards**: Emergency now · Insurance & documents · Personal medical profile (opt-in) · Group safety.

## Goal

1. In a real emergency: 112, our accommodation address, and the right phrases on screen in < 5 s — with zero network.
2. Insurance and passport data: private per member, readable only by the owner, never in any shared view.
3. Medical info: strictly opt-in, granular visibility, and every read by someone else logged.
4. Group safety rituals (solo notice, night meeting point, taxi/night rules, temporary location share) as one-tap actions.

Hard rules (see `docs/04-security-and-privacy.md`):

- Passport scans and insurance policy numbers are **private, owner-only** — never rendered in shared views, never in the media wall, never in exports.
- Every read of a member's medical profile by someone else is logged to `app_events` (who viewed + when).
- Location is **never stored in the app** — "share location" works via deep links to WhatsApp / Google / Apple only.
- The safety page must work **fully offline** (acceptance criterion: airplane mode).

## User stories

- As a member at an accident scene, I tap 112 once, copy our address for the dispatcher, and show a phrase block in English and Hungarian — no network needed.
- As a member, I keep my insurer, policy number and policy PDF on my phone — masked by default and invisible to the group.
- As a member who opts in, I store allergies / medications / ICE contact, choose exactly who can see them, and can see who viewed them and when.
- As a group, we follow the rules we set before the trip: solo notices, one fixed night meeting point, app-booked taxis, drinks never left unattended.
- As a member lost at 01:00, one button navigates me to the agreed meeting point.
- As a group member, I can share my live location for one hour through the app my friends already use — without the trip app ever storing where I am.

## Screen layout

Entry: bottom-nav **More** ("עוד") → "רפואה ובטיחות"; persistent shield shortcut on the Today page header. Four stacked cards, RTL, mobile-first, touch targets ≥ 48px.

```text
┌─────────────────────────────────┐
│ רפואה ובטיחות                   │
│ ┌─────────────────────────────┐ │
│ │ 🚨 חירום עכשיו              │ │ ← Card 1 (red accent)
│ │ [📞 התקשר 112]              │ │
│ │ כתובת: [טרם נקבעה ⚠] [העתק]│ │
│ │ [קואורדינטות] [שתף קבוצה]   │ │
│ │ [בלוק ביטויים EN/HE/HU]     │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ 🛡 ביטוח ומסמכים (פרטי לי) │ │ ← Card 2 (padlock chip)
│ │ מבטח · פוליסה ••••4821 [הצג]│ │
│ │ [📞 מוקד חירום בין״ל]       │ │
│ │ [PDF פוליסה] תוקף עד …      │ │
│ │ 🏛 שגרירות/קונסוליה [עדכן]  │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ❤ הפרופיל הרפואי שלי (רשות)│ │ ← Card 3
│ │ אלרגיות · תרופות · איש קשר  │ │
│ │ רואה: רק אני ▾  [יומן צפיות]│ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ 👥 בטיחות קבוצתית           │ │ ← Card 4
│ │ [יצאתי לבד] [איבדתי את      │ │
│ │  הקבוצה → נקודת מפגש]       │ │
│ │ כללי מונית · כללי לילה      │ │
│ │ [שתף מיקום לשעה]            │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Components

| Component | Purpose |
|---|---|
| `EmergencyNowCard` | 112 one-tap, address + copy, permission-gated GPS display, share-with-group, phrase block trigger. |
| `PhraseBlock` | Copyable EN/HE/HU emergency lines with per-line copy buttons. |
| `InsuranceCard` | Insurer, masked policy number + logged reveal, hotline call button, policy PDF via 1h signed URL, validity, verified checkbox + date. |
| `ConsularCard` | Israeli embassy/consulate fields with `last_verified` + verify task state. |
| `MedicalProfileCard` | Opt-in editor/viewer: allergies, medications, conditions, ICE contact, blood type, visibility selector. |
| `AccessLogList` | Who viewed my profile + when (from `app_events`). |
| `SoloNoticeCard` | "יצאתי לבד" composer (destination, expected return, who knows) + group status. |
| `LostButton` | "איבדתי את הקבוצה" → navigation to the night meeting point. |
| `ShareLocationSheet` | WhatsApp / Google Maps / Apple deep-link chooser — nothing stored. |
| `SafetyRulesList` | Group-agreed taxi + night rules, always rendered. |

## Card 1 — Emergency now ("חירום עכשיו")

| Element | Spec |
|---|---|
| 112 call | One-tap `tel:112`, red, always the first element. 112 = EU general emergency (police / ambulance / fire). Include hint: "עדיף טלפון עם כרטיס SIM פעיל" — behavior without SIM varies by network/country. |
| Accommodation address | Full local (HU) address + accommodation phone once booked, with **copy button**. Until booking is confirmed: show "כתובת טרם נקבעה — יעודכן לאחר ההזמנה" + task link to `docs/06-features/03-accommodation.md`. Cached offline the moment it is set. |
| GPS coordinates | Optional "הצג קואורדינטות" → one-shot geolocation **with runtime permission** → shows decimal lat,lon + accuracy radius + copy button. Display only: **never stored, never transmitted by the app**. |
| Share emergency event with group | "שתף את הקבוצה" → realtime note to all members (Today-page banner): who, time, and any text the user adds (e.g. pasted coords). Stored as an `app_events` row (`emergency_alert`) — **text only, no automatic location capture**. |
| Phrase block | Opens `PhraseBlock` (below). |

`PhraseBlock` content — per-line copy buttons, big type, works offline:

```text
EN: We need medical assistance. Our location is: [address/coords].
    There are [n] people. The person is conscious / unconscious.
HE: אנחנו זקוקים לסיוע רפואי. המיקום שלנו: [כתובת/קואורדינטות].
    יש כאן [n] אנשים. האדם בהכרה / מחוסר הכרה.
HU: Orvosi segítségre van szükségünk. A helyünk: [cím/GPS-koordináták].
    [n] személy van itt. A személy eszméleténél van / eszméletlen.
    ⚠ טיוטה — תרגום מכונה, דורש אימות
```

- [ ] Verify the Hungarian lines with a native speaker / authoritative source **before the trip**; replace the draft and set `last_verified`.

## Card 2 — Insurance & documents (per member, PRIVATE)

Renders **only the signed-in member's own data**. No other member can read any of it (RLS owner-only) — this is a hard privacy boundary, tested.

| Field | Spec |
|---|---|
| Insurer name | Free text (member fills; e.g. Harel / Phoenix / Migdal — examples only, not recommendations). |
| Policy number | Stored privately; **masked by default** — last 4 chars only (`•••• 4821`). "הצג" reveal tap → full value + writes a `policy_revealed` event. |
| International emergency hotline | Collect-call number from the insurer's card + one-tap call button. |
| Policy PDF | Private bucket `trip-documents`, path `trips/{tripId}/documents/{userId}/{uuid}.pdf`, owner-only RLS, opened via a **1h signed URL**. |
| Validity dates | `valid_from`–`valid_to`; warning chip if `valid_to` < 2026-10-08 (trip end). |
| User verified | Checkbox "בדקתי שהפוליסה תקפה לחו״ל" + `user_verified_at` date. |
| Passport scan | **HARD RULE callout:** lives in `trip-documents`, owner-only, private. Never in the media wall, never in shared views, never exported. Pair with the group rule: keep a photo copy **separate** from the physical original. |

### Israeli embassy / consular section (inside Card 2)

Fields: mission name, address, phone, consular/emergency hotline, email, opening hours — each rendered with a `last_verified` date.

- Seeded **empty** on purpose: never rely on a months-old saved record.
- [ ] Verify current Israeli embassy/consular contact details from the official MFA website ≤ 7 days before departure; fill fields + set `last_verified`.
- [ ] Each member fills their own insurance card and uploads their policy PDF before departure (seeded placeholders below).

## Card 3 — Personal medical profile (OPT-IN)

Nothing exists until the member opts in and fills it. Empty state: "הפרופיל הרפואי ריק — מילוי יכול לעזור במקרה חירום (לא חובה)". Filling it is encouraged by the group, never required, never blocks Card 1.

| Field | Spec |
|---|---|
| Allergies | List with severity enum `life_threatening` / `moderate` / `mild` + note; **life-threatening sorted first**, always on top. |
| Regular medications | Name + dose + schedule. |
| Chronic conditions | Free-text list. |
| ICE contact back home | Name + relationship + phone (IL) + one-tap call button. |
| Blood type | Optional. Disclaimer rendered under it: "אינו תחליף למסמך רפואי" — not a substitute for an official medical document. |

**Visibility selector** (whole profile, one value):

| Value | Who can read |
|---|---|
| `private` | Only me (default) |
| `members` | All trip members — visible in the group's normal member-info list |
| `emergency_only` | Hidden from normal browsing; surfaces only via the explicit "הצג פרטים רפואיים של הקבוצה" reveal on Card 1 |

**Access log:** every read by someone other than the owner is written to `app_events` (`medical_profile_viewed`: actor, timestamp, entry point). The owner sees the full log in `AccessLogList` ("מי צפה בפרופיל שלי"). `emergency_only` reveals are logged like any other read. Editing is owner-only.

## Card 4 — Group safety ("בטיחות קבוצתית")

### "יצאתי לבד" (I went solo) notice

| Field | Spec |
|---|---|
| Destination | Free text + optional `places` link. |
| Expected return | Time in `Europe/Budapest`. |
| Who knows | Member checkboxes (default: everyone). |
| Lifecycle | `active` while out → member taps "חזרתי" (or auto-`expired` at trip end). If `now > expected_return + 30 min` and still active, notified members get a "לא חזר עדיין" badge on the Today page. |

### Night meeting point + "איבדתי את הקבוצה"

- One fixed place row (type `meeting_point`) agreed by the group before the trip, shown on the card with address in large text + copy.
- [ ] Group picks the meeting point and saves it as a place **before Day 1** (proposal to vote on; not decided in this doc).
- `LostButton` → opens the platform maps app with walking directions to the point (Google Maps `dir` deep link / Apple Maps equivalent). Offline fallback: cached address + instruction line ("הצג לנהג: <address>").
- [ ] Verify the maps deep-link format opens correctly on iOS + Android.

### Taxi rules (group-agreed, rendered verbatim)

1. Book via app (Bolt preferred) — see `docs/06-features/04-transportation.md`.
2. If not app-booked: **agree the fare upfront** and check the rate before riding.
3. Splitting up? Share ride details in the group chat.

- [ ] Verify current Budapest taxi tariff info + Bolt availability before the trip; keep the rules text accurate (`last_verified`).

### Night rules (group-agreed, rendered verbatim)

1. Never leave drinks unattended.
2. Keep your phone charged; carry a power bank at night.
3. Know the accommodation address offline — it is always on Card 1.
4. Keep a passport photo copy separate from the original.

### Share location for 1 hour (deep links only)

| Channel | Behavior |
|---|---|
| WhatsApp | `wa.me/<phone>?text=<prefilled message>` opens the chat; the user attaches live location (1h option) **inside WhatsApp**. |
| Google Maps | Opens the Maps app's location-sharing screen; the user completes sharing in Google's app. |
| Apple Find My | `FindMy://` deep link (iOS) to start sharing in Apple's app. |

**Hard rule callout:** the share completes entirely in the target app — no coordinates ever pass through or persist in this app (no DB writes, no `app_events` entries with location). Prefilled text contains name + "לשעה" only.

## Data & queries

Canonical schema: `docs/03-data-model-and-rls.md`. Tables used: `emergency_profiles`, `insurance_policies`, `documents`, `app_events`. Working field lists (keep in sync with docs/03):

| Table | Fields |
|---|---|
| `emergency_profiles` | `id` PK · `member_id` (unique per trip) · `trip_id` · `allergies` jsonb `[{name, severity, note}]` · `medications` jsonb `[{name, dose, schedule}]` · `conditions` text[] · `ice_contact_name` · `ice_contact_relation` · `ice_contact_phone` · `blood_type` text nullable · `notes` · `visibility` enum(`private`/`members`/`emergency_only`) · `is_opt_in` bool · `created_at` / `updated_at` |
| `insurance_policies` | `id` PK · `member_id` · `trip_id` · `insurer_name` · `policy_number` (masked in UI) · `emergency_hotline` · `policy_document_id` FK → documents · `valid_from` / `valid_to` date · `user_verified` bool · `user_verified_at` · `notes` · timestamps |
| `documents` | `id` PK · `owner_id` · `trip_id` · bucket `trip-documents` · `storage_path` · `doc_type` enum(`passport_scan`/`insurance_policy`/`other`) · `title` · `mime` · `bytes` · `created_at` — RLS **owner-only** |
| `app_events` | `id` PK · `trip_id` · `actor_id` · `event_type` (`medical_profile_viewed` / `policy_revealed` / `emergency_alert` / `solo_notice_*` …) · `target` text · `metadata` jsonb · `created_at` — insert-only for members; owner reads events targeting their own profile |
| `safety_notices` (**proposed — confirm in docs/03**) | `id` PK · `trip_id` · `member_id` · `destination` · `expected_return` timestamptz · `notified_member_ids` uuid[] · `status` enum(`active`/`returned`/`expired`) · `created_at` / `resolved_at` |

| Query | Notes |
|---|---|
| My profile + my policies | Owner-only read; cached to IndexedDB on every fetch. |
| Visible group profiles | `visibility='members'`, or `emergency_only` only via the Card-1 reveal path (both logged). |
| My access log | `app_events` where target = my profile, order desc. |
| Active solo notices | `safety_notices` where status=`active`; Realtime for live updates. |
| Meeting point | `places` where type=`meeting_point`; cached for offline navigation. |

## Logic / rules — privacy matrix

| Data | Default | Selectable | Read logging |
|---|---|---|---|
| Medical profile | opt-in, `private` | `private` / `members` / `emergency_only` | every non-owner read |
| Insurance card | owner-only | not selectable (fixed private) | full policy-number reveals logged |
| Passport scan | owner-only | not selectable | — (storage RLS gate) |
| Emergency alerts | broadcast to members | not selectable | stored as event, text only |
| Solo notices | members chosen by author | recipient list | — |
| Location | never stored | deep links only | — |

Masking: policy numbers show last 4 only; every full reveal is logged and visible to the owner. Phones (ICE, hotline) render as tappable `tel:` links.

### Pre-seeded content (from `docs/09-import-and-seed.md`)

| Item | Value | Source / verify |
|---|---|---|
| EU emergency number | 112 | static EU standard — no verify needed |
| Arkia support | +972-3-6903712 | Arkia e-ticket res. 1385•••93, `last_verified` 2026-09-11 |
| Member phones | 4 confirmed (Yakir, Aharon, Yehonatan, Bar) + Roei pending | roster `Personal-info.xlsx`; visible to members only |
| Insurance cards | empty placeholders per member | each member fills their own |
| Embassy/consulate | empty | MFA verify task above |
| Accommodation address | TBD | until booking confirmed |

- [ ] Re-verify Arkia support number before return flight IZ292 (2026-10-08 10:25 BUD → TLV) — matters if anyone changes flights for medical reasons.

## Offline & realtime

- **All** card content is cached into IndexedDB at login/refresh: 112, accommodation address, phrase block (incl. verified Hungarian), own insurance data + document metadata, own + visible medical profiles, meeting point, safety rules, seeded numbers. The whole page renders 100% from cache.
- **Airplane mode is an acceptance criterion:** every action on this page except opening a PDF or minting a new signed URL works offline.
- Realtime: `emergency_alert` events and solo notices stream to members' Today pages when online; sent offline → queued in the outbox, delivered on reconnect with the original timestamp.
- PDFs and map routing need connectivity (signed URL / online maps) — the address + copy button remain the offline fallback.

## Edge cases

| Case | Behavior |
|---|---|
| Phone without SIM / no credit | 112 often still connects via any available network, but behavior varies — the card shows the SIM hint; alternative line: ask hotel/staff to call. Never claim guaranteed no-SIM dialing. |
| Geolocation permission denied | Coords section hides; address, phrases, call buttons all keep working. Nothing blocks. |
| Poor GPS accuracy indoors | Show the accuracy radius (± m) beside the coords; the user judges. |
| Member never filled a medical profile | Reveal shows "אין פרופיל רפואי" for them — never fabricate or infer. |
| Policy expires mid-trip | Warning chip (informational); renewal is the member's responsibility. |
| Visibility changed after others viewed | Future reads denied by RLS; past reads stay in the owner's access log (append-only events). |
| Emergency alert sent offline | Queued in outbox; delivered on reconnect with original timestamp + "נשלח באיחור" marker. |
| Solo notice overdue | "לא חזר עדיין" badge for notified members until "חזרתי" or trip end; never auto-cancels a person's notice silently. |
| Member loses their phone | Owner-only data is NOT recoverable via the group (by design) — recover from insurer/issuer directly; group-visible data remains visible to the group. Limitation documented here. |
| Trip ended | Solo notices auto-expire; medical/insurance data stays owner-only per retention policy in `docs/04-security-and-privacy.md`. |

## Tasks

- [ ] Build the four cards + components; add the shield shortcut to the Today page header.
- [ ] Wire `tel:112` and all hotline call buttons; ≥ 48px targets, red accent for emergency actions.
- [ ] Wire the accommodation address card to booking status (TBD state + task link) + copy button + offline cache.
- [ ] One-shot geolocation display (runtime permission, never persisted — code-review for zero writes).
- [ ] `PhraseBlock` EN/HE + Hungarian draft, per-line copy, verify-translation task state.
- [ ] Emergency realtime alert: `app_events` insert + Realtime broadcast + Today banner.
- [ ] Insurance card: masking + logged reveals, signed-URL PDF open (owner-only), validity + verified checkbox/date.
- [ ] Passport scan + policy PDF upload flow into `trip-documents` (owner-only RLS, private bucket).
- [ ] Consular card with `last_verified` + empty seed + MFA verify task.
- [ ] Medical profile editor + visibility selector + RLS per visibility value.
- [ ] Access logging on every non-owner read + `AccessLogList` UI.
- [ ] Solo notices (`safety_notices` — confirm table in docs/03) + overdue badge + "חזרתי" flow.
- [ ] `LostButton` navigation to meeting point + offline address fallback.
- [ ] `ShareLocationSheet` deep links (WhatsApp / Google / Apple) + verify nothing location-related is stored.
- [ ] `SafetyRulesList` final group-agreed text (run group review before the trip).
- [ ] Offline cache for the entire page + airplane-mode integration test.
- [ ] Seed: 112, Arkia support, member phones, insurance placeholders, empty consular section.

## Acceptance criteria

- [ ] Airplane mode: all four cards fully usable — 112 dials (with SIM), address copies, phrases copy, own insurance data readable, meeting point shows cached address + copy.
- [ ] 112 dialable within 2 taps; cold app open → Card 1 visible in < 5 s.
- [ ] Another member cannot read my insurance card, policy PDF, passport scan, or `private` medical profile (RLS-verified tests).
- [ ] Policy number is masked by default; every full reveal is logged and visible to me.
- [ ] Every non-owner read of a medical profile appears in the owner's access log with who + when; `emergency_only` surfaces only through the logged reveal.
- [ ] No GPS/location values are ever written to the database by this feature (integration test + code review).
- [ ] Share-location buttons open the correct app with prefilled text; nothing stored in-app.
- [ ] Embassy/consular fields render empty with `last_verified` semantics and an explicit verify task — no stale pre-filled data.
- [ ] Solo notice overdue badge shows for notified members until resolved.
- [ ] Every dynamic entry (hotlines, embassy, address, tariff rules) carries `source` + `last_verified_at`; nothing invented.

## Out of scope

- Storing or transmitting live location (deep links only — by design).
- Telemedicine booking; pharmacy lookup (use the Map page + places instead).
- Medication reminders / pill schedules.
- Apple Health / Google Fit medical-ID integration.
- SOS satellite messaging, fall detection, wearables.
- Automatic policy validation with insurers.
- Any member-tracking/monitoring feature (privacy — the group sees what members choose to share, nothing more).
