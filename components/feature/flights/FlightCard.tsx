"use client";

import { useState } from "react";
import clsx from "clsx";
import { CalendarPlus, Check, Copy, ExternalLink, Plane } from "lucide-react";
import { t } from "@/lib/i18n";
import { pushToast } from "@/components/ui/Toast";
import { TimeBlock } from "@/components/ui/TimeBlock";
import { EstimateBadge } from "@/components/ui/EstimateBadge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { enqueue } from "@/lib/offline/db";
import { recordArrivalChecked } from "@/lib/actions/flights";
import { formatInTz, weekdayHebrew, formatDateHebrew } from "@/lib/utils/time";
import { TZ_BUDAPEST, TZ_JERUSALEM } from "@/lib/utils/time";
import { downloadFlightIcs, flightZones, wallDateInTz } from "./flightTime";
import type { Flight } from "@/lib/data/flights";

const ARKIA_SITE = "https://www.arkia.co.il";

function statusColor(status: Flight["status"]): string {
  switch (status) {
    case "boarding":
      return "var(--color-warning)";
    case "departed":
      return "var(--color-brand)";
    case "landed":
      return "var(--color-success)";
    case "cancelled":
      return "var(--color-danger)";
    default:
      return "var(--color-info)";
  }
}

function statusLabel(status: Flight["status"]): string {
  switch (status) {
    case "boarding":
      return t("flights.statusBoarding");
    case "departed":
      return t("flights.statusDeparted");
    case "landed":
      return t("flights.statusLanded");
    case "cancelled":
      return t("flights.statusCancelled");
    default:
      return t("flights.statusScheduled");
  }
}

function tzBadgeLabel(zone: string): string {
  return zone === TZ_BUDAPEST ? t("today.tzHungary") : t("today.tzIsrael");
}

/** tz chip + time rendered inline (for the unverified estimate — wall time only). */
function EstimateTime({ wall, zone }: { wall: string; zone: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span dir="ltr" className="ltr-iso tnum rounded-md px-0.5 text-sm">
        {t("flights.arrivalEstimate", { time: wall })}
      </span>
      <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[11px] font-medium leading-4 text-text-muted">
        {tzBadgeLabel(zone)}
      </span>
    </span>
  );
}

export interface FlightCardProps {
  flight: Flight;
  tripId: string;
  viewerId: string;
  checkedAt: string | null;
}

export function FlightCard({ flight, tripId, viewerId, checkedAt }: FlightCardProps) {
  const [checkedAtLocal, setCheckedAtLocal] = useState<string | null>(checkedAt);
  const [pending, setPending] = useState(false);
  const checked = checkedAtLocal !== null;
  const zones = flightZones(flight.direction);
  const directionLabel = flight.direction === "outbound" ? t("flights.outbound") : t("flights.inbound");
  const depDateIso = wallDateInTz(new Date(flight.depTime), zones.dep);

  const onVerify = async () => {
    if (checked || pending) return;
    setPending(true);
    setCheckedAtLocal(new Date().toISOString()); // optimistic
    try {
      if (typeof navigator !== "undefined" && navigator.onLine) {
        const result = await recordArrivalChecked(flight.id);
        if (!result.ok) {
          setCheckedAtLocal(null);
          pushToast({ message: t("errors.generic"), type: "danger" });
        }
      } else {
        await enqueue("app_events", "insert", {
          trip_id: tripId,
          actor_id: viewerId,
          action: "verify.arrival",
          entity: "flights",
          entity_id: flight.id,
          meta: { channel: "outbox" },
        });
        pushToast({ message: t("common.pendingSyncOne"), type: "info" });
      }
    } finally {
      setPending(false);
    }
  };

  const copyRef = async () => {
    if (!flight.bookingRefMasked) return;
    try {
      await navigator.clipboard.writeText(flight.bookingRefMasked);
      pushToast({ message: t("common.copied"), type: "success" });
    } catch {
      pushToast({ message: t("errors.generic"), type: "danger" });
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Plane aria-hidden size={18} className="text-cat-flight" />
          <span dir="auto">
            {directionLabel} · {flight.flightNo}
          </span>
        </h2>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-bold"
          style={{
            color: statusColor(flight.status),
            backgroundColor: `color-mix(in srgb, ${statusColor(flight.status)} 12%, transparent)`,
          }}
        >
          {statusLabel(flight.status)}
        </span>
      </div>

      <p className="text-base text-text-secondary" dir="ltr">
        {flight.depAirport}
        {flight.depTerminal ? ` ${t("flights.terminal")} ${flight.depTerminal}` : ""} → {flight.arrAirport}
      </p>
      <p className="text-sm text-text-muted">
        {weekdayHebrew(depDateIso)} {formatDateHebrew(depDateIso)}
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-text-muted">{t("flights.departs")}</span>
          <TimeBlock dateTime={flight.depTime} timeZone={zones.dep as "Europe/Budapest" | "Asia/Jerusalem"} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-text-muted">{t("flights.arrives")}</span>
          {flight.arrTime ? (
            <span className="inline-flex items-center gap-1.5">
              <TimeBlock
                dateTime={flight.arrTime}
                timeZone={zones.arr as "Europe/Budapest" | "Asia/Jerusalem"}
              />
              {!flight.arrTimeVerified && (
                <EstimateBadge source={t("flights.sourceLabel")} lastVerifiedAt={flight.lastVerifiedAt ?? ""} />
              )}
            </span>
          ) : flight.estArrivalWall ? (
            <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
              <EstimateTime wall={flight.estArrivalWall} zone={zones.arr} />
              <span className="text-xs text-warning">{t("flights.arrivalNotUpdated")}</span>
              <EstimateBadge source={t("flights.sourceLabel")} lastVerifiedAt={flight.lastVerifiedAt ?? ""} />
            </span>
          ) : null}
        </div>
      </div>

      <p className="text-xs leading-5 text-text-muted">{t("flights.arrivalEstimateNote")}</p>

      {/* Human-verification checkbox — records an app_event, never invents a time. */}
      <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={() => void onVerify()}
          className="h-5 w-5 accent-[var(--color-brand)]"
        />
        <span className="text-sm text-text-secondary">
          {checked && checkedAtLocal
            ? t("flights.verifyCheckedAt", { date: formatInTz(new Date(checkedAtLocal), TZ_JERUSALEM, { dateStyle: "short" }) })
            : t("flights.verifyCheckbox")}
        </span>
        {checked && <Check aria-hidden size={16} className="text-success" />}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {flight.bookingRefMasked && (
          <Button variant="secondary" icon={<Copy aria-hidden size={16} />} onClick={() => void copyRef()}>
            {t("flights.reservation")} {flight.bookingRefMasked}
          </Button>
        )}
        <Button variant="secondary" icon={<CalendarPlus aria-hidden size={16} />} onClick={() => downloadFlightIcs(flight)}>
          {t("flights.icsButton")}
        </Button>
        <a
          href={ARKIA_SITE}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-brand underline-offset-4 hover:underline"
        >
          <ExternalLink aria-hidden size={16} />
          <span dir="auto">arkia.co.il</span>
        </a>
      </div>

      <p className={clsx("text-xs leading-5 text-text-muted")}>{t("flights.verifyHint")}</p>
    </Card>
  );
}
