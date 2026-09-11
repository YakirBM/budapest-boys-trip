/**
 * Money utilities — integer minor units only (docs/03 §1, docs/06-features/05-finance.md).
 * Floating point is never used for stored/settled amounts; Number appears only at
 * the display boundary and for allocation remainders on integers.
 */

export const CURRENCIES = ["HUF", "ILS", "EUR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** ISO-4217 minor-unit exponent. HUF has no decimals in practice (doc 05). */
export const CURRENCY_EXPONENT: Record<Currency, number> = {
  HUF: 0,
  ILS: 2,
  EUR: 2,
  USD: 2,
};

export const BASE_CURRENCY: Currency = "HUF";

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

export function minorFactor(currency: Currency): number {
  return 10 ** CURRENCY_EXPONENT[currency];
}

/** Parse a user-typed decimal amount into minor units. Accepts "1,250.50",
 * "45,000" (thousands) and "12,5" (decimal comma) per keypad input. */
export function parseAmount(input: string, currency: Currency): number | null {
  const cleaned = input.replace(/[^\d,.\-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma !== -1 && lastDot !== -1) {
    // The right-most separator is the decimal point.
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    // Only commas: decimal iff 1–2 digits follow the last comma.
    normalized = /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(",", ".")
      : cleaned.replace(/,/g, "");
  }
  const value = Number(normalized);
  if (normalized.trim() === "" || !Number.isFinite(value)) return null;
  return Math.round(value * minorFactor(currency));
}

/** Integer minor units → Number for display math only. */
export function minorToNumber(minor: number, currency: Currency): number {
  return minor / minorFactor(currency);
}

/** Format minor units with Intl he-IL: HUF 0 decimals, others 2 (doc 05 §MoneyAmount). */
export function formatMinor(minor: number, currency: Currency): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    minimumFractionDigits: CURRENCY_EXPONENT[currency],
    maximumFractionDigits: CURRENCY_EXPONENT[currency],
  }).format(minorToNumber(minor, currency));
}

/**
 * Convert an amount between currencies. `rate` = units of `to` per 1 unit of `from`
 * (e.g. HUF→ILS rate ≈ 0.0086). Result rounded to the target currency's minor unit.
 */
export function convert(
  amountMinor: number,
  from: Currency,
  to: Currency,
  rate: number,
): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("invalid fx rate");
  }
  const sourceMajor = minorToNumber(amountMinor, from);
  return Math.round(sourceMajor * rate * minorFactor(to));
}

export interface ScaledSplit {
  memberId: string;
  amountMinor: number;
}

/**
 * Equal split with remainder-to-payer rounding (doc 05: "round half-up per split
 * line; assign the remainder to the payer so splits always sum to the total").
 * `payerId` must be one of memberIds; excluded members must not appear.
 */
export function splitEqual(
  totalMinor: number,
  memberIds: readonly string[],
  payerId: string,
): ScaledSplit[] {
  if (memberIds.length === 0) throw new Error("no participants");
  if (!memberIds.includes(payerId)) throw new Error("payer not among participants");
  if (totalMinor <= 0) throw new Error("amount must be positive");

  const base = Math.floor(totalMinor / memberIds.length);
  const remainder = totalMinor - base * memberIds.length;

  return memberIds.map((memberId) => ({
    memberId,
    amountMinor: memberId === payerId ? base + remainder : base,
  }));
}

/** Exact-amount split: values must sum to the total exactly. */
export function splitExact(totalMinor: number, amounts: readonly ScaledSplit[]): ScaledSplit[] {
  const sum = amounts.reduce((acc, s) => acc + s.amountMinor, 0);
  if (sum !== totalMinor) throw new Error("exact amounts do not sum to total");
  return amounts.map((s) => ({ ...s }));
}

/** Percent split: percents must sum to 100; remainder goes to the payer. */
export function splitPercent(
  totalMinor: number,
  percents: readonly { memberId: string; percent: number }[],
  payerId: string,
): ScaledSplit[] {
  const sum = percents.reduce((acc, p) => acc + p.percent, 0);
  if (Math.abs(sum - 100) > 1e-9) throw new Error("percents must sum to 100");
  const raw = percents.map((p) => ({
    memberId: p.memberId,
    amountMinor: Math.floor((totalMinor * p.percent) / 100),
  }));
  const assigned = raw.reduce((acc, r) => acc + r.amountMinor, 0);
  const remainder = totalMinor - assigned;
  return raw.map((r) => ({
    memberId: r.memberId,
    amountMinor: r.memberId === payerId ? r.amountMinor + remainder : r.amountMinor,
  }));
}

/** Weighted shares split (e.g. shares 2/1/1/1); remainder goes to the payer. */
export function splitShares(
  totalMinor: number,
  shares: readonly { memberId: string; shares: number }[],
  payerId: string,
): ScaledSplit[] {
  const totalShares = shares.reduce((acc, s) => acc + s.shares, 0);
  if (totalShares <= 0) throw new Error("total shares must be positive");
  const raw = shares.map((s) => ({
    memberId: s.memberId,
    amountMinor: Math.floor((totalMinor * s.shares) / totalShares),
  }));
  const assigned = raw.reduce((acc, r) => acc + r.amountMinor, 0);
  const remainder = totalMinor - assigned;
  return raw.map((r) => ({
    memberId: r.memberId,
    amountMinor: r.memberId === payerId ? r.amountMinor + remainder : r.amountMinor,
  }));
}

export interface ExpenseLike {
  paidBy: string;
  /** Total in HUF minor units (amount_base_huf). */
  amountBaseHufMinor: number;
  /** Payer's own share (e.g. 1 for personal, or the payer's split). */
  payerShareMinor: number;
  /** Other participants' shares in HUF minor units. */
  otherShares: readonly { memberId: string; amountMinor: number }[];
}

/**
 * Net balance per member in HUF minor units: paid − owed.
 * Personal expenses never enter the calculation (caller filters).
 */
export function netBalances(expenses: readonly ExpenseLike[]): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (memberId: string, delta: number) =>
    balances.set(memberId, (balances.get(memberId) ?? 0) + delta);

  for (const expense of expenses) {
    add(expense.paidBy, expense.amountBaseHufMinor);
    add(expense.paidBy, -expense.payerShareMinor);
    for (const share of expense.otherShares) {
      add(share.memberId, -share.amountMinor);
    }
  }
  return balances;
}

export interface Transfer {
  from: string;
  to: string;
  amountMinor: number;
}

/**
 * Greedy minimal-transfer settlement (docs/03 §9, docs/06-features/05 §algorithm):
 * repeatedly settle the largest debtor against the largest creditor.
 * Produces at most n−1 transfers.
 */
export function suggestSettlements(balances: Map<string, number>): Transfer[] {
  const debtors = [...balances.entries()]
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, remaining: -v }));
  const creditors = [...balances.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, remaining: v }));

  const transfers: Transfer[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort((a, b) => b.remaining - a.remaining);
    creditors.sort((a, b) => b.remaining - a.remaining);
    const debtor = debtors[0];
    const creditor = creditors[0];
    if (!debtor || !creditor) break;
    const pay = Math.min(debtor.remaining, creditor.remaining);

    transfers.push({ from: debtor.id, to: creditor.id, amountMinor: pay });
    debtor.remaining -= pay;
    creditor.remaining -= pay;

    if (debtor.remaining === 0) debtors.shift();
    if (creditor.remaining === 0) creditors.shift();
  }

  return transfers;
}
