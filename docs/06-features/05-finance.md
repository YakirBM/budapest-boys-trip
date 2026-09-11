---
id: feature-finance
title: Finance — Expenses, FX & Settlement
status: draft
depends_on: [data-model]
last_updated: 2026-09-11
---

# 05 — Finance ("כסף")

Manage group money for the Budapest trip (2026-10-04 → 2026-10-08): track expenses in any of 4 currencies, convert at verifiable rates, split fairly among 4–6 members, and end the trip with a minimal-transfers settlement plan.

## Goal

Answer three questions in under 5 seconds each, online or offline:

1. How much have we spent, and against what budget?
2. Who paid, and who owes whom right now?
3. What is the cheapest (fewest transfers) way to settle at the end?

Base currency for all math: **HUF**. Display secondary values in **ILS**. Never present a rate, price or settlement figure without a `source` and `last_verified_at`.

## User stories

- As a payer, I log an expense in ≤ 15 seconds, including offline on the street.
- As a member, I see my cumulative spend and my current net balance at a glance.
- As the owner (Yakir), I see the group budget vs actual and get warned before we blow a day.
- As a member with a personal purchase, I keep it private and out of group settlement, with one tap to convert it to shared.
- As the group, at trip end we get a "who pays whom" plan with the fewest possible transfers.
- As a member, I understand exactly how any converted amount was computed (rate, type, fee, timestamp).

## Screen layout

Bottom-nav entry: **Money** ("כסף"). Single scroll page, mobile-first, RTL.

```text
┌─────────────────────────────────┐
│ כסף — Budapest            [⚙]  │
│ ┌─────────────────────────────┐ │
│ │ Group budget vs actual      │ │  ← BudgetHeader
│ │ ████████░░░░  62%           │ │
│ │ 310,400 / 500,000 HUF       │ │  ← figures are placeholders
│ │ ⚠ Food at 91% of category   │ │
│ └─────────────────────────────┘ │
│ ┌───────────┬─────────────────┐ │
│ │ My total  │ Cash box        │ │  ← StatCards
│ │ 78,200 Ft │ 45,000 Ft       │ │
│ │ ≈ ₪673    │ (optional)      │ │
│ └───────────┴─────────────────┘ │
│ Unsettled: 6 · Open splits: 3   │
│ ┌─────────────────────────────┐ │
│ │ מי חייב למי                 │ │  ← SettlementPreview
│ │ Yehonatan → Yakir 43,500 Ft │ │
│ │ Aharon → Yakir    33,500 Ft │ │
│ │ Bar → Yakir       25,500 Ft │ │
│ └─────────────────────────────┘ │
│ [+ הוצאה חדשה]   [ממיר מט״ח]   │  ← FAB + converter
│ ── Recent ───────────────────── │
│ 🍜 Dinner Karaván   −24,000 Ft │
│    Aharon · 4 ways · confirmed │
│ 🚇 72h pass ×4      −14,000 Ft │
│    Yehonatan · estimated ⚠     │
└─────────────────────────────────┘
```

## Components

| Component | Purpose |
|---|---|
| `BudgetHeader` | Group budget vs actual, per-category remaining bars, overspend banner. |
| `StatCards` | Per-person cumulative (HUF + ILS), cash-box balance (if enabled), unsettled count, open-split count. |
| `SettlementPreview` | Current minimal-transfers plan (see algorithm); tap → full settlement screen. |
| `ExpenseList` | Day-grouped expense feed with status badges (`draft`/`confirmed`/`settled`/`refunded`, `estimated` chip when FX-derived). |
| `ExpenseForm` | Minimal-friction entry sheet (below). |
| `CurrencyConverter` | Standalone converter sheet + embedded in `ExpenseForm`. |
| `SplitEditor` | Equal / exact / percent / shares editor with per-member exclude toggle. |
| `ReportsSheet` | Day / category / member / payment-method reports + CSV export. |
| `CashBoxCard` | Optional shared-cash tracker; hidden unless enabled in settings. |

## Data & queries

Tables: `expenses`, `expense_splits`, `exchange_rates` (see `docs/03-data-model-and-rls.md`).

| Query | Source | Notes |
|---|---|---|
| List expenses | `expenses` + `expense_splits` join | TanStack Query key `['expenses', tripId]`; optimistic insert/update. |
| Member balances | derived client-side from expenses+splits | Compute in HUF base only. |
| Latest rate | `exchange_rates` where `from/to`, order `fetched_at desc` limit 1 | Fallback: last manual override; never invent a rate. |
| Budget status | derived: sum by category vs budget caps | Caps are group-set placeholders until decided. |
| Personal expenses | `expenses` where `is_personal = true` | RLS: owner-only read/write; excluded from settlement. |

Exchange-rate pipeline: daily fetch from Frankfurter.app into `exchange_rates` (source tag `frankfurter.app`, `fetched_at`), plus manual override rows (source tag `manual`, entered-by). Display rule: **always show the rate timestamp and source next to any converted figure.** Card charges differ from mid-market — a card-settled amount always overrides the estimate.

