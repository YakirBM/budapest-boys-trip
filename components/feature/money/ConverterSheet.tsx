"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowUpDown, RefreshCw } from "lucide-react";
import { t } from "@/lib/i18n";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { formatMoney } from "@/components/ui/MoneyAmount";
import { CURRENCIES, convert, minorToNumber, parseAmount, type Currency } from "@/lib/utils/money";
import type { FxRateRow } from "@/lib/data/money";
import { isRateStale, resolveFxRate } from "./wording";

export interface ConverterSheetProps {
  open: boolean;
  onClose: () => void;
  rates: FxRateRow[];
  /** Parent revalidate (TanStack invalidate) for the manual refresh button. */
  onRefresh?: () => void;
  /** True when the parent served IndexedDB snapshots (offline cache). */
  stale?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });

function coinSymbol(code: Currency): string {
  if (code === "ILS") return "₪";
  if (code === "HUF") return "Ft";
  if (code === "EUR") return "€";
  return "$";
}

/** Coin icon: ILS green, HUF Hungarian tricolor dot, EUR blue, USD slate. */
function CurrencyCoin({ code }: { code: Currency }) {
  if (code === "HUF") {
    return (
      <span aria-hidden className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-[11px] font-bold text-text-primary ring-1 ring-border">
        Ft
        <span
          aria-hidden
          className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface"
          style={{ background: "linear-gradient(to bottom, #CD2A37 0 33%, #ffffff 33% 66%, #436F4D 66% 100%)" }}
        />
      </span>
    );
  }
  const tint =
    code === "ILS"
      ? "bg-success/15 text-success"
      : code === "EUR"
        ? "bg-info/15 text-info"
        : "bg-text-muted/15 text-text-secondary";
  return (
    <span aria-hidden className={clsx("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold", tint)}>
      {coinSymbol(code)}
    </span>
  );
}

function currencySelector(
  value: Currency,
  onChange: (c: Currency) => void,
  label: string,
): React.ReactNode {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-xl bg-surface-raised p-1 min-[360px]:grid-cols-4">
        {CURRENCIES.map((code) => {
          const selected = value === code;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(code)}
              className={clsx(
                "flex min-h-12 items-center justify-center gap-1.5 rounded-lg px-1 text-sm font-bold transition-[background-color,color] duration-150",
                selected ? "bg-brand text-brand-contrast" : "text-text-secondary active:opacity-80",
              )}
            >
              <CurrencyCoin code={code} />
              <span dir="ltr" className="tnum">{code}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * CurrencyConverter sheet (docs/14 §5.2): coin selectors, AmountInput,
 * swap, result + explainer + source + fetched_at + stale/calculated badges,
 * manual refresh. Offline works on cached rates with a stale badge.
 */
export function ConverterSheet({ open, onClose, rates, onRefresh, stale = false }: ConverterSheetProps) {
  const [from, setFrom] = useState<Currency>("HUF");
  const [to, setTo] = useState<Currency>("ILS");
  const [amountText, setAmountText] = useState("");
  const [manualRateText, setManualRateText] = useState("");
  const [useManual, setUseManual] = useState(false);
  const [feeText, setFeeText] = useState("");
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const market = useMemo(() => resolveFxRate(from, to, rates), [from, to, rates]);

  const amountMinor = amountText.trim() === "" ? null : parseAmount(amountText, from);
  const manualRate = Number(manualRateText.replace(",", "."));
  const feePct = feeText.trim() === "" ? 0 : Number(feeText.replace(",", "."));

  const rate = useManual && Number.isFinite(manualRate) && manualRate > 0 ? manualRate : market?.rate ?? null;
  const rateSource = useManual ? null : market?.source ?? null;
  const rateFetchedAt = useManual ? null : market?.fetchedAt ?? null;
  const calculated = !useManual && (market?.calculated ?? false);

  const rateIsStale = stale || !online || isRateStale(rateFetchedAt);

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

  function swap(): void {
    setFrom(to);
    setTo(from);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("money.converter.title")}>
      <div className="flex flex-col gap-4 pb-4">
        {currencySelector(from, setFrom, t("money.converter.from"))}

        <button
          type="button"
          onClick={swap}
          aria-label={t("money.converter.swap")}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-text-secondary transition-opacity active:opacity-80"
        >
          <ArrowUpDown aria-hidden size={18} />
          {t("money.converter.swap")}
        </button>

        {currencySelector(to, setTo, t("money.converter.to"))}

        <AmountInput
          value={amountText}
          onChange={setAmountText}
          currency={from}
          label={t("money.converter.amountLabel")}
        />

        <div className="rounded-xl bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-text-secondary">{t("money.converter.rateLabel")}</span>
            {market || useManual ? (
              <span dir="ltr" className="tnum text-sm font-bold text-text-primary">
                {rate !== null ? rate.toPrecision(6) : "—"}
              </span>
            ) : (
              <span className="text-xs font-semibold text-warning">{t("money.converter.noRate")}</span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {calculated && (
              <span className="rounded-full bg-info/12 px-2 py-0.5 text-[11px] font-bold text-info">
                {t("money.converter.calculated")}
              </span>
            )}
            {(rateIsStale || !online || stale) && market && (
              <span className="rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-bold text-warning">
                {!online ? t("money.converter.offlineHint") : t("money.converter.staleHint")}
              </span>
            )}
          </div>

          {market && !useManual && rateFetchedAt && (
            <p className="mt-1.5 text-xs text-text-muted">
              {rateSource && <span>{t("money.converter.source", { source: rateSource })} · </span>}
              <span>{t("money.converter.refreshedAt", { time: dateFormatter.format(new Date(rateFetchedAt)) })}</span>
            </p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onRefresh?.()}
              disabled={!online || !onRefresh}
              title={!online ? t("money.converter.offlineHint") : t("money.converter.refresh")}
              aria-label={t("money.converter.refresh")}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-bold text-text-secondary transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw aria-hidden size={16} />
              {t("money.converter.refresh")}
            </button>
          </div>
          {!online && (
            <p className="mt-1 text-xs text-text-muted">{t("money.converter.offlineHint")}</p>
          )}

          <label className="mt-2 flex min-h-12 items-center gap-2 text-sm text-text-secondary">
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
