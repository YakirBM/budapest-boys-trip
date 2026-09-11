"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { LocateFixed, Navigation, Star, TrainFront } from "lucide-react";
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
import { estimatedWalkingMinutes, formatDistance, haversineMeters, type GeoPoint } from "@/lib/utils/geo";

export interface MapViewProps {
  initialData: MapData;
}

type MarkerKind = "idea" | "approved" | "scheduled";

const MARKER_COLORS: Record<MarkerKind, string> = {
  idea: "var(--color-warning)",
  approved: "var(--color-success)",
  scheduled: "var(--color-info)",
};

const InteractiveMap = dynamic(() => import("./InteractiveMap"), {
  ssr: false,
  loading: () => <div className="h-[54dvh] min-h-80 w-full animate-pulse bg-surface-raised" />,
});

/**
 * MapView — dynamically loads MapLibre only on this route, renders geographic
 * OpenStreetMap tiles, and keeps the cached no-location list as its fallback.
 * Geographic orientation is deliberately LTR even though controls/content are RTL.
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
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "loading" | "error">("idle");

  const placedMarkers = useMemo(
    () =>
      data.places
        .filter((place) => place.lat !== null && place.lng !== null)
        .filter((place) => place.status !== "rejected"),
    [data.places],
  );
  const noLocationPlaces = data.places.filter(
    (place) => (place.lat === null || place.lng === null) && place.status !== "rejected",
  );
  const anchorMarkers = useMemo(
    () =>
      data.anchors
        .filter((anchor) => anchor.lat !== null && anchor.lng !== null),
    [data.anchors],
  );
  const anchorsWithoutCoords = data.anchors.filter((a) => a.lat === null || a.lng === null);

  const selectedPlace = data.places.find((place) => place.id === selectedPlaceId) ?? null;
  const estimateOrigin = userLocation ?? anchorMarkers[0] ?? null;
  const selectedDistance =
    selectedPlace?.lat !== null && selectedPlace?.lat !== undefined &&
    selectedPlace.lng !== null && estimateOrigin?.lat !== null && estimateOrigin?.lat !== undefined &&
    estimateOrigin.lng !== null && estimateOrigin.lng !== undefined
      ? haversineMeters(
          { lat: estimateOrigin.lat, lng: estimateOrigin.lng },
          { lat: selectedPlace.lat, lng: selectedPlace.lng },
        )
      : null;

  function locateMe(): void {
    if (!("geolocation" in navigator)) {
      setLocationState("error");
      return;
    }
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation({ lat: coords.latitude, lng: coords.longitude });
        setLocationState("idle");
      },
      () => setLocationState("error"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

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
        <button
          type="button"
          onClick={locateMe}
          disabled={locationState === "loading"}
          className={layerButtonClass(userLocation !== null)}
        >
          <LocateFixed aria-hidden size={16} />
          {locationState === "loading" ? t("common.loading") : t("map.locateMe")}
        </button>
      </div>

      {locationState === "error" && (
        <p className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning" role="alert">
          {t("map.locationError")}
        </p>
      )}

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

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
        {isOffline ? (
          <div className="grid min-h-80 place-items-center p-6 text-center text-sm text-text-secondary">
            {t("map.offlineMap")}
          </div>
        ) : (
          <InteractiveMap
            places={placedMarkers}
            anchors={anchorMarkers}
            showPlaces={showPlacesLayer}
            showAnchors={showAnchorsLayer}
            selectedPlaceId={selectedPlaceId}
            userLocation={userLocation}
            userLocationLabel={t("map.currentLocation")}
            onSelectPlace={setSelectedPlaceId}
          />
        )}
      </div>
      <p className="text-xs text-text-muted">{t("map.realMapNote")}</p>

      {selectedPlace && selectedDistance !== null && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2">
          <span className="min-w-0 truncate text-sm font-semibold text-text-primary">{selectedPlace.name}</span>
          <span className="tnum shrink-0 text-xs text-text-secondary">
            {t("map.walkingEstimate", {
              distance: formatDistance(selectedDistance),
              minutes: estimatedWalkingMinutes(selectedDistance),
            })}
          </span>
        </div>
      )}

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