## Logic / rules

### Currency converter

| Field | Spec |
|---|---|
| From / To | Currency chips: HUF, ILS, EUR, USD. Default pair: HUF → ILS. Base of record = HUF. |
| Rate | Latest fetched rate; long-press a chip to enter a manual override (logged with user + timestamp). |
| Rate timestamp | Shown under the result: "שער נכון ל־2026-09-11 09:00 · מקור: Frankfurter" (example format only). |
| Rate type | `market` / `card` / `cash` / `manual` — required chip selection when overriding. |
| Fee | Optional `%` or fixed amount, in the *from* currency. |
| Result | Amount + calculation explainer line. |
| Explainer | `18,500 HUF × 0.0086 (market, 2026-09-11) = 159.10 ILS · fee 1.5% → 161.49 ILS` (figures are illustrative). |

Converter warns: "חיוב כרטיס בפועל עשוי להיות שונה מהשער המוצג" — card settlement ≠ quoted rate.

### Expense entry (target ≤ 15 s)

Defaults: date-time = now (`Europe/Budapest` during trip), payer = me, participants = all active members, split = equal, currency = HUF.

| Field | Required | Default / notes |
|---|---|---|
| Title | ✓ | Free text, autocomplete from recent titles. |
| Category | ✓ | `lodging, food, transit, attraction, shopping, nightlife, taxi, other`. Icon chips, one tap. |
| Amount + currency | ✓ | Numeric keypad; currency chip row. |
| Date-time | ✓ | Now; editable. Always stored with timezone. |
| Payer | ✓ | Me; dropdown of active members. |
| Participants | ✓ | All; tap a member to exclude. |
| Split method | ✓ | `equal` (default) / `exact` / `percent` / `shares`; exclusion = share 0. |
| Tip | — | Amount or %, added before split. |
| Fee | — | FX/ATM/commission fee, attributed per group decision (default: split equally). |
| Receipt photo | — | Camera/gallery → private `trip-media` bucket, signed URL. |
| Note | — | Free text. |
| Status | ✓ | `draft` → `confirmed` → `settled` / `refunded`. New = `confirmed` unless personal. |

Offline: entry writes to the IndexedDB outbox immediately, shows a **pending badge** ("ממתין לסנכרון"), and syncs via background sync. Optimistic UI everywhere; conflicts resolved last-writer-wins with an audit row.

### Quoted vs settled amounts

Store both figures on the expense:

```text
expense: "Goulash dinner, Mazel Tov"
  amount:           18,500 HUF
  quoted_rate:      0.0086 ILS/HUF (market, frankfurter.app, 2026-10-05)
  quoted_amount:    159.10 ILS   → status: estimated
  ── card statement arrives ──
  settled_amount:   161.70 ILS   → status: settled
  fx_delta:         +2.60 ILS (spread + fees)  ← shown in report, never silently
```

Settlement math uses HUF amounts; ILS settled figures are informational. Never overwrite `quoted_amount` — keep both for the final report.

### Settlement algorithm (minimal transfers)

```text
net_balance(member) = Σ(amounts_paid_in_HUF) − Σ(shares_in_HUF)

min_transfers(balances):
  transfers = []
  loop:
    creditor = argmax(balances)          # largest positive
    debtor   = argmin(balances)          # largest negative
    if creditor ≤ ε or debtor ≥ −ε: break
    amount = min(creditor, −debtor)
    transfers.append(debtor → creditor, amount)
    balances[creditor] −= amount
    balances[debtor]   += amount
  return transfers                       # ≤ n−1 transfers for n members
```

Worked example (illustrative figures, HUF):

| Expense | Payer | Amount | Split 4 ways |
|---|---|---|---|
| Apartment (4 nights) | Yakir | 160,000 | 40,000 each |
| Dinner, Karaván | Aharon | 24,000 | 6,000 each |
| 72h transit passes ×4 | Yehonatan | 14,000 | 3,500 each |
| Ruin bar night | Bar | 32,000 | 8,000 each |

Each member's total share = 57,500 HUF.

| Member | Paid | Share | Net balance |
|---|---|---|---|
| Yakir | 160,000 | 57,500 | **+102,500** |
| Aharon | 24,000 | 57,500 | **−33,500** |
| Yehonatan | 14,000 | 57,500 | **−43,500** |
| Bar | 32,000 | 57,500 | **−25,500** |

Result — 3 transfers (n−1, optimal):

```text
1. Yehonatan → Yakir  43,500 HUF
2. Aharon    → Yakir  33,500 HUF
3. Bar       → Yakir  25,500 HUF
```

Display each transfer in HUF with ILS alongside using the current rate (tagged with source + `last_verified_at`). Recompute on every expense mutation; cache the result keyed by expense-set hash. The algorithm must produce correct results for 4, 5, or 6 active members (Roei joining adds him from his `active_from` date).

