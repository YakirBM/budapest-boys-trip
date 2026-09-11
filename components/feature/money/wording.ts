"use client";

import { t } from "@/lib/i18n";
import type { Currency } from "@/lib/utils/money";

/**
 * Money wording builders — docs/14 §5.1.
 * All user-facing Hebrew comes from messages/he/money.json via t() only.
 * Amounts are passed in already formatted (callers render them LTR-isolated
 * with dir="ltr" + tnum; builders here return plain strings for tests and
 * for aria-labels).
 *
 * Rendered UI must use full-sentence balance keys only; the bare legacy
 * balanced key stays in the dictionary for compat but is never referenced.
 */

export type BalanceKind = "creditor" | "debtor" | "settled";

export function balanceKind(netHuf: number): BalanceKind {
  if (netHuf > 0) return "creditor";
  if (netHuf < 0) return "debtor";
  return "settled";
}

export interface BalanceTextInput {
  netHuf: number;
  name: string;
  /** Already formatted, e.g. formatMoney(abs, "HUF"). */
  amountFormatted: string;
  /** Pre-joined breakdown list (see buildBalanceBreakdownList), optional. */
  breakdownList?: string;
}

/** Full-sentence balance line for every net-sign case. */
export function buildBalanceText({ netHuf, name, amountFormatted, breakdownList }: BalanceTextInput): string {
  const kind = balanceKind(netHuf);
  if (kind === "creditor") {
    return t("money.balances.owedTo", { name, amount: amountFormatted });
  }
  if (kind === "debtor") {
    const base = t("money.balances.owesDetail", { name, amount: amountFormatted });
    if (breakdownList && breakdownList.trim() !== "") {
      return t("money.balances.breakdownWrap", { base, list: breakdownList });
    }
    return base;
  }
  return t("money.balances.settledClean", { name });
}

export interface BreakdownItem {
  name: string;
  amountFormatted: string;
}

/** "לדני 1,200 Ft, לאבי 850 Ft" — each item via money.balances.owesToEach. */
export function buildBalanceBreakdownList(items: BreakdownItem[]): string {
  return items
    .map((item) => t("money.balances.owesToEach", { name: item.name, amount: item.amountFormatted }))
    .join(", ");
}

/** Transfer reason: per-expense title when attributable, else group reason. */
export function buildTransferReason(title?: string | null): string {
  const clean = (title ?? "").trim();
  if (clean !== "") {
    return t("money.transfer.repayFor", { title: clean });
  }
  return t("money.transfer.settlementReason");
}

export function buildTransferParticipants(count: number): string {
  return t("money.transfer.participants", { count });
}

/** Paid-marker label for the done state (button shows this after marking). */
export function buildTransferPaidLabel(): string {
  return t("money.transfer.paidDone");
}

/** Expense payer line: "דני שילם 12,400 Ft". */
export function buildExpensePaidLine(name: string, amountFormatted: string): string {
  return t("money.expense.paidLine", { name, amount: amountFormatted });
}

/** Counterpart line from split member names (not just a count). */
export function buildExpenseSplitLine(names: string[], count: number): string {
  const joined = names.join(", ");
  if (count <= 1) {
    return t("money.expense.splitSingle", { names: joined });
  }
  return t("money.expense.splitAmong", { names: joined, count });
}

/** Day + Budapest time line: "יום 2 · 19:40". Caller appends the HU tag. */
export function buildExpenseWhen(day: number | null, time: string): string {
  if (day === null) return time;
  return t("money.expense.when", { day, time });
}

// ---------------------------------------------------------------------------
// FX rate resolution with inverse fallback (docs/14 §5.2)
// ---------------------------------------------------------------------------

export interface FxRateLike {
  base: string;
  quote: string;
  rate: number;
  source: string | null;
  fetched_at: string | null;
}

export interface ResolvedRate {
  rate: number;
  source: string | null;
  fetchedAt: string | null;
  /** True when derived as 1/inverse — must be labelled "calculated". */
  calculated: boolean;
}

/**
 * Resolve a conversion rate for from→to.
 * Direct row wins; otherwise 1/inverse when available (labelled calculated);
 * same-currency is exactly 1; missing pair returns null.
 */
export function resolveFxRate(from: Currency, to: Currency, rates: FxRateLike[]): ResolvedRate | null {
  if (from === to) {
    return { rate: 1, source: null, fetchedAt: null, calculated: false };
  }
  const direct = rates.find((r) => r.base === from && r.quote === to);
  if (direct && direct.rate > 0) {
    return { rate: direct.rate, source: direct.source, fetchedAt: direct.fetched_at, calculated: false };
  }
  const inverse = rates.find((r) => r.base === to && r.quote === from);
  if (inverse && inverse.rate > 0) {
    return { rate: 1 / inverse.rate, source: inverse.source, fetchedAt: inverse.fetched_at, calculated: true };
  }
  return null;
}

/** Stale when the rate row is older than 24h (docs/14 §5.2). */
export function isRateStale(fetchedAt: string | null, nowMs: number = Date.now()): boolean {
  if (!fetchedAt) return false;
  const ts = new Date(fetchedAt).getTime();
  if (!Number.isFinite(ts)) return true;
  return nowMs - ts > 24 * 3600 * 1000;
}

// ---------------------------------------------------------------------------
// Template rendering with LTR-isolated amounts (component helper)
// ---------------------------------------------------------------------------

/**
 * Split a translated template on {placeholders} so callers can inject
 * dir="ltr" spans for amounts while keeping every Hebrew word from t().
 * Returns alternating text / {key} tokens for the component to map.
 */
export function splitTemplate(template: string): Array<{ type: "text"; value: string } | { type: "slot"; key: string }> {
  const parts: Array<{ type: "text"; value: string } | { type: "slot"; key: string }> = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", value: template.slice(last, m.index) });
    }
    parts.push({ type: "slot", key: m[1] as string });
    last = m.index + m[0].length;
  }
  if (last < template.length) {
    parts.push({ type: "text", value: template.slice(last) });
  }
  return parts;
}
