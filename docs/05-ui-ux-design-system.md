---
id: design-system
title: UI/UX Design System
status: draft
depends_on: [requirements-constraints]
last_updated: 2026-09-11
---

# UI/UX Design System

Design language for the Budapest Boys Trip Companion PWA (2026-10-04 → 2026-10-08).
Users: 4–6 Israeli male med students, 23–27, on phones in the street, metro, restaurants, and bars.
Stack: Next.js 15 App Router + Tailwind CSS v4 (CSS-first `@theme` config). App UI: Hebrew, full RTL.

## 1. Design principles

1. **Zero ambiguity** — every scheduled item shows time + timezone, address, owner, cost, status, and a navigation link; never make the user guess.
2. **Glanceable in sunlight** — high-contrast text pairs, bold numerals, no low-contrast gray-on-gray for critical data.
3. **One-hand, one-thumb use** — primary actions in the bottom half of the screen; touch targets ≥ 48px.
4. **Offline is a first-class state** — stale data, pending sync, and offline mode are always visible, never silent.
5. **Money without math** — amounts render in the right currency, correctly formatted, with source + verification time for estimates.
6. **Hebrew-first, numbers LTR** — the layout is RTL; times, phone numbers, and amounts are always isolated LTR runs.

## 2. RTL architecture

- Set `<html dir="rtl" lang="he">` at the root layout. Never flip direction per page.
- Use CSS logical properties ONLY: `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`, `start-*`/`end-*` positioning. Never use `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*` in components.
- Icon mirroring rules:
  - **Mirror in RTL**: arrows, chevrons, back/forward navigation, send, "open in" directional icons.
  - **Never mirror**: clock/time icons, logos, media controls (play/pause/skip), phone handset icon, checkmarks.
  - Implement mirrored icons via a single `<DirectionalIcon>` wrapper that applies `scale-x-[-1]` under `dir="rtl"`.
- Bidi isolation: mixed Hebrew + numbers/latin must be wrapped in spans with `unicode-bidi: isolate` (Tailwind `[unicode-bidi:isolate]`) to prevent punctuation jumping.
- Always render these as isolated LTR spans: phone numbers (`+36-1-...`), times (`16:35`), currency amounts (`₪1,250.00`, `45,000 Ft`).
- Format dates with `Intl.DateTimeFormat('he-IL', …)`; show weekday names in Hebrew (`יום ראשון`).
- Keep airport codes, flight numbers, and reservation codes (e.g., `IZ291`, `13859993`) in LTR isolated spans.

## 3. Theme system

- Tokens are defined CSS-first via Tailwind v4 `@theme` in `globals.css`; components consume semantic tokens (`bg-surface`, `text-primary`), never raw palette names.
- Dark mode uses the **class strategy**: a `.dark` class on `<html>` toggles dark tokens via `@custom-variant dark (&:where(.dark, .dark *))`.
- Default theme: **light**. Auto-dark algorithm:
  1. Read Budapest local sunset from the weather integration (early October ≈ 18:05 Europe/Budapest).
  2. If `now_budapest >= sunset` OR `now_budapest < 06:30` → apply `.dark`.
  3. `prefers-color-scheme: dark` is used only as the **initial hint** before the first auto calculation.
  4. A manual override (light/dark toggle in Settings) is stored in `localStorage` (`theme-override`) and **wins until the next sunrise**, then auto resumes.
- Theme transitions (background, text, border colors) must complete in ≤ 200ms; animate only `color`, `background-color`, `border-color`.

