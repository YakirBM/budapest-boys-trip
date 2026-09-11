"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Navigation, Star, TrainFront } from "lucide-react";
import { t } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchMapData, TRIP_ID, type MapData, type MapPlace } from "@/lib/data/route";
import { googleMapsDir, googleMapsSearch } from "@/lib/utils/deeplinks";
import { useOfflineSnapshot, fetchWithOfflineFallback } from "@/components/feature/today/useOfflineSnapshot";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { MoneyAmount } from "@/components/ui/MoneyAmount";

export interface MapViewProps {
  initialData: MapData;
}

/** Budapest framing bbox (scope decision; doc 01 rule 10 layers). */
const BBOX = { latMin: 47.42, latMax: 47.56, lngMin: 18.93, lngMax: 19.14 };

type MarkerKind = "idea" | "approved" | "scheduled";

const MARKER_COLORS: Record<MarkerKind, string> = {
  idea: "var(--color-warning)",
  approved: "var(--color-success)",
  scheduled: "var(--color-info)",
};

function normalize(lat: number, lng: number): { x: number; y: number; clamped: boolean } {
  const rawX = ((lng - BBOX.lngMin) / (BBOX.lngMax - BBOX.lngMin)) * 100;
  const rawY = ((BBOX.latMax - lat) / (BBOX.latMax - BBOX.latMin)) * 100;
  const clamp = (v: number) => Math.min(94, Math.max(6, v));
  return {
    x: clamp(rawX),
    y: clamp(rawY),
    clamped: rawX < 0 || rawX > 100 || rawY < 0 || rawY > 100,
  };
}

function placeKind(place: MapPlace): MarkerKind {
  if (place.status === "scheduled" || place.status === "visited") return "scheduled";
  if (place.status === "approved") return "approved";
  return "idea";
}

/**
 * MapView — NO map SDK (hard decision): a schematic tinted frame with
 * status-colored positioned markers + the anchor layer. Tap a marker → place
 * sheet with a navigate deep link. Places without coordinates land in the
 * "רשימה בלי מיקום" tray so they are never lost. Geographic x/y is NOT
 * mirrored under RTL (a map, like a clock, keeps its orientation) — inline
 * `left/top` are used deliberately for geographic correctness.
 */
