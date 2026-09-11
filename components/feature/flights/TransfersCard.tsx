"use client";

import { Car, ExternalLink, TrainFront, TriangleAlert } from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { TimeBlock } from "@/components/ui/TimeBlock";
import { EstimateBadge } from "@/components/ui/EstimateBadge";
import { useCountdown } from "@/components/ui/CountdownCard";
import { TZ_BUDAPEST, formatInTz, todayInTz, weekdayHebrew, zonedWallTimeToUtc } from "@/lib/utils/time";
import { wallDateInTz } from "./flightTime";
import type { Flight } from "@/lib/data/flights";

const WAZE_TLV_T3 = "https://waze.com/ul?ll=32.0004,34.8707&navigate=yes";

function MilestoneRow({
  label,
  at,
  estimate,
  isToday,
  source,
}: {
  label: string;
  at: Date;
  estimate: boolean;
  isToday: boolean;
  source?: string;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="flex items-center gap-1.5">
        {isToday && <LiveCountdown target={at} />}
        <TimeBlock dateTime={at} timeZone={TZ_BUDAPEST} />
        {estimate && <EstimateBadge source={source ?? "bkk.hu"} lastVerifiedAt="" />}
      </span>
    </div>
  );
}

/** Compact hh:mm:ss countdown, rendered only on the day itself (doc 02). */
function LiveCountdown({ target }: { target: Date }) {
  const countdown = useCountdown(target, 1000);
  if (countdown === null || countdown.totalMs <= 0) return null;
  const hours = countdown.days * 24 + countdown.hours;
  return (
    <span dir="ltr" className="ltr-iso tnum rounded-md bg-brand/10 px-1.5 py-0.5 text-xs font-bold text-brand-strong">
      {String(hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:
      {String(countdown.seconds).padStart(2, "0")}
    </span>
  );
}

function LinkRow({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-brand"
    >
      <span aria-hidden className="inline-flex">
        {icon}
      </span>
      <span className="text-start">{label}</span>
      <ExternalLink aria-hidden size={14} className="shrink-0" />
    </a>
  );
}

export interface TransfersCardProps {
  returnFlight: Flight | null;
  boltUrl: string;
}

/**
 * Transfer plans (doc 02 §Transfer plans): Day-1 legs (primary + backup) and the
 * Day-5 chain 06:10 → ~06:30 → 07:25 with live countdowns on the day itself.
 */
export function TransfersCard({ returnFlight, boltUrl }: TransfersCardProps) {
  const depDateIso = returnFlight
    ? wallDateInTz(new Date(returnFlight.depTime), TZ_BUDAPEST)
    : "2026-10-08";
  const isDay5 = todayInTz(TZ_BUDAPEST) === depDateIso;

  const leaveAt = zonedWallTimeToUtc(depDateIso, "06:10", TZ_BUDAPEST);
  const busAt = zonedWallTimeToUtc(depDateIso, "06:30", TZ_BUDAPEST);
  const gateBy = zonedWallTimeToUtc(depDateIso, "07:25", TZ_BUDAPEST);

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text-primary">{t("flights.transfersTitle")}</h2>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-text-secondary">{t("flights.day1Title")}</h3>
        <div className="flex items-start gap-2 rounded-xl border border-border px-3 py-2">
          <TrainFront aria-hidden size={16} className="mt-1 shrink-0 text-cat-transit" />
          <span className="text-sm leading-6 text-text-secondary">{t("flights.day1OutboundPrimary")}</span>
        </div>
        <LinkRow href={WAZE_TLV_T3} label={t("common.navigate")} icon={<Car aria-hidden size={16} />} />
        <div className="flex items-start gap-2 rounded-xl border border-border px-3 py-2">
          <TriangleAlert aria-hidden size={16} className="mt-1 shrink-0 text-warning" />
          <span className="text-sm leading-6 text-text-secondary">{t("flights.day1OutboundBackup")}</span>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-border px-3 py-2">
          <span aria-hidden className="mt-1 shrink-0 font-bold text-cat-transit">
            100E
          </span>
          <span className="text-sm leading-6 text-text-secondary">{t("flights.day1ArrivalPrimary")}</span>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-border px-3 py-2">
          <TriangleAlert aria-hidden size={16} className="mt-1 shrink-0 text-warning" />
          <span className="text-sm leading-6 text-text-secondary">{t("flights.day1ArrivalBackup")}</span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-text-secondary">
          {t("flights.day5Title")} · {weekdayHebrew(depDateIso)}
        </h3>
        <MilestoneRow label={t("flights.leaveApartment")} at={leaveAt} estimate={false} isToday={isDay5} />
        <MilestoneRow
          label={t("flights.bus100eDeak")}
          at={busAt}
          estimate
          isToday={isDay5}
          source="bkk.hu"
        />
        <MilestoneRow
          label={t("flights.airportBy")}
          at={gateBy}
          estimate={false}
          isToday={isDay5}
        />
        {returnFlight && (
          <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-brand/40 bg-brand-soft/30 px-3 py-2">
            <span className="text-sm font-semibold text-brand-strong" dir="ltr">
              {returnFlight.flightNo}
            </span>
            <TimeBlock dateTime={returnFlight.depTime} timeZone={TZ_BUDAPEST} />
          </div>
        )}
        <p className="text-xs text-text-muted">
          {t("flights.missed100e")} {t("flights.backupTaxiDirect")} (
          {formatInTz(busAt, TZ_BUDAPEST)})
        </p>
        <LinkRow href={boltUrl} label={t("flights.backupTaxiDirect")} icon={<Car aria-hidden size={16} />} />
      </section>
    </Card>
  );
}
