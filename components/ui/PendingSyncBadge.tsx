import clsx from "clsx";
import { RefreshCw } from "lucide-react";
import { t } from "@/lib/i18n";

export interface PendingSyncBadgeProps {
  count: number;
  className?: string;
}

/**
 * PendingSyncBadge — info-tinted chip "N שינויים ממתינים לסנכרון" for entities
 * with outbox ops (doc 05 §7, docs/07 §background-sync). Renders nothing at 0.
 */
export function PendingSyncBadge({ count, className }: PendingSyncBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full bg-info/12 px-2.5 py-1 text-xs font-semibold text-info",
        className,
      )}
    >
      <RefreshCw aria-hidden size={12} className="shrink-0" />
      {count === 1 ? t("common.pendingSyncOne") : t("common.pendingSync", { count })}
    </span>
  );
}