export function MapView({ initialData }: MapViewProps) {
  const query = useQuery({
    queryKey: ["places", TRIP_ID],
    queryFn: () => fetchWithOfflineFallback("snapshot:map", () => fetchMapData(getSupabaseBrowserClient())),
    initialData,
    staleTime: 60_000,
  });
  const data = query.data ?? initialData;
  const { isOffline, syncedAt } = useOfflineSnapshot("map", data);

  const [showPlacesLayer, setShowPlacesLayer] = useState(true);
  const [showAnchorsLayer, setShowAnchorsLayer] = useState(true);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  const placedMarkers = useMemo(
    () =>
      data.places
        .filter((place) => place.lat !== null && place.lng !== null)
        .filter((place) => place.status !== "rejected")
        .map((place) => ({
          place,
          ...normalize(place.lat as number, place.lng as number),
        })),
    [data.places],
  );
  const noLocationPlaces = data.places.filter(
    (place) => (place.lat === null || place.lng === null) && place.status !== "rejected",
  );
  const anchorMarkers = useMemo(
    () =>
      data.anchors
        .filter((anchor) => anchor.lat !== null && anchor.lng !== null)
        .map((anchor) => ({ anchor, ...normalize(anchor.lat as number, anchor.lng as number) })),
    [data.anchors],
  );
  const anchorsWithoutCoords = data.anchors.filter((a) => a.lat === null || a.lng === null);

  const selectedPlace = data.places.find((place) => place.id === selectedPlaceId) ?? null;

  const layerButtonClass = (active: boolean) =>
    clsx(
      "inline-flex h-12 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold",
      active ? "border-transparent bg-brand text-brand-contrast" : "border-border bg-surface text-text-secondary",
    );

  return (
    <div className="flex flex-col gap-3">
      {/* Layer toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowPlacesLayer((prev) => !prev)}
          aria-pressed={showPlacesLayer}
          className={layerButtonClass(showPlacesLayer)}
        >
          {t("map.layerPlaces")}
        </button>
        <button
          type="button"
          onClick={() => setShowAnchorsLayer((prev) => !prev)}
          aria-pressed={showAnchorsLayer}
          className={layerButtonClass(showAnchorsLayer)}
        >
          <TrainFront aria-hidden size={16} />
          {t("map.layerAnchors")}
        </button>
      </div>

      {/* Legend */}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary">
        <li className="flex items-center gap-1">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: MARKER_COLORS.idea }} />
          {t("map.legendIdea")}
        </li>
        <li className="flex items-center gap-1">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: MARKER_COLORS.approved }} />
          {t("map.legendApproved")}
        </li>
        <li className="flex items-center gap-1">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: MARKER_COLORS.scheduled }} />
          {t("map.legendScheduled")}
        </li>
        <li className="flex items-center gap-1">
          <Star aria-hidden size={12} className="text-brand" />
          {t("map.legendAnchor")}
        </li>
      </ul>

      {/* Schematic frame — plain tinted background, never blank (doc 01 offline) */}
      <div
        role="img"
        aria-label={t("map.schematicNote")}
        className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border"
        style={{
          background: "linear-gradient(180deg, var(--color-brand-soft) 0%, var(--color-surface-raised) 100%)",
        }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-x-5 bottom-5 top-5 rounded-[42%] border border-border/70" />
        {showPlacesLayer &&
          placedMarkers.map(({ place, x, y, clamped }) => {
            const kind = placeKind(place);
            return (
              <button
                key={place.id}
                type="button"
                onClick={() => setSelectedPlaceId(place.id)}
                aria-label={clamped ? `${place.name} — ${t("map.outOfFrame")}` : place.name}
                title={clamped ? t("map.outOfFrame") : place.name}
                className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <span
                  className={clsx(
                    "tnum flex items-center justify-center rounded-full border-2 border-surface text-[10px] font-bold text-white shadow",
                    kind === "scheduled" ? "h-7 w-7" : "h-6 w-6",
                  )}
                  style={{ backgroundColor: MARKER_COLORS[kind] }}
                >
                  {kind === "scheduled" && place.scheduledDay !== null ? place.scheduledDay : ""}
                </span>
              </button>
            );
          })}
        {showAnchorsLayer &&
          anchorMarkers.map(({ anchor, x, y }) => (
            <span
              key={anchor.id}
              aria-hidden
              className="pointer-events-none absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <Star size={22} className="fill-brand text-brand" />
            </span>
          ))}
      </div>
      <p className="text-xs text-text-muted">{t("map.schematicNote")}</p>

      {isOffline && syncedAt !== null && (
        <p className="text-xs text-text-muted">
          {t("common.updatedAt", {
            time: new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" }).format(syncedAt),
          })}
        </p>
      )}

      {/* Anchors without coordinates — listed, never lost */}
      {anchorsWithoutCoords.length > 0 && (
        <div className="rounded-xl bg-surface p-3">
          <p className="text-xs font-bold text-text-muted">{t("map.legendAnchor")}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {anchorsWithoutCoords.map((anchor) => (
              <li key={anchor.id} className="flex items-center gap-2 text-sm text-text-secondary">
                <Star aria-hidden size={14} className="shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate">{anchor.nameHe}</span>
                <span className="shrink-0 text-xs text-text-muted">{t("map.anchorTbd")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No-location tray (doc 01 edge case) */}
      {noLocationPlaces.length > 0 && (
        <div className="rounded-xl bg-surface p-3">
          <p className="text-xs font-bold text-text-muted">{t("map.noLocationTitle")}</p>
          <p className="text-xs text-text-muted">{t("map.noLocationHint")}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {noLocationPlaces.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => setSelectedPlaceId(place.id)}
                  className="inline-flex min-h-12 w-full items-center gap-2 rounded-lg px-1 text-start text-sm text-text-primary active:opacity-80"
                >
                  <CategoryIcon category={place.category} size={24} />
                  <span className="min-w-0 flex-1 truncate">{place.name}</span>
                  {place.scheduledDay !== null && (
                    <span className="shrink-0 text-xs text-text-muted">
                      {t("map.dayBadge", { day: place.scheduledDay })}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {placedMarkers.length === 0 && noLocationPlaces.length === 0 && (
        <EmptyState illustration="map" title={t("map.empty")} />
      )}

      {selectedPlace && <PlaceSheet place={selectedPlace} onClose={() => setSelectedPlaceId(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PlaceSheet({ place, onClose }: { place: MapPlace; onClose: () => void }) {
  const navUrl =
    place.lat !== null && place.lng !== null
      ? googleMapsDir(`${place.lat},${place.lng}`, "transit")
      : (place.googleMapsUrl ?? googleMapsSearch(place.name));

  return (
    <BottomSheet open onClose={onClose} title={place.name}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-center gap-2">
          <CategoryIcon category={place.category} size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text-secondary">
              {place.scheduledDay !== null
                ? t("map.sheetScheduled", { day: place.scheduledDay })
                : t("map.sheetNotScheduled")}
            </p>
            {place.district && <p className="truncate text-xs text-text-muted">{place.district}</p>}
          </div>
        </div>

        {place.estPrice !== null && (
          <div className="flex items-center gap-2">
            <MoneyAmount amount={place.estPrice} currency={place.priceCurrency} size="md" />
            {place.lastVerifiedAt === null && (
              <span className="rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-bold text-warning">
                {t("common.unverified")}
              </span>
            )}
          </div>
        )}

        <a
          href={navUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-semibold text-brand-contrast active:opacity-80"
        >
          <Navigation aria-hidden size={18} className="rtl:-scale-x-100" />
          {t("common.navigate")}
        </a>

        {["idea", "under_review", "approved"].includes(place.status) && (
          <Button variant="secondary" block onClick={() => window.location.assign("/route?tab=places")}>
            {t("map.sheetScheduleCta")}
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