```css
/* globals.css — Tailwind v4 CSS-first config (excerpt) */
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* Brand — confident teal-blue */
  --color-brand: #0e7490;
  --color-brand-strong: #155e75;
  --color-brand-soft: #cffafe;
  --color-brand-contrast: #ffffff;

  /* Light surfaces & text */
  --color-background: #f8fafc;
  --color-surface: #ffffff;
  --color-surface-raised: #ffffff;
  --color-border: #e2e8f0;
  --color-text-primary: #0f172a;
  --color-text-secondary: #334155;
  --color-text-muted: #64748b;

  /* Feedback (light) */
  --color-success: #15803d;
  --color-warning: #b45309;
  --color-danger: #b91c1c;
  --color-info: #1d4ed8;

  /* Categories (light) */
  --color-cat-food: #ea580c;
  --color-cat-attraction: #7c3aed;
  --color-cat-walk: #16a34a;
  --color-cat-transit: #2563eb;
  --color-cat-rest: #0d9488;
  --color-cat-nightlife: #db2777;
  --color-cat-flight: #0284c7;
  --color-cat-accommodation: #65a30d;
  --color-cat-other: #64748b;

  /* Itinerary statuses (light) */
  --color-st-planned: #64748b;
  --color-st-confirmed: #15803d;
  --color-st-in-progress: #b45309;
  --color-st-completed: #0e7490;
  --color-st-skipped: #94a3b8;
  --color-st-cancelled: #b91c1c;

  /* Expense statuses (light) */
  --color-exp-pending: #b45309;
  --color-exp-settled: #15803d;
  --color-exp-disputed: #b91c1c;
}

@theme inline {
  /* Dark overrides, activated by .dark on <html> */
  .dark {
    --color-background: #0b1220;
    --color-surface: #111c2e;
    --color-surface-raised: #1a2740;
    --color-border: #2a3a55;
    --color-text-primary: #f1f5f9;
    --color-text-secondary: #cbd5e1;
    --color-text-muted: #94a3b8;

    --color-brand: #22d3ee;
    --color-brand-strong: #67e8f9;
    --color-brand-soft: #164e63;
    --color-brand-contrast: #082f3f;

    --color-success: #4ade80;
    --color-warning: #fbbf24;
    --color-danger: #f87171;
    --color-info: #60a5fa;

    --color-cat-food: #fb923c;
    --color-cat-attraction: #a78bfa;
    --color-cat-walk: #4ade80;
    --color-cat-transit: #60a5fa;
    --color-cat-rest: #2dd4bf;
    --color-cat-nightlife: #f472b6;
    --color-cat-flight: #38bdf8;
    --color-cat-accommodation: #a3e635;
    --color-cat-other: #94a3b8;

    --color-st-planned: #94a3b8;
    --color-st-confirmed: #4ade80;
    --color-st-in-progress: #fbbf24;
    --color-st-completed: #22d3ee;
    --color-st-skipped: #64748b;
    --color-st-cancelled: #f87171;

    --color-exp-pending: #fbbf24;
    --color-exp-settled: #4ade80;
    --color-exp-disputed: #f87171;
  }
}
```

## 4. Color tokens

Brand family: **cyan/teal (Tailwind cyan-700 `#0e7490` light / cyan-400 `#22d3ee` dark)** — confident, masculine, readable in sunlight, and distinct from every category color.

| Token | Light | Dark |
|---|---|---|
| background | `#f8fafc` | `#0b1220` |
| surface | `#ffffff` | `#111c2e` |
| surface-raised | `#ffffff` | `#1a2740` |
| border | `#e2e8f0` | `#2a3a55` |
| text-primary | `#0f172a` | `#f1f5f9` |
| text-secondary | `#334155` | `#cbd5e1` |
| text-muted | `#64748b` | `#94a3b8` |
| brand | `#0e7490` | `#22d3ee` |
| success | `#15803d` | `#4ade80` |
| warning | `#b45309` | `#fbbf24` |
| danger | `#b91c1c` | `#f87171` |
| info | `#1d4ed8` | `#60a5fa` |

Category colors (light / dark):

| Category | Hebrew label | Light | Dark |
|---|---|---|---|
| food | אוכל | `#ea580c` | `#fb923c` |
| attraction | אטרקציה | `#7c3aed` | `#a78bfa` |
| walk | הליכה | `#16a34a` | `#4ade80` |
| transit | תחבורה | `#2563eb` | `#60a5fa` |
| rest | מנוחה | `#0d9488` | `#2dd4bf` |
| nightlife | חיי לילה | `#db2777` | `#f472b6` |
| flight | טיסה | `#0284c7` | `#38bdf8` |
| accommodation | לינה | `#65a30d` | `#a3e635` |
| other | אחר | `#64748b` | `#94a3b8` |

