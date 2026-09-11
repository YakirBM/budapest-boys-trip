"use client";

import { useState } from "react";
import { Bus, Crosshair, Footprints, MapPin, Search, TramFront } from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { TimeBlock } from "@/components/ui/TimeBlock";
import { googleMapsDir, appleMapsDir } from "@/lib/utils/deeplinks";
import { TZ_BUDAPEST } from "@/lib/utils/time";
import type { NextItineraryItem } from "@/lib/data/transit";

const DEAK_QUERY = "Deák Ferenc tér, Budapest";
const BUDAPESTGO_URL = "https://bkk.hu/budapestgo";

type OriginChoice = "me" | "deak";

/**
 * Simplified NextDestination card (scope decision): origin = my one-shot
 * location (display only, never stored) or Deák; destination = next itinerary
 * item today or Deák. Mode chips are DEEP LINKS ONLY — the app never invents
 * travel times; those are computed by the maps app.
 */
export function NextDestinationCard({ nextItem }: { nextItem: NextItineraryItem | null }) {
  const [origin, setOrigin] = useState<OriginChoice>("deak");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const destinationLabel = nextItem
    ? nextItem.address ?? nextItem.placeName ?? nextItem.title
    : DEAK_QUERY;

  const originParam = origin === "me" && coords ? `${coords.lat},${coords.lng}` : DEAK_QUERY;

  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setOrigin("deak");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Display/deep-link only — deliberately NOT persisted anywhere.
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setOrigin("me");
        setLocating(false);
      },
      () => {
        setOrigin("deak");
        setLocating(false);
      },
      { maximumAge: 0, timeout: 8000 },
    );
  };

  const modeChips = [
    {
      key: "walk",
      label: t("transit.modeWalk"),
      icon: <Footprints aria-hidden size={18} />,
      href: googleMapsDir(destinationLabel, "walking", origin === "me" && coords ? originParam : undefined),
    },
    {
      key: "transit",
      label: t("transit.modeTransit"),
      icon: <TramFront aria-hidden size={18} />,
      href: googleMapsDir(destinationLabel, "transit", origin === "me" && coords ? originParam : undefined),
    },
    {
      key: "taxi",
      label: t("transit.modeTaxi"),
      icon: <Bus aria-hidden size={18} />,
      href: googleMapsDir(destinationLabel, "driving", origin === "me" && coords ? originParam : undefined),
    },
  ] as const;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-text-primary">{t("transit.nextTitle")}</h2>

      {/* Destination */}
      <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
        <span className="text-xs text-text-muted">{t("transit.destinationLabel")}</span>
        {nextItem ? (
          <>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
              <MapPin aria-hidden size={14} className="shrink-0 text-brand" />
              {nextItem.title}
            </span>
            <span className="flex items-center gap-2 text-xs text-text-muted">
              {t("transit.nextItemToday")}
              <TimeBlock dateTime={nextItem.startTime} timeZone={TZ_BUDAPEST} />
            </span>
          </>
        ) : (
          <span className="text-sm text-text-secondary">{DEAK_QUERY}</span>
        )}
        {!nextItem && <p className="text-xs text-text-muted">{t("transit.noItemToday")}</p>}
      </div>

      {/* Origin */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-text-muted">{t("transit.originLabel")}</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (coords) {
                setOrigin("me");
              } else {
                locate();
              }
            }}
            className={`flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold ${
              origin === "me"
                ? "border-brand bg-brand-soft/50 text-brand-strong"
                : "border-border bg-surface text-text-secondary"
            }`}
          >
            <Crosshair aria-hidden size={16} />
            {locating ? t("transit.locating") : t("transit.originMe")}
          </button>
          <button
            type="button"
            onClick={() => setOrigin("deak")}
            className={`flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold ${
              origin === "deak"
                ? "border-brand bg-brand-soft/50 text-brand-strong"
                : "border-border bg-surface text-text-secondary"
            }`}
          >
            <Search aria-hidden size={16} />
            {t("transit.originDeak")}
          </button>
        </div>
        {coords && (
          <p className="text-[11px] text-text-muted" dir="ltr">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} · {t("transit.coordsDisplayOnly")}
          </p>
        )}
      </div>

      {/* Mode chips — deeplinks only */}
      <div className="grid grid-cols-3 gap-1.5">
        {modeChips.map((chip) => (
          <a
            key={chip.key}
            href={chip.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-brand px-1 py-2 text-[11px] font-semibold text-brand-contrast"
          >
            <span aria-hidden className="inline-flex">
              {chip.icon}
            </span>
            {chip.label}
          </a>
        ))}
      </div>

      <p className="text-xs leading-5 text-text-muted">{t("transit.deeplinkOnly")}</p>

      <div className="flex flex-wrap gap-1.5">
        <a
          href={BUDAPESTGO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-brand"
        >
          <TramFront aria-hidden size={14} />
          {t("transit.budapestGo")}
        </a>
        <a
          href={appleMapsDir(destinationLabel)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center rounded-xl border border-border px-3 text-xs font-semibold text-brand"
        >
          Apple Maps
        </a>
      </div>
      <p className="text-xs leading-5 text-text-muted">{t("transit.budapestGoHint")}</p>
    </Card>
  );
}
