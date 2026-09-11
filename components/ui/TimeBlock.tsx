"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import type { TimeZoneName } from "./types";

export interface TimeBlockProps {
  dateTime: string | number | Date;
  timeZone: TimeZoneName;
  showTzBadge?: boolean;
  /** Force a visual state; default "auto" computes now/past client-side. */
  state?: "future" | "now" | "past";
  className?: string;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function formatTime(date: Date, timeZone: TimeZoneName): string {
  const key = timeZone;
  let formatter = timeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    });
    timeFormatters.set(key, formatter);
  }
  return formatter.format(date);
}

/**
 * TimeBlock — `16:35` in tabular-nums, LTR-isolated, + tz badge
 * (שעון הונגריה / שעון ישראל). States: future / now (brand pulse) / past
 * (muted). "now"/"past" resolve after mount to keep SSR output stable.
 */
export function TimeBlock({ dateTime, timeZone, showTzBadge = true, state, className }: TimeBlockProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const date = new Date(dateTime);
  const isValid = !Number.isNaN(date.getTime());

  let visualState: "future" | "now" | "past" = state ?? "future";
  if (!state && mounted && isValid) {
    const now = Date.now();
    // "now" window: within the hour around the timestamp
    visualState = Math.abs(date.getTime() - now) <= 60 * 60 * 1000 ? "now" : date.getTime() < now ? "past" : "future";
  }

  const tzLabel =
    timeZone === "Europe/Budapest" ? t("today.tzHungary") : t("today.tzIsrael");

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5",
        visualState === "past" && "text-text-muted",
        visualState === "now" && "font-semibold text-brand",
        className,
      )}
    >
      <span
        dir="ltr"
        className={clsx(
          "ltr-iso tnum rounded-md px-0.5 text-sm",
          visualState === "now" && "pulse-brand border border-brand bg-brand/5",
        )}
      >
        {isValid ? formatTime(date, timeZone) : "--:--"}
      </span>
      {showTzBadge && (
        <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[11px] font-medium leading-4 text-text-muted">
          {tzLabel}
        </span>
      )}
    </span>
  );
}