Status colors (light / dark):

| Itinerary status | Hebrew | Light | Dark |
|---|---|---|---|
| planned | מתוכנן | `#64748b` | `#94a3b8` |
| confirmed | מאושר | `#15803d` | `#4ade80` |
| in_progress | מתבצע | `#b45309` | `#fbbf24` |
| completed | הושלם | `#0e7490` | `#22d3ee` |
| skipped | דולג | `#94a3b8` | `#64748b` |
| cancelled | בוטל | `#b91c1c` | `#f87171` |

| Expense status | Hebrew | Light | Dark |
|---|---|---|---|
| pending | ממתין | `#b45309` | `#fbbf24` |
| settled | סולק | `#15803d` | `#4ade80` |
| disputed | במחלוקת | `#b91c1c` | `#f87171` |

Verified contrast pairs (≥ 4.5:1, WCAG AA normal text):
`text-primary #0f172a` on `surface #ffffff` (16.1:1); `text-secondary #334155` on `surface` (10.3:1); `text-muted #64748b` on `surface` (5.0:1); `text-primary #f1f5f9` on `surface #111c2e` (14.6:1); `brand #0e7490` on `surface` (5.3:1); white `#ffffff` on `brand #0e7490` (5.3:1); dark `text-primary #f1f5f9` on `background #0b1220` (16.8:1). Category/status hues are used for icons, chips, and borders — when used as text, pair with `surface` only at the listed values or darker.

## 5. Typography

- Font: **Heebo** via `next/font/google`. Chosen over Rubik for its slightly warmer humanist forms and complete Hebrew + Latin glyph coverage at all weights (300–800) in a single family.
- Load subsets `hebrew` and `latin`; set as `--font-sans` in `@theme`.

| Style | Size / line-height | Weight | Usage |
|---|---|---|---|
| display | 32/40px | 700 | Countdown hero, trip title |
| h1 | 24/32px | 700 | Page titles |
| h2 | 18/26px | 600 | Section headers, card titles |
| body | 16/24px | 400 | Default text |
| small | 14/20px | 400 | Secondary info, addresses |
| caption | 12/16px | 500 | Badges, nav labels, timestamps |

- Apply `tabular-nums` (`font-feature-settings: "tnum"`) to all money amounts, times, countdowns, and coordinates.
- Never justify Hebrew text — always `text-align: start`. Avoid letter-spacing on Hebrew.
- Keep numerals LTR inside Hebrew sentences via isolation (see §2).

## 6. Spacing & layout

- 4px spacing grid (`p-1` = 4px …). Page padding: **16px** horizontal (`px-4`).
- Card radius: 12px default, 16px for hero/sheet containers. Chip radius: full.
- Bottom nav (mobile, fixed):
  - Height **64px + `env(safe-area-inset-bottom)`** padding; reserve the same as page bottom padding.
  - 5 items: **היום · מסלול · מפה · כספים · עוד**, each icon 24px + label 11px (caption).
  - Active state: brand-colored icon + label, 12px top indicator bar or pill background; inactive: `text-muted`.
- Header pattern: page title (h1, `text-start`) + one context action at the `end` edge (icon button, 48px target). No multi-action headers on mobile.
- Lists use full-bleed dividers (`border-b border-border`), not nested cards inside cards.

## 7. Component specs

