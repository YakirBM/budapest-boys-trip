"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { t } from "@/lib/i18n";
import type { MemberInfo, TripItem } from "@/lib/data/today";
import type { LibraryPlace } from "@/lib/data/route";
import { SubTabs } from "@/components/ui/SubTabs";
import { SchedulePane } from "./SchedulePane";
import { MapPane } from "./MapPane";
import { DiscoverPane } from "@/components/feature/places/DiscoverPane";

export type TodaySub = "schedule" | "discover" | "map";

export interface TodayDashboardProps {
  dayNumber: number;
  defaultDay: number;
  sub: TodaySub;
  dayDateIso: string;
  groupItems: TripItem[];
  members: MemberInfo[];
  currentUserId: string | null;
  isOwner: boolean;
}

function subHref(dayNumber: number, sub: TodaySub): string {
  return `/today?day=${dayNumber}&sub=${sub}`;
}

function dayHref(day: number, sub: TodaySub): string {
  return `/today?day=${day}&sub=${sub}`;
}

/**
 * TodayDashboard — Tab 1 root (docs/14 §3.1). Day buttons row + SubTabs
 * (schedule|discover|map, default schedule, deep-linkable ?sub=) + panes.
 * Shares one QueryClient (shell provider) + per-pane realtime channels.
 */
export function TodayDashboard({
  dayNumber,
  defaultDay,
  sub,
  dayDateIso,
  groupItems,
  members,
  currentUserId,
  isOwner,
}: TodayDashboardProps) {
  const router = useRouter();
  const [activeSub, setActiveSub] = useState<TodaySub>(sub);
  const [prefilledPlace, setPrefilledPlace] = useState<{ name: string; address?: string | null } | null>(null);

  useEffect(() => {
    setActiveSub(sub);
  }, [sub]);

  function switchSub(next: TodaySub): void {
    setActiveSub(next);
    router.push(subHref(dayNumber, next), { scroll: false });
  }

  function handleAddToDay(place: LibraryPlace | { name: string; address?: string | null }): void {
    setPrefilledPlace({ name: place.name, address: "address" in place ? (place.address ?? null) : null });
    switchSub("schedule");
  }

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label={t("today.dayXof5", { day: dayNumber })} className="flex gap-2 overflow-x-auto pb-1">
        {[1, 2, 3, 4, 5].map((day) => {
          const active = day === dayNumber;
          return (
            <a
              key={day}
              href={dayHref(day, activeSub)}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "inline-flex h-12 min-w-16 shrink-0 items-center justify-center rounded-xl border px-3 text-sm font-semibold",
                active
                  ? "border-transparent bg-brand text-brand-contrast"
                  : "border-border bg-surface text-text-secondary",
              )}
            >
              {t("route.dayTabLabel", { day })}
            </a>
          );
        })}
        {dayNumber !== defaultDay && (
          <a
            href={dayHref(defaultDay, activeSub)}
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl border border-brand bg-brand-soft px-3 text-sm font-bold text-brand-strong"
          >
            {t("today.backToToday")}
          </a>
        )}
      </nav>

      <SubTabs
        ariaLabel={t("today.sub.label")}
        activeId={activeSub}
        tabs={[
          { id: "schedule", label: t("today.sub.schedule"), href: subHref(dayNumber, "schedule") },
          { id: "discover", label: t("today.sub.discover"), href: subHref(dayNumber, "discover") },
          { id: "map", label: t("today.sub.map"), href: subHref(dayNumber, "map") },
        ]}
      />

      <div onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest?.('a[href*="sub="]');
        if (!anchor) return;
        const href = anchor.getAttribute("href") ?? "";
        const match = href.match(/sub=(schedule|discover|map)/);
        if (match?.[1]) setActiveSub(match[1] as TodaySub);
      }}>
        {activeSub === "schedule" && (
          <SchedulePane
            dayNumber={dayNumber}
            dayDateIso={dayDateIso}
            groupItems={groupItems}
            members={members}
            currentUserId={currentUserId}
            isOwner={isOwner}
            prefilledPlace={prefilledPlace}
            onPrefilledConsumed={() => setPrefilledPlace(null)}
          />
        )}
        {activeSub === "discover" && (
          <DiscoverPane dayNumber={dayNumber} currentUserId={currentUserId} onAddToDay={handleAddToDay} />
        )}
        {activeSub === "map" && (
          <MapPane currentUserId={currentUserId} isOwner={isOwner} onAddToDay={handleAddToDay} />
        )}
      </div>
    </div>
  );
}