### Personal expenses

- `is_personal = true` → RLS restricts read/write to the owner row; never rendered in shared views.
- Excluded from group settlement and group totals; included in the member's personal report.
- One-tap **"convert to shared"** ("הפוך למשותף"): flips the flag, opens `SplitEditor` with defaults, then enters group math. Conversion is audited.

### Reports

| Report | Content |
|---|---|
| By day | Spend per trip day (Day 1–5), HUF + ILS estimate. |
| By category | Bar chart vs category budget caps. |
| Budget vs actual | Header drill-down: total, per category, daily burn rate. |
| Per place / activity | Group by linked itinerary item or title match. |
| Per member | Paid, share, net balance, personal spend. |
| Cash vs card | Split by payment method; card FX deltas surfaced. |
| Final summary | Trip total, average per person, open debts, FX deltas. |

CSV export columns: `id, date, timezone, title, category, amount, currency, amount_huf, rate_type, rate, rate_source, rate_verified_at, quoted_ils, settled_ils, payer, participants, split_method, status, is_personal, created_by, created_at`.

### Tight-budget mode

- Daily soft cap, group-decided — e.g. **45,000 HUF/day for the group is a PLACEHOLDER** pending a group poll; tag with source "group decision" and verify checkbox.
- Overspend warning banner on the dashboard when a day or category exceeds its cap; category alerts at 80% and 100%.
- Warnings are informational only — never block an expense.

## Offline & realtime

- Full expense list + balances readable offline from IndexedDB cache.
- New/edited expenses go to the outbox with pending badge; background sync replays in order.
- Supabase Realtime subscription on `expenses` / `expense_splits` refreshes balances and settlement plan live for all members.
- Rate fetches are server-side; offline conversions use the latest cached rate with a stale-rate chip ("שער ישן — יעודכן בחיבור").

## Edge cases

- **Delete expense with splits:** cascade-delete splits, write an audit log row (who/when/original amounts), undo snackbar 10 s.
- **Edit after others confirmed:** editing amount or split re-flags the expense `draft` and notifies affected members; settlement recomputes.
- **Roei joins mid-trip:** splits for expenses before his `active_from` date stay 4-way; from activation onward he is included by default (editable per expense).
- **Refund flow:** status → `refunded`, refund amount stored; splits reduced proportionally or per exact method; settlement recomputes.
- **No rate available:** block conversion display with "אין שער מאומת" rather than guessing; allow manual entry with `manual` tag.
- **Rounding:** round half-up per split line in HUF; assign the remainder to the payer so splits always sum to the total.
- **Zero-participant or all-excluded expense:** rejected at validation with an inline error.

## Tasks

- [ ] Build `BudgetHeader` with category caps (placeholder values, group-decision tag).
- [ ] Build `ExpenseForm` meeting the ≤ 15 s entry budget; measure in testing.
- [ ] Build `SplitEditor` (equal/exact/percent/shares + exclude).
- [ ] Build `CurrencyConverter` with rate-type chips, fee, timestamp, explainer.
- [ ] Implement quoted/settled dual-amount storage and FX-delta surfacing.
- [ ] Implement settlement algorithm + `SettlementPreview`; unit-test the worked example above.
- [ ] Implement personal-expense RLS + convert-to-shared action.
- [ ] Build reports + CSV export with the column list above.
- [ ] Wire Frankfurter.app daily rate fetch + manual override table writes.
- [ ] Outbox + pending badge + background sync for expenses.
- [ ] Realtime subscriptions for expenses/splits.
- [ ] Tight-budget mode: caps, 80%/100% alerts, overspend banner.
- [ ] Verify daily cap with the group (poll) before enabling alerts.

## Acceptance criteria

- [ ] Log a shared expense offline in ≤ 15 s; pending badge shows; syncs on reconnect with no duplicates.
- [ ] Converter shows rate, type, source, timestamp, fee and explainer for every conversion.
- [ ] Quoted vs settled example above renders both figures with the delta.
- [ ] Worked settlement example produces exactly the 3 transfers listed; unit-tested for 4, 5, 6 members.
- [ ] Deleting a split expense cascades + audits + offers undo.
- [ ] Personal expense is invisible to other members (RLS-verified) and converts to shared in one tap.
- [ ] CSV export matches the column spec and opens cleanly in Excel/Sheets (RTL-safe).
- [ ] Overspend banner appears when a placeholder cap is exceeded; never blocks entry.
- [ ] All dynamic figures display source + `last_verified_at`; no invented prices or rates anywhere.
- [ ] Balances and settlement update on other members' devices via realtime within 5 s.

## Out of scope

- Real payment execution (Bit/PayBox/bank transfer) — settlement is a plan, not a payment rail.
- Automatic card-statement import (settled amounts are entered manually).
- Multi-trip budgets or recurring budgets.
- Investment/crypto tracking.
