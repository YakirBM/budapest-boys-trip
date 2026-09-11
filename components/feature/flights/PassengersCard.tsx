"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { t, type MessagePath } from "@/lib/i18n";
import { pushToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { markMyCheckin, type ActionError } from "@/lib/actions/flights";
import type { Flight, Passenger } from "@/lib/data/flights";

/** Map action-error codes to existing errors.* messages (no new copy needed). */
export function errorMessage(error: ActionError): string {
  const map: Record<ActionError, MessagePath> = {
    auth: "errors.auth",
    network: "errors.network",
    forbidden: "errors.forbidden",
    validation: "errors.saveFailed",
    generic: "errors.generic",
  };
  return t(map[error]);
}

function progressColor(ratio: number): string {
  if (ratio >= 1) return "var(--color-success)";
  if (ratio > 0) return "var(--color-warning)";
  return "var(--color-border)";
}

export interface PassengersCardProps {
  flights: Flight[];
  passengers: Passenger[];
  viewerId: string;
}

/**
 * Group check-in per flight (docs/06-features/02 §Passengers). The toggle writes
 * ONLY the viewer's own row (RLS enforced server-side) and is a trip-day online
 * action — disabled offline by scope decision.
 */
export function PassengersCard({ flights, passengers, viewerId }: PassengersCardProps) {
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(passengers.map((p) => [p.id, p.checkedIn])),
  );
  const [offline, setOffline] = useState(false);

  if (passengers.length === 0) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-text-primary">{t("flights.passengersTitle")}</h2>
        <EmptyState
          illustration="list"
          title={t("flights.passengersEmpty")}
          hint={t("flights.checkinWindowUnknown")}
        />
      </Card>
    );
  }

  const toggle = async (passenger: Passenger, flightId: string, next: boolean) => {
    if (offline) return;
    setLocalChecked((prev) => ({ ...prev, [passenger.id]: next })); // optimistic
    const result = await markMyCheckin(flightId, next);
    if (!result.ok) {
      setLocalChecked((prev) => ({ ...prev, [passenger.id]: !next }));
      if (result.error === "network") setOffline(true);
      pushToast({ message: errorMessage(result.error), type: "danger" });
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text-primary">{t("flights.passengersTitle")}</h2>
      <p className="text-xs text-text-muted">{t("flights.myCheckinHint")}</p>
      {flights.map((flight) => {
        const rows = passengers.filter((p) => p.flightId === flight.id);
        if (rows.length === 0) return null;
        const done = rows.filter((p) => localChecked[p.id]).length;
        const ratio = rows.length > 0 ? done / rows.length : 0;
        return (
          <div key={flight.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-text-primary" dir="ltr">
                {flight.flightNo}
              </span>
              <span className="text-xs font-medium text-text-secondary">
                {t("flights.checkinProgress", { done, total: rows.length })}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={rows.length}
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised"
            >
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: progressColor(ratio) }}
              />
            </div>
            {rows.map((passenger) => {
              const mine = passenger.memberId === viewerId;
              const isChecked = Boolean(localChecked[passenger.id]);
              return (
                <div
                  key={passenger.id}
                  className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className={isChecked ? "text-success" : "text-text-muted"}
                    >
                      <Check size={16} strokeWidth={isChecked ? 3 : 1.5} />
                    </span>
                    <span className="truncate text-sm text-text-primary">{passenger.fullName}</span>
                    {passenger.eticketSerialMasked && (
                      <span dir="ltr" className="ltr-iso tnum text-xs text-text-muted">
                        {passenger.eticketSerialMasked}
                      </span>
                    )}
                    {passenger.seat && (
                      <span dir="ltr" className="ltr-iso text-xs text-text-muted">
                        {t("flights.seatLabel")} {passenger.seat}
                      </span>
                    )}
                  </span>
                  {mine ? (
                    <Button
                      variant={isChecked ? "secondary" : "primary"}
                      disabled={offline}
                      onClick={() => void toggle(passenger, flight.id, !isChecked)}
                      className="shrink-0 px-3 text-xs"
                    >
                      {t("flights.myCheckin")}
                    </Button>
                  ) : (
                    <span aria-hidden className="shrink-0 text-text-muted">
                      {isChecked ? <Check size={16} className="text-success" /> : <Minus size={16} />}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <p className="text-xs leading-5 text-warning">{t("flights.checkinWindowUnknown")}</p>
      <p className="text-xs leading-5 text-text-muted">{t("flights.saturdayNote")}</p>
    </Card>
  );
}
