"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { Card } from "./Card";

export interface Countdown {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  now: number;
}

/**
 * useCountdown — ticks every 30s (doc 05 §7). Returns null before mount so SSR
 * and first client render match (no hydration mismatch on time-dependent UI).
 */
export function useCountdown(target: string | number | Date, tickMs = 30_000): Countdown | null {
  const targetMs = useMemo(() => new Date(target).getTime(), [target]);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [targetMs, tickMs]);

  if (now === null || Number.isNaN(targetMs)) return null;
  const totalMs = Math.max(0, targetMs - now);
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    totalMs,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    now,
  };
}

function unitBlock(value: number, label: string) {
  return (
    <div className="flex min-w-14 flex-col items-center">
      <span className="tnum text-[32px] font-bold leading-10" dir="ltr">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-xs font-medium text-text-muted">{label}</span>
    </div>
  );
}

export interface CountdownCardProps {
  targetDateTime: string | number | Date;
  /** Optional trip end — while now is between target and end the card is "live". */
  endDateTime?: string | number | Date;
  title: string;
  subtitle?: string;
  className?: string;
}

/**
 * CountdownCard — hero countdown (display type, tabular-nums). States: pre /
 * live ("הטיול התחיל!") / done (collapsed). Color escalates: amber ≤15min,
 * red ≤5min. A visually-hidden polite live region updates at most once/minute.
 */
export function CountdownCard({ targetDateTime, endDateTime, title, subtitle, className }: CountdownCardProps) {
  const countdown = useCountdown(targetDateTime);
  const endMs = useMemo(
    () => (endDateTime !== undefined ? new Date(endDateTime).getTime() : null),
    [endDateTime],
  );

  const phase: "loading" | "pre" | "live" | "done" =
    countdown === null
      ? "loading"
      : countdown.totalMs > 0
        ? "pre"
        : endMs !== null && countdown.now < endMs
          ? "live"
          : "done";

  const urgency =
    countdown !== null && countdown.totalMs <= 5 * 60_000
      ? "danger"
      : countdown !== null && countdown.totalMs <= 15 * 60_000
        ? "warning"
        : "neutral";

  const urgencyText =
    urgency === "danger" ? "text-danger" : urgency === "warning" ? "text-warning" : "text-text-primary";

  // Minute-level summary for the live region (≤1 announcement per minute).
  const minuteSummary =
    countdown === null || phase !== "pre"
      ? ""
      : countdown.days > 0
        ? t("today.daysLeft", { count: countdown.days })
        : countdown.hours > 0
          ? t("today.hoursLeft", { count: countdown.hours })
          : countdown.minutes > 1
            ? t("today.minutesLeft", { count: countdown.minutes })
            : t("today.oneMinuteLeft");

  return (
    <Card
      className={clsx(
        "flex flex-col gap-3 rounded-2xl",
        phase === "live" && "border-brand bg-brand/5",
        className,
      )}
    >
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
      </div>

      {phase === "loading" && (
        <div className="flex gap-4" aria-hidden>
          {["88", "88", "88"].map((v) => (
            <span key={v} className="tnum text-[32px] font-bold leading-10 text-text-muted">
              {v}
            </span>
          ))}
        </div>
      )}

      {phase === "pre" && countdown !== null && (
        <>
          <div className={clsx("flex items-start gap-4", urgencyText)} dir="rtl">
            {unitBlock(countdown.days, t("today.days"))}
            {unitBlock(countdown.hours, t("today.hours"))}
            {unitBlock(countdown.minutes, t("today.minutes"))}
          </div>
          <p aria-live="polite" className="sr-only">
            {minuteSummary}
          </p>
        </>
      )}

      {phase === "live" && (
        <p className="text-2xl font-bold text-brand">{t("today.tripStarted")}</p>
      )}

      {phase === "done" && (
        <p className="text-base font-medium text-text-muted">{t("today.tripDone")}</p>
      )}
    </Card>
  );
}
