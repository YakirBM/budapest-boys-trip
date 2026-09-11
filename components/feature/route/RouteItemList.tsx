"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Ellipsis, Umbrella } from "lucide-react";
import { t } from "@/lib/i18n";
import { formatInTz, TZ_BUDAPEST } from "@/lib/utils/time";
import type { TripItem } from "@/lib/data/today";
import type { ItineraryStatus } from "@/components/ui/types";
import { TimelineItem } from "@/components/ui/TimelineItem";
import { StatusMenuSheet } from "@/components/feature/today/StatusMenuSheet";
import { ItemCost } from "@/components/feature/today/ItemCost";

export interface RouteItemListProps {
  items: TripItem[];
  isOwner: boolean;
  onReorder: (itemId: string, direction: "up" | "down") => void;
  onStatusChange: (itemId: string, next: ItineraryStatus) => void | Promise<void>;
  onAttachBackup: (itemId: string) => void;
}

/**
 * Ordered day list (doc 01). Reorder = 48px up/down buttons (deliberately NOT
 * drag — simpler and touch-safe; the server swaps sort_order in steps of 10).
 * Same legal status machine as Today, plus backup attach per item.
 */
export function RouteItemList({ items, isOwner, onReorder, onStatusChange, onAttachBackup }: RouteItemListProps) {
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const menuItem = items.find((item) => item.id === menuItemId) ?? null;

  return (
    <section aria-label={t("route.title")} className="mb-4">
      <ol className="flex flex-col gap-1">
        {items.map((item, index) => (
          <li key={item.id} className="relative">
            <TimelineItem
              time={formatInTz(new Date(item.startTime), TZ_BUDAPEST)}
              title={item.title}
              address={item.address ?? undefined}
              category={item.category}
              status={item.status}
              owner={item.ownerName ?? undefined}
              navUrl={item.navUrl ?? undefined}
              showCategoryIcon={false}
            />
            <div className="ms-6 mt-1 flex flex-col gap-1 pe-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ItemCost
                  perPerson={item.estCostPerPerson}
                  group={item.estCostGroup}
                  currency={item.currency}
                  source={item.place?.source ?? null}
                  lastVerifiedAt={item.place?.lastVerifiedAt ?? null}
                />
                {item.durationMin !== null && (
                  <span dir="ltr" className="tnum text-xs text-text-muted">
                    {item.durationMin} {t("today.minutesShort")}
                  </span>
                )}
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
              </div>

              <div className="flex items-center gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => onReorder(item.id, "up")}
                  disabled={index === 0}
                  aria-label={t("route.reorderUp")}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-text-secondary transition-opacity active:opacity-80 disabled:opacity-30"
                >
                  <ChevronUp aria-hidden size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => onReorder(item.id, "down")}
                  disabled={index === items.length - 1}
                  aria-label={t("route.reorderDown")}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-text-secondary transition-opacity active:opacity-80 disabled:opacity-30"
                >
                  <ChevronDown aria-hidden size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => onAttachBackup(item.id)}
                  aria-label={t("route.attachBackup")}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-text-secondary transition-opacity active:opacity-80"
                >
                  <Umbrella aria-hidden size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setMenuItemId(item.id)}
                  aria-label={`${t("today.statusTitle")}: ${item.title}`}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-text-secondary transition-opacity active:opacity-80"
                >
                  <Ellipsis aria-hidden size={20} />
                </button>
              </div>
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