- **StatusChip** — props: `status` (itinerary or expense), `size: sm|md`. Pill, 11–12px bold label, colored dot + tinted background at 12% opacity of the status color. States: default, pressed (opacity 80%). Hebrew labels per §4 tables.
- **CategoryIcon** — props: `category`, `size` (default 24px). Category color icon inside a 12%-tint rounded-square (8px radius). States: default, selected (solid color, white icon).
- **TimeBlock** — props: `dateTime`, `timeZone`, `showTzBadge`. Renders `16:35` (tabular-nums, LTR-isolated) + tz badge (`שעון הונגריה` / `שעון ישראל`) as caption chip. States: future, now (brand border pulse), past (muted).
- **MoneyAmount** — props: `amount`, `currency` (HUF|ILS|EUR|USD), `convertedTo?`. Format via `Intl.NumberFormat('he-IL', { style: 'currency', currency })`: HUF 0 decimals; ILS/EUR/USD 2 decimals. Optional secondary converted amount in caption. Always LTR-isolated.
- **CountdownCard** — props: `targetDateTime`, `title`, `subtitle`. Hero card on היום: days/hours/minutes in display type, tabular-nums. States: pre-trip countdown, live ("הטיול התחיל!"), done (collapsed). Live region `aria-live="polite"` updating at most once per minute.
- **TimelineItem** — props: `time`, `title`, `address`, `category`, `status`, `owner`, `navUrl`. Vertical rail with category-colored node. States: planned, confirmed, in_progress (elevated + brand ring), completed (muted, strikethrough title), skipped/cancelled (dimmed 50%).
- **MemberAvatar** — props: `name`, `imageUrl?`, `size` (32/40px). Fallback: initials (first letters of first+last name, LTR-isolated if Latin). States: default, online dot (success color).
- **EstimateBadge** — props: `source`, `lastVerifiedAt`. Small warning-tinted chip "הערכה" with tooltip/bottom-sheet showing source name + `last_verified_at` formatted he-IL. Mandatory on any non-verified price/schedule.
- **OfflineBanner** — full-width banner below header when `navigator.onLine === false` or Supabase unreachable: `offline` icon + "אין חיבור — מוצג נתון שמור". Warning tint; not dismissible while offline.
- **PendingSyncBadge** — props: `count`. Small info-tinted chip "N שינויים ממתינים לסנכרון"; appears on the More tab icon and in settings; clears on successful background sync.
- **QuickActionBar** — props: `itemId`, `actions`. Horizontal 48px button row on itinerary detail: **נווט** (nav deep link), **כרטיס** (ticket/doc), **יצאנו** ("we left"), **איחור ב-X** (late-by-X minutes, posts to group). States: default, loading spinner per button, sent (success flash).
- **FAB** — single primary action per screen max (e.g., "הוסף הוצאה" on כספים). 56px circle, brand, positioned 16px above the bottom nav at the `end` edge (visual left under RTL). States: default, pressed (scale 0.96), hidden on scroll-down (reappear on scroll-up).
- **BottomSheet** — props: `open`, `onClose`, `title`. Slides up, 16px top radius, drag handle, max height 85dvh, backdrop 40% black. Used for confirms, filters, estimate details. Swipe-down to dismiss; destructive confirms require explicit button press, not swipe.
- **VoteBar** — props: `options`, `anonymousUntilClose`, `closesAt`. Horizontal stacked bar with per-option counts; when `anonymousUntilClose` is true, show only "N הצביעו" until close, then reveal names. States: open, closed (winner highlighted success).
- **EmptyState** — props: `illustration`, `title`, `ctaLabel`, `onCta`. Centered: simple line illustration (120px), h2 title, body hint, brand CTA button (48px). Every list screen must define one.
- **Skeleton** — shimmer blocks matching final layout (TimelineItem: time column + 2 text lines + chip; MoneyAmount: 64px bar). Duration 1.2s ease-in-out; disabled under `prefers-reduced-motion` (static gray instead).
- **Toast** — bottom-anchored above bottom nav, auto-dismiss 3s, types: success / info / danger. Max 1 visible; queue the rest. Include undo action slot for destructive ops.

## 8. Interaction

