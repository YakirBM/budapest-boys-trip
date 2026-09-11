"use client";

import { useEffect, useState } from "react";
import { Phone, Plane } from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { telLink } from "@/lib/utils/deeplinks";
import type { FlightsData } from "@/lib/data/flights";
import { CountdownStrip } from "./CountdownStrip";
import { FlightCard } from "./FlightCard";
import { PassengersCard } from "./PassengersCard";
import { BaggageCard } from "./BaggageCard";
import { TransfersCard } from "./TransfersCard";
import { EticketCard } from "./EticketCard";
import { wallDateInTz, flightZones } from "./flightTime";

const ARKIA_SITE = "https://www.arkia.co.il";
const BOLT_URL = "https://bolt.eu";

/** Static support card — Arkia site + seeded support numbers (from e-ticket). */
function ArkiaCard({ airlinePhone, localPhone }: { airlinePhone: string; localPhone: string }) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-text-primary">{t("flights.arkiaTitle")}</h2>
      <a
        href={ARKIA_SITE}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-brand"
      >
        <Plane aria-hidden size={16} />
        {t("flights.arkiaSite")}
      </a>
      <a
        href={telLink(airlinePhone)}
        className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-text-primary"
      >
        <Phone aria-hidden size={16} className="text-success" />
        <span dir="ltr" className="ltr-iso tnum">
          {airlinePhone}
        </span>
      </a>
      <a
        href={telLink(localPhone)}
        className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-text-primary"
      >
        <Phone aria-hidden size={16} className="text-success" />
        <span dir="ltr" className="ltr-iso tnum">
          {localPhone}
        </span>
      </a>
      <p className="text-xs leading-5 text-text-muted">{t("flights.arkiaHours")}</p>
    </Card>
  );
}

export interface FlightsViewProps {
  data: FlightsData | null;
  tripId: string;
  airlinePhone: string;
  localPhone: string;
}

/**
 * Whole-screen client view: caches the snapshot for offline rendering and falls
 * back to it when the RSC payload is null (DB unreachable / offline load).
 */
export function FlightsView({ data, tripId, airlinePhone, localPhone }: FlightsViewProps) {
  const [fallback, setFallback] = useState<FlightsData | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (data) {
      void import("@/lib/offline/db").then(({ cacheSnapshot }) => cacheSnapshot("flights", data));
      if (!cancelled) {
        setFromCache(false);
        setSyncedAt(Date.now());
      }
    } else {
      void import("@/lib/offline/db").then(({ readSnapshot }) =>
        readSnapshot<FlightsData>("flights").then((snap) => {
          if (cancelled || !snap) return;
          setFallback(snap.data);
          setFromCache(true);
          setSyncedAt(snap.synced_at);
        }),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [data]);

  const effective = data ?? fallback;

  if (!effective || effective.flights.length === 0) {
    return (
      <div className="flex flex-col gap-3 py-8 text-center">
        <Plane aria-hidden size={48} className="mx-auto text-text-muted" />
        <p className="text-sm text-text-secondary">{t("common.empty")}</p>
      </div>
    );
  }

  const upcoming =
    effective.flights.find((f) => new Date(f.depTime).getTime() > Date.now()) ??
    effective.flights[effective.flights.length - 1];
  const returnFlight =
    effective.flights.find((f) => f.direction === "return") ?? effective.flights[0] ?? null;

  return (
    <div className="flex flex-col gap-4 pb-4">
      {fromCache && (
        <p className="text-xs text-text-muted" role="status">
          {t("common.offlineBanner")} ·{" "}
          {syncedAt !== null &&
            new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(
              new Date(syncedAt),
            )}
        </p>
      )}

      {upcoming && (
        <CountdownStrip
          flightNo={upcoming.flightNo}
          depTime={upcoming.depTime}
          depDateIso={wallDateInTz(new Date(upcoming.depTime), flightZones(upcoming.direction).dep)}
        />
      )}

      {effective.flights.map((flight) => (
        <FlightCard
          key={flight.id}
          flight={flight}
          tripId={tripId}
          viewerId={effective.viewerId}
          checkedAt={effective.arrivalCheckedAt[flight.id] ?? null}
        />
      ))}

      <PassengersCard
        flights={effective.flights}
        passengers={effective.passengers}
        viewerId={effective.viewerId}
      />

      <BaggageCard />

      <TransfersCard returnFlight={returnFlight} boltUrl={BOLT_URL} />

      <EticketCard doc={effective.eticketDoc} />

      <ArkiaCard airlinePhone={airlinePhone} localPhone={localPhone} />
    </div>
  );
}
