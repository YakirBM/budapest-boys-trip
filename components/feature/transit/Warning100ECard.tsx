"use client";

import { AlertTriangle } from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { EstimateBadge } from "@/components/ui/EstimateBadge";
import { formatMoney } from "@/components/ui/MoneyAmount";
import type { CurrencyCode } from "@/components/ui/types";
import type { TransitTicket } from "@/lib/data/transit";

export interface Warning100ECardProps {
  ticket: TransitTicket | null;
}

/**
 * Permanent prominent warning (doc 04 §Airport100ECard): regular tickets are
 * INVALID on the 100E. Price ~2,500 HUF stays an estimate until verified.
 */
export function Warning100ECard({ ticket }: Warning100ECardProps) {
  const price = ticket?.priceHuf ?? 2500;
  return (
    <Card className="border-warning/40 bg-warning/10">
      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-warning">
          <AlertTriangle aria-hidden size={18} className="shrink-0" />
          {t("transit.warning100eTitle")}
        </h2>
        <p className="text-sm leading-6 text-text-primary">{t("transit.warning100eBody")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span dir="ltr" className="ltr-iso tnum text-lg font-bold text-text-primary">
            {formatMoney(price, "HUF" as CurrencyCode)}
          </span>
          <EstimateBadge
            source={ticket?.source ?? "bkk.hu"}
            lastVerifiedAt={ticket?.lastVerifiedAt ?? ""}
          />
          <span className="rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-bold text-warning">
            {t("transit.unverifiedBadge")}
          </span>
        </div>
        <p className="text-xs leading-5 text-text-secondary">{t("transit.warning100eBuy")}</p>
      </div>
    </Card>
  );
}
