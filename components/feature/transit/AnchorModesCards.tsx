"use client";

import Link from "next/link";
import { MapPin, Navigation, Moon, CloudRain, BedDouble, Plane } from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { googleMapsSearch, googleMapsDir } from "@/lib/utils/deeplinks";
import type { AnchorStation } from "@/lib/data/transit";

function roleLabel(role: AnchorStation["role"]): string {
  switch (role) {
    case "central":
      return t("transit.roleCentral");
    case "accommodation":
      return t("transit.roleAccommodation");
    case "airport_100e":
      return t("transit.roleAirport");
    case "night_meeting":
      return t("transit.roleNightMeeting");
  }
}

/** Offline anchor-station cards; TBD rows render the post-booking placeholder. */
export function AnchorsGrid({ anchors }: { anchors: AnchorStation[] }) {
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-text-primary">{t("transit.anchorsTitle")}</h2>
      <div className="grid grid-cols-1 gap-2">
        {anchors.map((anchor) => {
          const hasCoords = anchor.lat !== null && anchor.lng !== null;
          const href = anchor.placeUrl ?? (hasCoords ? googleMapsSearch(`${anchor.lat},${anchor.lng}`) : null);
          return (
            <div
              key={anchor.id}
              className={`flex flex-col gap-1 rounded-xl border p-3 ${
                anchor.isTbd ? "border-dashed border-border bg-surface-raised/50" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text-primary">{anchor.nameHe}</span>
                <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-bold text-text-muted">
                  {roleLabel(anchor.role)}
                </span>
              </div>
              {anchor.lines.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {anchor.lines.map((line) => (
                    <span
                      key={line}
                      dir="ltr"
                      className="ltr-iso rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-bold text-brand-strong"
                    >
                      {line}
                    </span>
                  ))}
                </div>
              )}
              {anchor.isTbd && (
                <p className="text-xs leading-5 text-text-muted">{t("transit.tbdAfterBooking")}</p>
              )}
              {!anchor.isTbd && anchor.notes && (
                <p className="text-xs leading-5 text-text-muted">{anchor.notes}</p>
              )}
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center gap-1.5 text-xs font-semibold text-brand"
                >
                  {hasCoords ? <Navigation aria-hidden size={14} /> : <MapPin aria-hidden size={14} />}
                  {t("common.navigate")}
                </a>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Night / rain / tired / airport mode cards — static guidance + deeplinks. */
export function ModesCards({ anchors }: { anchors: AnchorStation[] }) {
  const nightMeeting = anchors.find((a) => a.role === "night_meeting");
  const nightHref =
    nightMeeting && !nightMeeting.isTbd && nightMeeting.lat !== null && nightMeeting.lng !== null
      ? googleMapsDir(`${nightMeeting.lat},${nightMeeting.lng}`, "walking")
      : null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-text-primary">{t("transit.modesTitle")}</h2>
      <Card className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-text-secondary">
          <Moon aria-hidden size={16} />
          {t("transit.modeNight")}
        </h3>
        <p className="text-sm leading-6 text-text-secondary">{t("transit.modeNightText")}</p>
        {nightHref && (
          <a
            href={nightHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center gap-1.5 text-xs font-semibold text-brand"
          >
            <Navigation aria-hidden size={14} />
            {t("transit.roleNightMeeting")}
          </a>
        )}
      </Card>
      <Card className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-text-secondary">
          <CloudRain aria-hidden size={16} />
          {t("transit.modeRain")}
        </h3>
        <p className="text-sm leading-6 text-text-secondary">{t("transit.modeRainText")}</p>
      </Card>
      <Card className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-text-secondary">
          <BedDouble aria-hidden size={16} />
          {t("transit.modeTired")}
        </h3>
        <p className="text-sm leading-6 text-text-secondary">{t("transit.modeTiredText")}</p>
      </Card>
      <Card className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-text-secondary">
          <Plane aria-hidden size={16} />
          {t("transit.modeAirport")}
        </h3>
        <p className="text-sm leading-6 text-text-secondary">{t("transit.modeAirportText")}</p>
        <Link
          href="/flights"
          className="inline-flex min-h-12 items-center text-xs font-semibold text-brand underline-offset-4 hover:underline"
        >
          {t("transit.modeAirportLink")}
        </Link>
      </Card>
    </div>
  );
}

/** Static taxi safety rules (doc 04 §Taxi rules). */
export function TaxiRulesCard() {
  const rules: Parameters<typeof t>[0][] = [
    "transit.taxiAppOnly",
    "transit.taxiUpfront",
    "transit.taxiUnmarked",
    "transit.taxiSplit",
  ];
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-text-primary">{t("transit.taxiRulesTitle")}</h2>
      <ul className="flex flex-col gap-1.5">
        {rules.map((key) => (
          <li key={key} className="flex items-start gap-2 text-sm leading-6 text-text-secondary">
            <span aria-hidden className="mt-0.5 text-brand">
              •
            </span>
            {t(key)}
          </li>
        ))}
      </ul>
    </Card>
  );
}
