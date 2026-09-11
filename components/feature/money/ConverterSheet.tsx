"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { t } from "@/lib/i18n";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/components/ui/MoneyAmount";
import { CURRENCIES, convert, minorToNumber, parseAmount, type Currency } from "@/lib/utils/money";
import type { FxRateRow } from "@/lib/data/money";

export interface ConverterSheetProps {
  open: boolean;
  onClose: () => void;
  rates: FxRateRow[];
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });

function resolveRate(
  from: Currency,
  to: Currency,
  rates: FxRateRow[],
): { rate: number; source: string | null; fetchedAt: string | null } | null {
  if (from === to) return { rate: 1, source: null, fetchedAt: null };
  const direct = rates.find((r) => r.base === from && r.quote === to);
  const inverse = rates.find((r) => r.base === to && r.quote === from);
  if (direct) return { rate: direct.rate, source: direct.source, fetchedAt: direct.fetched_at };
  if (inverse && inverse.rate > 0) {
    return { rate: 1 / inverse.rate, source: inverse.source, fetchedAt: inverse.fetched_at };
  }
  return null;
}

function currencyChipRow(
  value: Currency,
  onChange: (c: Currency) => void,
  label: string,
): React.ReactNode {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-1 rounded-xl bg-surface-raised p-1">
        {CURRENCIES.map((code) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={value === code}
            onClick={() => onChange(code)}
            className={clsx(
              "min-h-12 rounded-lg px-1 text-sm font-bold transition-[background-color,color] duration-150",
              value === code ? "bg-brand text-brand-contrast" : "text-text-secondary active:opacity-80",
            )}
          >
            {code}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * CurrencyConverter sheet (docs/06-features/05 §Currency converter).
 * Rates come from the exchange_rates cache only — a manual rate is a local,
 * ephemeral calculation aid (exchange_rates is service-role write-only under
 * RLS, so overrides are NOT persisted; recorded instead on each expense row).
 */
export function ConverterSheet({ open, onClose, rates }: ConverterSheetProps) {
  const [from, setFrom] = useState<Currency>("HUF");
  const [to, setTo] = useState<Currency>("ILS");
  const [amountText, setAmountText] = useState("");
  const [manualRateText, setManualRateText] = useState("");
  const [useManual, setUseManual] = useState(false);
  const [feeText, setFeeText] = useState("");

  const market = useMemo(() => resolveRate(from, to, rates), [from, to, rates]);

  const amountMinor = amountText ? parseAmount(amountText, from) : null;
  const manualRate = Number(manualRateText.replace(",", "."));
  const feePct = feeText.trim() === "" ? 0 : Number(feeText.replace(",", "."));

  const rate = useManual && Number.isFinite(manualRate) && manualRate > 0 ? manualRate : market?.rate ?? null;
  const rateSource = useManual ? null : market?.source ?? null;
  const rateFetchedAt = useManual ? null : market?.fetchedAt ?? null;

  const resultMinor =
    amountMinor !== null && amountMinor > 0 && rate !== null && rate > 0
      ? Math.round(convert(amountMinor, from, to, rate) * (1 + (Number.isFinite(feePct) ? feePct : 0) / 100))
      : null;

  const explainer =
    amountMinor !== null && amountMinor > 0 && rate !== null
      ? t("money.converter.explainer", {
          amount: formatMoney(minorToNumber(amountMinor, from), from),
          from,
          rate: String(rate),
          result: formatMoney(minorToNumber(resultMinor ?? 0, to), to),
          to,
        })
      : null;

  return (
    <BottomSheet open={open} onClose={onClose} title={t("money.converter.title")}>
      <div className="flex flex-col gap-4 pb-4">
        {currencyChipRow(from, setFrom, t("money.converter.from"))}
        {currencyChipRow(to, setTo, t("money.converter.to"))}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("money.converter.amountLabel")}</span>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0"
            className="min-h-12 rounded-xl border border-border bg-surface px-4 text-lg font-semibold tnum text-text-primary outline-none focus:border-brand"
          />
        </label>

        <div className="rounded-xl bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-text-secondary">{t("money.converter.rateLabel")}</span>
            {market ? (
              <span dir="ltr" className="tnum text-sm font-bold text-text-primary">
                {rate !== null ? rate.toPrecision(6) : "—"}
              </span>
            ) : (
              <span className="text-xs font-semibold text-warning">{t("money.converter.noRate")}</span>
            )}
          </div>
          {market && !useManual && rateFetchedAt && (
            <p className="mt-1 text-xs text-text-muted">
              {rateSource} · <span dir="ltr" className="ltr-iso">{dateFormatter.format(new Date(rateFetchedAt))}</span>
            </p>
          )}
          <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={useManual}
              onChange={(e) => setUseManual(e.target.checked)}
              className="h-6 w-6 accent-[var(--color-brand)]"
            />
            {t("money.converter.manualRateToggle")}
          </label>
          {useManual && (
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={manualRateText}
              onChange={(e) => setManualRateText(e.target.value)}
              placeholder={`1 ${from} = ? ${to}`}
              aria-label={t("money.converter.manualRateLabel")}
              className="mt-2 min-h-12 w-full rounded-xl border border-border bg-surface-raised px-4 tnum text-text-primary outline-none focus:border-brand"
            />
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("money.converter.feeLabel")}</span>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            value={feeText}
            onChange={(e) => setFeeText(e.target.value)}
            placeholder="0"
            className="min-h-12 rounded-xl border border-border bg-surface px-4 tnum text-text-primary outline-none focus:border-brand"
          />
        </label>

        <div className="rounded-xl border border-border bg-brand-soft p-4">
          <p className="text-xs font-semibold text-text-muted">{t("money.converter.resultLabel")}</p>
          <p dir="ltr" className="tnum text-2xl font-bold text-text-primary">
            {resultMinor !== null ? formatMoney(minorToNumber(resultMinor, to), to) : "—"}
          </p>
          {explainer && <p className="mt-1 text-xs leading-5 text-text-secondary">{explainer}</p>}
          {resultMinor !== null && feePct > 0 && (
            <p className="text-xs text-text-secondary">{t("money.converter.feeLine", { fee: feePct })}</p>
          )}
        </div>

        <p className="text-xs leading-5 text-text-muted">{t("money.converter.disclaimer")}</p>

        <Button block onClick={onClose}>
          {t("common.confirm")}
        </Button>
      </div>
    </BottomSheet>
  );
}
