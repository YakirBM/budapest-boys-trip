"use client";

import { useMemo } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MessageSquare, Navigation } from "lucide-react";
import clsx from "clsx";
import { t } from "@/lib/i18n";
import { formatInTz, TZ_BUDAPEST } from "@/lib/utils/time";
import { googleMapsDir, googleMapsSearch } from "@/lib/utils/deeplinks";
import type { Category, CurrencyCode, ItineraryStatus } from "@/components/ui/types";
import { categoryColorVar } from "@/components/ui/types";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { MemberAvatar } from "@/components/ui/MemberAvatar";
import { EstimateBadge } from "@/components/ui/EstimateBadge";
import { PendingSyncBadge } from "@/components/ui/PendingSyncBadge";
import { reorderIds, sortScheduleItems } from "./schedule-logic";

export interface ScheduleTileItem {
  id: string;
  title: string;
  description?: string | null;
  address?: string | null;
  category: Category;
  status: ItineraryStatus;
  startTime: string | null;
  durationMin?: number | null;
  imageUrl?: string | null;
  imageSource?: string | null;
  imageFetchedAt?: string | null;
  ownerName?: string | null;
  costPerPerson?: number | null;
  currency?: CurrencyCode;
  source?: string | null;
  lastVerifiedAt?: string | null;
  commentCount?: number;
  navUrl?: string | null;
  sortOrder: number;
  kind: "group" | "personal";
}

export interface ScheduleTilesProps {
  items: ScheduleTileItem[];
  pendingIds?: Set<string>;
  activeId?: string | null;
  onOpen: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

function tileNavUrl(item: ScheduleTileItem): string | null {
  if (item.navUrl) return item.navUrl;
  if (item.address) return googleMapsDir(item.address);
  return googleMapsSearch(item.title);
}

/**
 * ScheduleTiles — tile cards with cover image + blur plate + category frame
 * (docs/14 §3.2.2). dnd-kit vertical list, long-press 250ms on touch,
 * keyboard fallback via sortable coordinates. Cross-list drag disabled by
 * construction (one list per pane).
 */
export function ScheduleTiles({ items, pendingIds, activeId, onOpen, onReorder }: ScheduleTilesProps) {
  const sorted = useMemo(
    () =>
      sortScheduleItems(
        items.map((item) => ({ id: item.id, startTime: item.startTime, sortOrder: item.sortOrder })),
      ),
    [items],
  );
  const orderedIds = useMemo(() => sorted.map((s) => s.id), [sorted]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = orderedIds.indexOf(String(active.id));
    const to = orderedIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(reorderIds(orderedIds, from, to));
  }

  return (
    <div>
      <p className="mb-2 text-xs text-text-muted">{t("today.dnd.reorderHint")}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-3">
            {orderedIds.map((id) => {
              const item = byId.get(id);
              if (!item) return null;
              return (
                <SortableTile
                  key={id}
                  item={item}
                  pending={pendingIds?.has(id) ?? false}
                  active={activeId === id}
                  onOpen={onOpen}
                />
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableTile({
  item,
  pending,
  active,
  onOpen,
}: {
  item: ScheduleTileItem;
  pending: boolean;
  active: boolean;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const categoryColor = categoryColorVar(item.category);
  const timeLabel = item.startTime ? formatInTz(new Date(item.startTime), TZ_BUDAPEST) : null;
  const navUrl = tileNavUrl(item);
  const dimmed = item.status === "skipped" || item.status === "cancelled";
  const completed = item.status === "completed";

  return (
    <li ref={setNodeRef} style={style} className={clsx(isDragging && "opacity-70")}>
      <article
        aria-label={item.title}
        style={{ borderInlineStartColor: categoryColor }}
        className={clsx(
          "tile-cover relative overflow-hidden rounded-2xl border border-border border-s-4",
          active && "ring-2 ring-brand",
          completed && "opacity-80",
          dimmed && "opacity-60",
        )}
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            aria-hidden
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, ${categoryColor} 38%, transparent), var(--color-surface-raised))`,
            }}
          />
        )}
        <span aria-hidden className="tile-scrim-dark absolute inset-0" />
        {item.status === "in_progress" && (
          <span aria-hidden className="absolute inset-0 ring-2 ring-inset ring-brand" />
        )}

        <div className="relative flex flex-col gap-2 p-3">
          <div className="tile-plate rounded-xl p-3">
            <div className="flex items-start gap-2">
              <CategoryIcon category={item.category} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {timeLabel ? (
                    <span dir="ltr" className="ltr-iso tnum text-sm font-bold text-text-primary">
                      {timeLabel}
                    </span>
                  ) : null}
                  <span className="rounded bg-surface-raised px-1 py-0.5 text-[10px] font-bold text-text-muted">
                    HU
                  </span>
                  {pending && <PendingSyncBadge count={1} />}
                </div>
                <h3 className={clsx("truncate text-base font-bold text-text-primary", completed && "line-through")}>
                  {item.title}
                </h3>
                <p className="flex min-w-0 items-center gap-1 text-xs text-text-secondary">
                  <span className="min-w-0 flex-1 truncate">
                    {item.address ?? t("today.tile.noAddress")}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={t("today.tile.openDetails")}
                  onClick={() => onOpen(item.id)}
                  className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl text-text-muted"
                >
                  <span aria-hidden className="text-lg leading-none">⋯</span>
                </button>
                <button
                  type="button"
                  aria-label={`${t("today.dnd.reorderHint")}: ${item.title}`}
                  className="inline-flex h-12 w-12 cursor-grab touch-none items-center justify-center rounded-xl text-text-muted hover:bg-surface-raised active:cursor-grabbing"
                  {...attributes}
                  {...listeners}
                >
                  <GripVertical aria-hidden size={20} />
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip status={item.status} size="sm" />
              {item.ownerName && (
                <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                  <MemberAvatar name={item.ownerName} size={32} />
                  <span className="max-w-28 truncate">{item.ownerName}</span>
                </span>
              )}
              {item.costPerPerson !== null && item.costPerPerson !== undefined && (
                <MoneyAmount amount={item.costPerPerson} currency={item.currency ?? "HUF"} size="sm" />
              )}
              {item.source && item.lastVerifiedAt ? (
                <EstimateBadge source={item.source} lastVerifiedAt={item.lastVerifiedAt} />
              ) : null}
              {(item.commentCount ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                  <MessageSquare aria-hidden size={14} />
                  <span dir="ltr" className="ltr-iso tnum">
                    {item.commentCount}
                  </span>
                </span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-surface-raised px-3 text-sm font-bold text-text-primary"
              >
                {t("today.tile.openDetails")}
              </button>
              {navUrl && (
                <a
                  href={navUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("today.tile.navigate")}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-bold text-brand-contrast"
                >
                  <Navigation aria-hidden size={16} className="rtl:-scale-x-100" />
                  {t("today.tile.navigate")}
                </a>
              )}
            </div>
          </div>
        </div>
      </article>
    </li>
  );
}
