"use client";

import { t } from "@/lib/i18n";
import { estimatedWalkingMinutes, formatDistance, haversineMeters, type GeoPoint } from "@/lib/utils/geo";
import { Button } from "@/components/ui/Button";

export interface MeasureBarProps {
  from: GeoPoint | null;
  to: GeoPoint | null;
  fromLabel?: string | null;
  toLabel?: string | null;
  onClear: () => void;
}

/**
 * MeasureBar — distance + walk estimate, always labelled as an estimate
 * (docs/14 §3.3.2). Tapping two pins (or pin + me) fills from/to.
 */
export function MeasureBar({ from, to, fromLabel, toLabel, onClear }: MeasureBarProps) {
  if (!from || !to) {
    return <p className="text-xs text-text-muted">{t("map.measure.tapTwoPins")}</p>;
  }
  const distance = haversineMeters(from, to);
  const minutes = estimatedWalkingMinutes(distance);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-text-muted">
          {(fromLabel ?? "")} · {(toLabel ?? "")}
        </p>
        <p className="flex items-center gap-1.5 text-sm font-bold text-text-primary">
          <span dir="ltr" className="ltr-iso tnum">
            {formatDistance(distance)}
          </span>
          <span>·</span>
          <span>{t("map.measure.walkEstimate", { minutes })}</span>
          <span className="rounded-full bg-warning/12 px-1.5 py-0.5 text-[10px] font-bold text-warning">
            {t("map.measure.estimateLabel")}
          </span>
        </p>
      </div>
      <Button variant="secondary" onClick={onClear}>
        {t("map.measure.clear")}
      </Button>
    </div>
  );
}
