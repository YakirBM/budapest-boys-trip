import clsx from "clsx";
import { t } from "@/lib/i18n";
import { statusColorVar, type ChipStatus } from "./types";

export interface StatusChipProps {
  status: ChipStatus;
  size?: "sm" | "md";
  className?: string;
}

/**
 * StatusChip — pill with colored dot + 12% tinted background of the status
 * color (doc 05 §7). Label from statusLabels (Hebrew per §4 tables).
 */
export function StatusChip({ status, size = "md", className }: StatusChipProps) {
  const color = statusColorVar(status);
  const label = t(`statusLabels.${status}`);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-bold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        "transition-opacity duration-150 active:opacity-80",
        className,
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
