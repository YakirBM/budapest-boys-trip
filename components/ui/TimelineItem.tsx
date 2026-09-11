import clsx from "clsx";
import { MapPin, Navigation } from "lucide-react";
import { t } from "@/lib/i18n";
import { CategoryIcon } from "./CategoryIcon";
import { DirectionalIcon } from "./DirectionalIcon";
import { StatusChip } from "./StatusChip";
import { categoryColorVar, type Category, type ItineraryStatus } from "./types";

export interface TimelineItemProps {
  time: string;
  title: string;
  address?: string;
  category: Category;
  status: ItineraryStatus;
  owner?: string;
  navUrl?: string;
  /** Renders the category icon at the end of the title row (default true). */
  showCategoryIcon?: boolean;
  className?: string;
}

/**
 * TimelineItem — vertical rail with a category-colored node (doc 05 §7).
 * States: in_progress = elevated + brand ring; completed = muted + strikethrough;
 * skipped/cancelled = dimmed. Rail and node use inline-start positioning only.
 */
export function TimelineItem({
  time,
  title,
  address,
  category,
  status,
  owner,
  navUrl,
  showCategoryIcon = true,
  className,
}: TimelineItemProps) {
  const categoryColor = categoryColorVar(category);
  const dimmed = status === "skipped" || status === "cancelled";

  return (
    <li
      className={clsx(
        "relative flex gap-3 ps-6",
        dimmed && "opacity-50",
        className,
      )}
    >
      {/* Rail */}
      <span aria-hidden className="absolute inset-y-0 start-[7px] w-0.5 bg-border" />
      {/* Node */}
      <span
        aria-hidden
        className={clsx(
          "absolute top-4 start-0 h-4 w-4 rounded-full border-2",
          status === "in_progress" && "h-5 w-5 start-[-2px] border-brand",
        )}
        style={{
          backgroundColor: status === "in_progress" ? "var(--color-brand)" : categoryColor,
          borderColor: status === "in_progress" ? "var(--color-brand)" : "var(--color-surface)",
        }}
      />

      <div
        className={clsx(
          "flex-1 rounded-xl p-3",
          status === "in_progress" && "bg-surface ring-2 ring-brand shadow-sm",
          status !== "in_progress" && !dimmed && "bg-surface",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span dir="ltr" className="ltr-iso tnum text-sm font-semibold text-text-secondary">
              {time}
            </span>
            <h3
              className={clsx(
                "text-base font-semibold text-text-primary",
                status === "completed" && "text-text-muted line-through",
              )}
            >
              {title}
            </h3>
            {address && (
              <p className="flex items-center gap-1 text-sm text-text-muted">
                <MapPin aria-hidden size={14} className="shrink-0" />
                <span className="truncate">{address}</span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={status} size="sm" />
              {showCategoryIcon && <CategoryIcon category={category} size={20} />}
              {owner && <span className="text-xs text-text-muted">{owner}</span>}
            </div>
          </div>
          {navUrl && (
            <a
              href={navUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("a11y.navigate")}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong transition-opacity active:opacity-80"
            >
              <DirectionalIcon icon={Navigation} size={20} />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
