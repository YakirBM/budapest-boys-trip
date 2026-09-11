"use client";

import { useState } from "react";
import { Ellipsis } from "lucide-react";
import { t } from "@/lib/i18n";
import { formatInTz } from "@/lib/utils/time";
import { TZ_BUDAPEST } from "@/lib/utils/time";
import type { TripItem } from "@/lib/data/today";
import type { ItineraryStatus } from "@/components/ui/types";
import { TimelineItem } from "@/components/ui/TimelineItem";
import { StatusMenuSheet } from "./StatusMenuSheet";
import { ItemCost } from "./ItemCost";

export interface TodayTimelineProps {
  items: TripItem[];
  isOwner: boolean;
  onStatusChange: (itemId: string, next: ItineraryStatus) => void | Promise<void>;
}

/**
 * TimelineList (doc 00): one TimelineItem per scheduled item, ordered by
 * sort_order — time (Hungary clock; the strip notes all times are HU), category
 * icon, title, address, owner, estimate cost with the verify badge, backup
 * indicator and a legal-transitions status menu.
 */
export function TodayTimeline({ items, isOwner, onStatusChange }: TodayTimelineProps) {
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const menuItem = items.find((i) => i.id === menuItemId) ?? null;

  return (
    <section aria-label={t("today.timeline")} className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-text-primary">{t("today.timeline")}</h2>
        <span className="text-xs text-text-muted">{t("today.allTimesHungary")}</span>
      </div>

      <ol className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <TimelineItem
              time={formatInTz(new Date(item.startTime), TZ_BUDAPEST)}
              title={item.title}
              address={item.address ?? undefined}
              category={item.category}
              status={item.status}
              owner={item.ownerName ?? undefined}
              navUrl={item.navUrl ?? undefined}
            />
            <div className="ms-6 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pe-1">
              <ItemCost
                perPerson={item.estCostPerPerson}
                group={item.estCostGroup}
                currency={item.currency}
                source={item.place?.source ?? null}
                lastVerifiedAt={item.place?.lastVerifiedAt ?? null}
              />
              {item.isRequired && (
                <span className="rounded-full bg-danger/12 px-2 py-0.5 text-[11px] font-bold text-danger">
                  {t("priorities.required")}
                </span>
              )}
              {item.backupTitle && (
                <span className="text-[11px] text-text-muted">
                  {t("today.backupOf", { title: item.backupTitle })}
                </span>
              )}
              <button
                type="button"
                onClick={() => setMenuItemId(item.id)}
                aria-label={`${t("today.statusTitle")}: ${item.title}`}
                className="ms-auto inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-text-muted transition-opacity active:opacity-80"
              >
                <Ellipsis aria-hidden size={20} />
              </button>
            </div>
          </li>
        ))}
      </ol>

      {menuItem && (
        <StatusMenuSheet
          itemTitle={menuItem.title}
          status={menuItem.status}
          isOwner={isOwner}
          open={menuItemId !== null}
          onClose={() => setMenuItemId(null)}
          onTransition={(next) => onStatusChange(menuItem.id, next)}
        />
      )}
    </section>
  );
}
