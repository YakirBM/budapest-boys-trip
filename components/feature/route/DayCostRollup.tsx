"use client";

import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import type { DayCost } from "@/lib/data/route";

export interface DayCostRollupProps {
  cost: DayCost;
  activeMemberCount: number;
}

/**
 * DayCostRollup (doc 01 component table): day estimates + recorded expenses in
 * HUF, per-person ÷ active members. Every figure is an estimate — the verify
 * badge rule is enforced by the item-level badges; the rollup repeats the
 * "not all verified" warning when relevant. Non-HUF estimates are listed
 * separately, never converted with invented rates.
 */
export function DayCostRollup({ cost, activeMemberCount }: DayCostRollupProps) {
  const totalHuf = cost.estimateHuf + cost.actualHuf;
  const hasAny = totalHuf > 0 || cost.extras.length > 0;

  return (
    <Card className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-muted">{t("route.costTitle")}</p>
        {hasAny ? (
          <MoneyAmount amount={totalHuf} currency="HUF" size="lg" />
        ) : (
          <p className="text-sm text-text-muted">{t("route.library.noPrice")}</p>
        )}
      </div>
      {hasAny && (
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-muted">{t("route.costPerPerson")}</p>
          <MoneyAmount amount={Math.round(totalHuf / activeMemberCount)} currency="HUF" size="md" />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-0.5 text-xs text-text-muted">
        <span>
          {t("route.costEstimates")}:{" "}
          <span dir="ltr" className="tnum">
            {cost.estimateHuf.toLocaleString("he-IL")}
          </span>
        </span>
        <span>
          {t("route.costActuals")}:{" "}
          <span dir="ltr" className="tnum">
            {cost.actualHuf.toLocaleString("he-IL")}
          </span>
        </span>
        {cost.extras.map((extra) => (
          <MoneyAmount key={extra.currency} amount={extra.amount} currency={extra.currency} size="sm" />
        ))}
        {cost.hasUnverified && (
          <span className="font-semibold text-warning">{t("route.costUnverified")}</span>
        )}
      </div>
    </Card>
  );
}
