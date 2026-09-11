"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useId, useMemo } from "react";
import { t } from "@/lib/i18n";
import {
  CURRENCY_EXPONENT,
  formatMinor,
  parseAmount,
  type Currency,
} from "@/lib/utils/money";

export interface AmountInputProps {
  value: string;
  onChange: (next: string) => void;
  currency: Currency;
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * AmountInput — shared numeric entry (money + schedule costs + converter).
 * LTR isolated, decimal keypad on mobile, per-currency decimals (HUF 0,
 * ILS/EUR/USD 2), live formatted preview. Parsing reuses parseAmount
 * (lib/utils/money.ts) so "," and "." both work.
 */
export function AmountInput({
  value,
  onChange,
  currency,
  id,
  label,
  placeholder,
  disabled = false,
  autoFocus = false,
  className,
}: AmountInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const previewId = `${inputId}-preview`;
  const minor = useMemo(
    () => (value.trim() === "" ? null : parseAmount(value, currency)),
    [value, currency],
  );
  const decimals = CURRENCY_EXPONENT[currency];

  return (
    <div className={clsx("min-w-0", className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-sm font-semibold text-text-primary"
        >
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            autoFocus={autoFocus}
            disabled={disabled}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder ?? (decimals === 0 ? "0" : "0.00")}
            aria-describedby={previewId}
            aria-invalid={value.trim() !== "" && minor === null}
            className="tnum w-full rounded-xl border border-border bg-surface-raised px-3 py-3 pe-10 text-xl font-bold text-text-primary placeholder:font-medium placeholder:text-text-muted focus:border-brand focus:outline-none disabled:opacity-50"
          />
          {value !== "" && !disabled && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label={t("common.close")}
              className="absolute end-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted active:text-text-secondary"
            >
              <X aria-hidden size={18} />
            </button>
          )}
        </div>
        <span
          aria-hidden
          className="inline-flex h-12 shrink-0 items-center rounded-xl bg-surface-raised px-3 text-base font-bold text-text-secondary"
        >
          {currency === "ILS" ? "₪" : currency === "HUF" ? "Ft" : currency === "EUR" ? "€" : "$"}
        </span>
      </div>
      <p id={previewId} aria-live="polite" className="tnum mt-1 min-h-5 text-xs text-text-muted">
        {value.trim() === ""
          ? t("money.amount.hint")
          : minor === null
            ? t("money.form.errAmountRequired")
            : <span dir="ltr">{formatMinor(minor, currency)}</span>}
      </p>
    </div>
  );
}
