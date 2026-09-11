import clsx from "clsx";
import type { CurrencyCode } from "./types";

export interface MoneyAmountProps {
  amount: number;
  currency: CurrencyCode;
  /** Optional secondary converted amount rendered as caption. */
  convertedTo?: { amount: number; currency: CurrencyCode };
  size?: "sm" | "md" | "lg";
  className?: string;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

/** he-IL currency: HUF 0 decimals; ILS/EUR/USD 2 (doc 05 §7). */
export function formatMoney(amount: number, currency: CurrencyCode): string {
  const key = `${currency}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    const digits = currency === "HUF" ? 0 : 2;
    formatter = new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatterCache.set(key, formatter);
  }
  return formatter.format(amount);
}

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
} as const;

/**
 * MoneyAmount — currency-formatted amount, LTR-isolated with tabular numerals
 * so Hebrew punctuation never jumps (doc 05 §2, §7). Optional converted amount
 * below as caption.
 */
export function MoneyAmount({ amount, currency, convertedTo, size = "md", className }: MoneyAmountProps) {
  return (
    <span className={clsx("inline-flex flex-col items-start gap-0.5", className)}>
      <span dir="ltr" className={clsx("ltr-iso tnum font-semibold", sizeClasses[size])}>
        {formatMoney(amount, currency)}
      </span>
      {convertedTo && (
        <span className="text-xs text-text-muted">
          ≈{" "}
          <span dir="ltr" className="ltr-iso tnum">
            {formatMoney(convertedTo.amount, convertedTo.currency)}
          </span>
        </span>
      )}
    </span>
  );
}
