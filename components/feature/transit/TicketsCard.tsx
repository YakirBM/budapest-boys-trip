"use client";

import { useState } from "react";
import { Minus, Plus, Sigma } from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EstimateBadge } from "@/components/ui/EstimateBadge";
import { formatMoney } from "@/components/ui/MoneyAmount";
import type { CurrencyCode } from "@/components/ui/types";
import type { TicketCode, TransitTicket } from "@/lib/data/transit";

const TRIP_DAYS = 4; // effective transit days (doc 04)

/** Pure client math. No "best value" label anywhere — numbers only (doc 04). */
function costForTrip(code: TicketCode, price: number | null, ridesPerDay: number): number | null {
  if (price === null) return null;
  const rides = ridesPerDay * TRIP_DAYS;
  switch (code) {
    case "single":
      return rides * price;
    case "block10":
      return Math.ceil(rides / 10) * price;
    case "24h":
      return TRIP_DAYS * price;
    case "72h":
      return Math.ceil(TRIP_DAYS / 3) * price;
    case "group_24h":
      return TRIP_DAYS * price; // per person (price ÷ 4 in the formula note)
    case "100e":
      return null; // always separate — outside the calculator
  }
}

const FORMULA_KEY: Record<TicketCode, Parameters<typeof t>[0]> = {
  single: "transit.formulaSingle",
  block10: "transit.formulaBlock10",
  "24h": "transit.formula24h",
  "72h": "transit.formula72h",
  group_24h: "transit.formulaGroup",
  "100e": "transit.formula100e",
};

export interface TicketsCardProps {
  tickets: TransitTicket[];
}

/** Ticket table + rides/day calculator; every price NULL → "—" + verify badge. */
export function TicketsCard({ tickets }: TicketsCardProps) {
  const [ridesPerDay, setRidesPerDay] = useState(4);
  const [formulaFor, setFormulaFor] = useState<TicketCode | null>(null);

  const change = (delta: number) => {
    setRidesPerDay((prev) => Math.min(12, Math.max(0, prev + delta)));
  };

  const formulaTicket = tickets.find((ticket) => ticket.code === formulaFor) ?? null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-text-primary">{t("transit.ticketsTitle")}</h2>
        <span className="text-[11px] font-medium text-text-muted" dir="ltr">
          {t("transit.ticketsSource")}
        </span>
      </div>

      {/* Rides/day stepper */}
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border px-3">
        <span className="text-sm text-text-secondary">{t("transit.ridesPerDay")}</span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t("transit.decreaseRides")}
            onClick={() => change(-1)}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border text-text-primary"
          >
            <Minus aria-hidden size={16} />
          </button>
          <span className="tnum w-8 text-center text-lg font-bold text-text-primary" dir="ltr">
            {ridesPerDay}
          </span>
          <button
            type="button"
            aria-label={t("transit.increaseRides")}
            onClick={() => change(1)}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border text-text-primary"
          >
            <Plus aria-hidden size={16} />
          </button>
        </span>
      </div>

      {/* Table */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 px-3 text-[11px] font-bold text-text-muted">
          <span className="flex-1" />
          <span className="w-24 text-end">{t("transit.costForTrip")}</span>
        </div>
        {tickets.map((ticket) => {
          const cost = costForTrip(ticket.code, ticket.priceHuf, ridesPerDay);
          return (
            <div
              key={ticket.id}
              className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border px-3 py-1.5"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-text-primary">{ticket.nameHe}</span>
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFormulaFor(ticket.code)}
                    className="inline-flex min-h-6 items-center gap-1 rounded-full bg-surface-raised px-2 text-[11px] font-medium text-text-muted"
                  >
                    <Sigma aria-hidden size={11} />
                    {t("transit.showFormula")}
                  </button>
                  {!ticket.verified && (
                    <span className="rounded-full bg-warning/12 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                      {t("transit.unverifiedBadge")}
                    </span>
                  )}
                </span>
              </span>
              <span className="flex w-24 shrink-0 items-center justify-end gap-1">
                {ticket.code === "100e" ? (
                  <span className="text-[11px] text-text-muted">{t("transit.formula100e")}</span>
                ) : ticket.priceHuf === null ? (
                  <span className="tnum text-lg text-text-muted" dir="ltr">
                    {t("transit.pricePending")}
                  </span>
                ) : (
                  <span dir="ltr" className="ltr-iso tnum text-sm font-bold text-text-primary">
                    {cost !== null ? formatMoney(cost, "HUF" as CurrencyCode) : t("transit.pricePending")}
                  </span>
                )}
                {ticket.priceHuf !== null && (
                  <EstimateBadge source={ticket.source} lastVerifiedAt={ticket.lastVerifiedAt ?? ""} />
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs leading-5 text-text-muted">{t("transit.pricePendingNote")}</p>
      <p className="text-xs leading-5 text-text-muted">{t("transit.tripDaysNote")}</p>

      <BottomSheet
        open={formulaFor !== null}
        onClose={() => setFormulaFor(null)}
        title={t("transit.formulaTitle")}
      >
        <p className="pb-4 text-sm leading-7 text-text-secondary">
          {formulaTicket ? t(FORMULA_KEY[formulaTicket.code]) : ""}
        </p>
      </BottomSheet>
    </Card>
  );
}
