"use client";

import clsx from "clsx";
import { t } from "@/lib/i18n";

export interface DayTabsProps {
  selected: number;
  /** Day mapped from "now" — the initially highlighted tab on first open. */
  defaultDay: number;
  tab: "day" | "places";
}

/** DayTabs 1–5 (doc 01) — links keep the route screen server-rendered per day. */
export function DayTabs({ selected, defaultDay, tab }: DayTabsProps) {
  return (
    <nav aria-label={t("route.title")} className="mb-3 flex gap-2 overflow-x-auto pb-1">
      {[1, 2, 3, 4, 5].map((day) => {
        const active = day === selected;
        const highlight = day === defaultDay && !active;
        return (
          <a
            key={day}
            href={`/route?day=${day}&tab=${tab}`}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex h-12 min-w-16 shrink-0 items-center justify-center rounded-xl border px-3 text-sm font-semibold",
              "transition-[background-color,color] duration-150",
              active
                ? "border-transparent bg-brand text-brand-contrast"
                : "border-border bg-surface text-text-secondary active:opacity-80",
              highlight && "ring-2 ring-brand/40",
            )}
          >
            {t("route.dayTabLabel", { day })}
          </a>
        );
      })}
    </nav>
  );
}
