"use client";

import clsx from "clsx";
import { Undo2 } from "lucide-react";
import { t } from "@/lib/i18n";

export interface DaySelectorProps {
  selected: number;
  /** Day number mapped from "now" (clamped) — the jump-back target. */
  defaultDay: number;
}

/**
 * DaySelector — day 1–5 chips + a jump-back chip when a non-default day is
 * selected (doc 00 user story: swipe-between + "חזור להיום"). Links keep the
 * screen server-rendered per day and shareable.
 */
export function DaySelector({ selected, defaultDay }: DaySelectorProps) {
  return (
    <nav aria-label={t("today.dayXof5", { day: selected })} className="mb-3 flex gap-2 overflow-x-auto pb-1">
      {[1, 2, 3, 4, 5].map((day) => {
        const active = day === selected;
        return (
          <a
            key={day}
            href={`/today?day=${day}`}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex h-12 min-w-16 shrink-0 items-center justify-center rounded-xl border px-3 text-sm font-semibold",
              "transition-[background-color,color] duration-150",
              active
                ? "border-transparent bg-brand text-brand-contrast"
                : "border-border bg-surface text-text-secondary active:opacity-80",
            )}
          >
            {t("route.dayTabLabel", { day })}
          </a>
        );
      })}
      {selected !== defaultDay && (
        <a
          href={`/today?day=${defaultDay}`}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-brand bg-brand-soft px-3 text-sm font-bold text-brand-strong active:opacity-80"
        >
          <Undo2 aria-hidden size={16} className="shrink-0 rtl:-scale-x-100" />
          {t("today.backToToday")}
        </a>
      )}
    </nav>
  );
}
