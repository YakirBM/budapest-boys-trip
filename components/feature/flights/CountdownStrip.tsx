"use client";

import { t } from "@/lib/i18n";
import { useCountdown } from "@/components/ui/CountdownCard";
import { formatDateHebrew, weekdayHebrew } from "@/lib/utils/time";

function unit(value: number, label: string) {
  return (
    <div className="flex min-w-14 flex-col items-center">
      <span className="tnum text-[26px] font-bold leading-8" dir="ltr">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-xs font-medium text-text-muted">{label}</span>
    </div>
  );
}

export interface CountdownStripProps {
  flightNo: string;
  depTime: string;
  depDateIso: string;
}

/** Live strip counting to the next departure (client tick, offline-safe). */
export function CountdownStrip({ flightNo, depTime, depDateIso }: CountdownStripProps) {
  const countdown = useCountdown(depTime);
  const dateLabel = `${weekdayHebrew(depDateIso)} ${formatDateHebrew(depDateIso)}`;

  if (countdown === null) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-text-muted">{t("flights.countdownTitle")}</p>
        <p className="mt-1 font-semibold text-text-primary" dir="auto">
          {flightNo} · {dateLabel}
        </p>
      </div>
    );
  }

  const done = countdown.totalMs <= 0;
  return (
    <div aria-live="polite" className="rounded-xl border border-brand/30 bg-brand-soft/40 p-4">
      <p className="text-sm font-medium text-brand-strong">{t("flights.countdownTitle")}</p>
      {done ? (
        <p className="mt-1 text-lg font-bold text-text-primary">{t("flights.flightDone")}</p>
      ) : (
        <div className="mt-1 flex items-end gap-1" dir="ltr">
          {unit(countdown.days, t("flights.days"))}
          {unit(countdown.hours, t("flights.hours"))}
          {unit(countdown.minutes, t("flights.minutes"))}
        </div>
      )}
      <p className="mt-2 text-sm font-semibold text-text-primary" dir="auto">
        {flightNo} · {dateLabel}
      </p>
    </div>
  );
}
