"use client";

import { useMemo, useState } from "react";
import { Umbrella } from "lucide-react";
import { t } from "@/lib/i18n";
import type { TripItem } from "@/lib/data/today";
import { Button } from "@/components/ui/Button";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";

export interface RainPlanControlProps {
  items: TripItem[];
  dayPlanId: string | null;
  activated: boolean;
  onActivate: (dayPlanId: string) => Promise<void>;
  onRevert: (dayPlanId: string) => Promise<void>;
}

const OUTDOOR: readonly string[] = ["attraction", "walk", "nightlife"];

/** Outdoor-with-backup items the plan would swap. */
export function countRainSwaps(items: TripItem[]): number {
  return items.filter(
    (item) => OUTDOOR.includes(item.category) && item.backupItemId !== null && item.status !== "skipped",
  ).length;
}

/**
 * RainPlanButton (doc 01 rule 9): per-day activate / revert with a ConfirmSheet
 * summarizing the swaps; no-op (banner) when no backups are attached.
 */
export function RainPlanControl({ items, dayPlanId, activated, onActivate, onRevert }: RainPlanControlProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const swaps = useMemo(() => countRainSwaps(items), [items]);

  if (!dayPlanId) return null;

  return (
    <div className="mb-4">
      {activated ? (
        <Button variant="secondary" block icon={<Umbrella aria-hidden size={18} />} onClick={() => void onRevert(dayPlanId)}>
          {t("route.rainRevert")}
        </Button>
      ) : (
        <Button
          variant="secondary"
          block
          icon={<Umbrella aria-hidden size={18} />}
          onClick={() => {
            if (swaps === 0) return;
            setConfirmOpen(true);
          }}
        >
          {t("route.rainActivate")}
        </Button>
      )}

      {swaps === 0 && !activated && (
        <p className="mt-1 text-xs text-text-muted">{t("route.rainEmpty")}</p>
      )}

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void onActivate(dayPlanId);
        }}
        title={t("route.rainConfirmTitle")}
        description={t("route.rainConfirmBody", { count: swaps })}
        danger={false}
      />
    </div>
  );
}
