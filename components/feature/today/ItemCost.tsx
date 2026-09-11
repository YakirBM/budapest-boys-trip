"use client";

import { t } from "@/lib/i18n";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { EstimateBadge } from "@/components/ui/EstimateBadge";
import type { CurrencyCode } from "@/components/ui/types";

export interface ItemCostProps {
  perPerson: number | null;
  group: number | null;
  currency: CurrencyCode;
  /** Price provenance from the linked place (rule 5 — never render as fact). */
  source: string | null;
  lastVerifiedAt: string | null;
  className?: string;
}

/**
 * ItemCost — per-item estimate with the EstimateBadge rule: verified prices show
 * source + last-verified inside the badge sheet; anything unverified renders the
 * "לא אומת" chip. Missing amounts render nothing (never invent prices).
 */
export function ItemCost({ perPerson, group, currency, source, lastVerifiedAt, className }: ItemCostProps) {
  const amount = perPerson ?? group;
  if (amount === null) return null;

  const verified = lastVerifiedAt !== null;

  return (
    <span className={className ?? "inline-flex flex-wrap items-center gap-1.5"}>
      <MoneyAmount amount={amount} currency={currency} size="sm" />
      {verified && source ? (
        <EstimateBadge source={source} lastVerifiedAt={lastVerifiedAt} />
      ) : (
        <span className="inline-flex items-center rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-bold text-warning">
          {t("common.unverified")}
        </span>
      )}
    </span>
  );
}