- Gestures: **swipe-to-complete** on checklist items (swipe toward `start` reveals success action; ≥ 64px travel commits), **pull-to-refresh** on Today/Route/Money lists with spinner + last-updated caption.
- Haptics: `navigator.vibrate(10)` on swipe-complete and poll vote, where supported; never on errors (use 30ms double-pulse only for destructive confirm).
- All interactive targets ≥ 48×48px, including icon buttons and chip taps.
- Every destructive action (delete expense, remove member, cancel item) opens a **confirm BottomSheet** with danger button — no instant deletes, no browser `confirm()`.

## 9. Motion

- Durations 150–250ms, `ease-out` for entrances, `ease-in` for exits. Sheet/modal 250ms; chip/badge 150ms.
- Respect `prefers-reduced-motion`: replace slide/fade with instant state change; disable shimmer and countdown pulse.
- No parallax, no scroll-jacking, no autoplaying decorative animation.

## 10. Accessibility

- All text/background pairs meet ≥ 4.5:1 (verified pairs in §4); large display text ≥ 3:1.
- `:focus-visible` ring: 2px brand + 2px offset, visible on all interactive elements.
- All icon-only buttons carry Hebrew `aria-label` (e.g., `aria-label="נווט לכתובת"`, `aria-label="הוסף הוצאה"`).
- Live regions: countdown and sync status use `aria-live="polite"`; toasts use `role="status"`.
- Screen-reader order must match visual RTL order — do not reorder with CSS `order`/`float` in ways that break DOM reading sequence.
- Touch targets ≥ 48px (§8); error messages in Hebrew, adjacent to the field, `aria-describedby`.

## 11. States pattern

Every screen must implement all four variants:

| State | Visual rule |
|---|---|
| loading | Skeleton matching final layout (§7); no spinners alone for > 300ms |
| empty | EmptyState with illustration + CTA; never a blank list |
| error | Inline card: danger icon, Hebrew message, "נסה שוב" retry button |
| offline | OfflineBanner + last cached data rendered normally with `עודכן לאחרונה` caption |

## 12. Build tasks checklist

- [ ] Load Heebo (hebrew + latin subsets) via `next/font` in root layout; set `<html dir="rtl" lang="he">`.
- [ ] Define all tokens from §3 in `globals.css` with `@theme` + `.dark` variant; verify Tailwind v4 build picks them up.
- [ ] Implement auto-dark hook (sunset from weather API, 06:30 resume, localStorage override) with ≤ 200ms transition.
- [ ] Build bottom nav (64px + safe-area, 5 items, active state) and header pattern.
- [ ] Build 5 core components first: StatusChip, CategoryIcon, TimeBlock, MoneyAmount, TimelineItem.
- [ ] Build QuickActionBar, CountdownCard, MemberAvatar, EstimateBadge.
- [ ] Build OfflineBanner, PendingSyncBadge, Toast, BottomSheet, FAB, EmptyState, Skeleton, VoteBar.
- [ ] Add `DirectionalIcon` wrapper + audit all icons against mirror rules (§2).
- [ ] Verify contrast pairs in both themes; run RTL visual pass on Today, Route, Money screens.
- [ ] Wire loading / empty / error / offline variants on every screen.

## Acceptance criteria

- App renders fully RTL with zero physical-direction utilities (`ml/mr/pl/pr/left/right`) in component code.
- Dark mode activates automatically after Budapest sunset and respects manual override until next sunrise.
- All text pairs listed in §4 pass ≥ 4.5:1 contrast in both themes.
- All amounts format via `Intl.NumberFormat('he-IL')` with correct decimals per currency (HUF 0; ILS/EUR/USD 2).
- Every touch target ≥ 48px; every destructive action routes through a confirm BottomSheet.
- Every screen shows distinct loading / empty / error / offline states, usable offline for the daily plan.

## Out of scope

- Tablet/desktop-specific layouts (mobile-first only; desktop gets the mobile layout centered at max-width).
- LTR/English UI localization.
- Custom illustration set beyond simple EmptyState line art.
- Animated map transitions and 3D effects.
- Theming beyond light/auto-dark (no custom user themes).
