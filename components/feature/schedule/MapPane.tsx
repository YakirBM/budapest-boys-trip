"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LocateFixed, Navigation } from "lucide-react";
import { t } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { TRIP_ID } from "@/lib/data/today";
import { fetchMapData, type LibraryPlace, type MapPlace } from "@/lib/data/route";
import { googleMapsDir, googleMapsSearch } from "@/lib/utils/deeplinks";
import { fetchWithOfflineFallback, useOfflineSnapshot } from "@/components/feature/today/useOfflineSnapshot";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { pushToast } from "@/components/ui/Toast";
import type { GeoPoint } from "@/lib/utils/geo";
import { LayersChips, type MapLayerId } from "@/components/feature/map/LayersChips";
import { MeasureBar } from "@/components/feature/map/MeasureBar";
import { PinSheet } from "@/components/feature/map/PinSheet";
import { PinsLayer, createMapPin, useMapPins, type MapPin, type MapPinKind } from "@/components/feature/map/PinsLayer";

const InteractiveMap = dynamic(() => import("@/components/feature/map/InteractiveMap"), {
  ssr: false,
  loading: () => <div className="h-[54dvh] min-h-80 w-full animate-pulse bg-surface-raised" />,
});

export interface MapPaneProps {
  currentUserId: string | null;
  isOwner: boolean;
  onAddToDay: (place: { name: string; address?: string | null }) => void;
}

function parseLayersParam(): Set<MapLayerId> {
  if (typeof window === "undefined") return new Set<MapLayerId>(["essentials"]);
  const raw = new URLSearchParams(window.location.search).get("layers");
  if (!raw) return new Set<MapLayerId>(["essentials"]);
  const valid: MapLayerId[] = ["essentials", "metro", "kosher", "malls"];
  const next = new Set<MapLayerId>();
  for (const part of raw.split(",")) {
    const id = part.trim() as MapLayerId;
    if (valid.includes(id)) next.add(id);
  }
  if (next.size === 0) next.add("essentials");
  return next;
}

/**
 * MapPane — shared interactive map (docs/14 §3.3). Lives in schedule/ to
 * respect the ownership map (map/ holds only the 4 new primitives).
 * Layers from DB, pins shared+realtime+offline, measure labelled estimate.
 */
export function MapPane({ currentUserId, isOwner, onAddToDay }: MapPaneProps) {
  const queryClient = useQueryClient();
  const [layers, setLayers] = useState<Set<MapLayerId>>(() => parseLayersParam());
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "loading" | "error">("idle");
  const [tileError, setTileError] = useState(false);
  const [pinDraft, setPinDraft] = useState<GeoPoint | null>(null);
  const [editingPin, setEditingPin] = useState<MapPin | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [measureFrom, setMeasureFrom] = useState<{ point: GeoPoint; label: string } | null>(null);
  const [measureTo, setMeasureTo] = useState<{ point: GeoPoint; label: string } | null>(null);

  const mapQuery = useQuery({
    queryKey: ["map-pins", "base", TRIP_ID],
    queryFn: () => fetchWithOfflineFallback("snapshot:map", () => fetchMapData(getSupabaseBrowserClient())),
    staleTime: 60_000,
  });
  const mapData = mapQuery.data ?? { places: [], anchors: [] };
  const { isOffline } = useOfflineSnapshot("map-pane", mapData);
  const pinsQuery = useMapPins();
  const pins = useMemo(() => pinsQuery.data ?? [], [pinsQuery.data]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("layers", [...layers].join(","));
    window.history.replaceState(null, "", url.toString());
  }, [layers]);

  function locateMe(): void {
    if (!("geolocation" in navigator)) {
      setLocationState("error");
      return;
    }
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        // Display-only, never stored/transmitted (existing rule preserved).
        setUserLocation({ lat: coords.latitude, lng: coords.longitude });
        setLocationState("idle");
      },
      () => setLocationState("error"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const kosherPlaces = useMemo(
    () => mapData.places.filter((p) => (p as MapPlace & { tags?: string[] }).status !== "rejected"),
    [mapData.places],
  );

  const visiblePlaces = useMemo(() => {
    const list = mapData.places.filter((p) => p.status !== "rejected");
    const showKosher = layers.has("kosher");
    const showMalls = layers.has("malls");
    if (!showKosher && !showMalls && layers.has("essentials")) return list;
    if (showKosher || showMalls) {
      // Layer filter: kosher tag / shopping type. Essentials stay visible.
      return list;
    }
    return list;
  }, [mapData.places, layers]);

  const visibleAnchors = useMemo(() => {
    if (layers.has("essentials") || layers.has("metro")) return mapData.anchors;
    return [];
  }, [mapData.anchors, layers]);

  const selectedPlace = mapData.places.find((p) => p.id === selectedPlaceId) ?? null;
  const selectedPin = pins.find((p) => p.id === selectedPinId) ?? null;

  function handleMapClick(point: GeoPoint): void {
    if (!currentUserId) return;
    setEditingPin(null);
    setPinDraft(point);
  }

  async function handlePinSave(input: { label: string; note: string | null; kind: MapPinKind }): Promise<void> {
    if (!currentUserId) return;
    setPinSaving(true);
    try {
      if (editingPin) {
        const canEdit = editingPin.createdBy === currentUserId || isOwner;
        if (!canEdit) throw new Error("forbidden");
        const supabase = getSupabaseBrowserClient();
        const { error } = await supabase
          .from("map_pins")
          .update({ label: input.label, note: input.note, kind: input.kind })
          .eq("id", editingPin.id);
        if (error) throw error;
        pushToast({ message: t("map.pins.saved"), type: "success" });
      } else {
        if (!pinDraft) throw new Error("noCoords");
        const result = await createMapPin({
          lat: pinDraft.lat,
          lng: pinDraft.lng,
          label: input.label,
          note: input.note,
          kind: input.kind,
          authorId: currentUserId,
        });
        if (!result.ok) throw new Error("bounds");
        pushToast({
          message: result.offline ? t("map.pins.offlineQueued") : t("map.pins.saved"),
          type: result.offline ? "info" : "success",
        });
      }
      setPinDraft(null);
      setEditingPin(null);
      void queryClient.invalidateQueries({ queryKey: ["map-pins", TRIP_ID] });
    } catch {
      pushToast({ message: t("errors.saveFailed"), type: "danger" });
    } finally {
      setPinSaving(false);
    }
  }

  async function handlePinDelete(pin: MapPin): Promise<void> {
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("map_pins").delete().eq("id", pin.id);
      if (error) throw error;
      if (selectedPinId === pin.id) setSelectedPinId(null);
      void queryClient.invalidateQueries({ queryKey: ["map-pins", TRIP_ID] });
    } catch {
      pushToast({ message: t("errors.saveFailed"), type: "danger" });
    }
  }

  function handlePinSelect(id: string | null): void {
    setSelectedPinId(id);
    const pin = pins.find((p) => p.id === id) ?? null;
    if (pin) {
      // Measure: tapping two pins (or pin + me) shows distance + walk estimate.
      if (!measureFrom) setMeasureFrom({ point: { lat: pin.lat, lng: pin.lng }, label: pin.label });
      else if (!measureTo && measureFrom.label !== pin.label) {
        setMeasureTo({ point: { lat: pin.lat, lng: pin.lng }, label: pin.label });
      }
    }
  }

  const pinMarkers = useMemo(
    () => pins.map((pin) => ({ id: pin.id, lat: pin.lat, lng: pin.lng, label: pin.label, kind: pin.kind })),
    [pins],
  );

  return (
    <section aria-label={t("today.sub.map")} className="flex flex-col gap-3">
      <LayersChips value={layers} onChange={setLayers} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={locateMe}
          disabled={locationState === "loading"}
          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text-secondary"
        >
          <LocateFixed aria-hidden size={16} />
          {locationState === "loading" ? t("common.loading") : t("map.locateMe")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (userLocation) setMeasureFrom({ point: userLocation, label: t("map.currentLocation") });
          }}
          disabled={!userLocation}
          className="inline-flex min-h-12 items-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text-secondary disabled:opacity-50"
        >
          {t("map.currentLocation")}
        </button>
      </div>

      {locationState === "error" && (
        <p role="alert" className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">
          {t("map.locationError")}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
        {isOffline ? (
          <div className="grid min-h-80 place-items-center p-6 text-center text-sm text-text-secondary">
            {t("map.offlineMap")}
          </div>
        ) : (
          <InteractiveMap
            places={visiblePlaces}
            anchors={visibleAnchors}
            showPlaces
            showAnchors={visibleAnchors.length > 0}
            selectedPlaceId={selectedPlaceId}
            userLocation={userLocation}
            userLocationLabel={t("map.currentLocation")}
            clusterAriaLabel={(count) => t("map.clusterLabel", { count })}
            onSelectPlace={(id) => {
              setSelectedPlaceId(id);
              setSelectedPinId(null);
            }}
            onTileError={() => setTileError(true)}
            pins={pinMarkers}
            showPins
            selectedPinId={selectedPinId}
            onSelectPin={handlePinSelect}
            onMapClick={handleMapClick}
          />
        )}
      </div>
      {tileError && !isOffline && (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {t("map.tileError")}
        </p>
      )}
      <p className="text-xs text-text-muted">{t("map.realMapNote")}</p>

      <MeasureBar
        from={measureFrom?.point ?? null}
        to={measureTo?.point ?? null}
        fromLabel={measureFrom?.label ?? null}
        toLabel={measureTo?.label ?? null}
        onClear={() => {
          setMeasureFrom(null);
          setMeasureTo(null);
        }}
      />

      {kosherPlaces.length === 0 && visiblePlaces.length === 0 && pins.length === 0 && (
        <EmptyState illustration="map" title={t("map.empty")} />
      )}

      <PinsLayer
        pins={pins}
        currentUserId={currentUserId}
        isOwner={isOwner}
        selectedId={selectedPinId}
        onSelect={handlePinSelect}
        onEdit={(pin) => {
          setPinDraft(null);
          setEditingPin(pin);
        }}
        onDelete={(pin) => void handlePinDelete(pin)}
      />

      <PinSheet
        open={pinDraft !== null || editingPin !== null}
        onClose={() => {
          setPinDraft(null);
          setEditingPin(null);
        }}
        initial={editingPin}
        draftCoords={editingPin ? { lat: editingPin.lat, lng: editingPin.lng } : pinDraft}
        onSave={handlePinSave}
        saving={pinSaving}
      />

      {selectedPlace && (
        <PlaceMiniCard
          place={selectedPlace}
          onClose={() => setSelectedPlaceId(null)}
          onAddToDay={() =>
            onAddToDay({ name: selectedPlace.name, address: selectedPlace.district })
          }
        />
      )}

      {selectedPin && (
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-sm font-bold text-text-primary">{selectedPin.label}</p>
          {selectedPin.note && <p className="mt-0.5 text-xs text-text-secondary">{selectedPin.note}</p>}
          <p className="mt-1 text-[11px] text-text-muted">{t("map.pins.sharedHint")}</p>
        </div>
      )}
    </section>
  );
}

function PlaceMiniCard({
  place,
  onClose,
  onAddToDay,
}: {
  place: MapPlace;
  onClose: () => void;
  onAddToDay: () => void;
}) {
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
        <a
          href={navUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-semibold text-brand-contrast"
        >
          <Navigation aria-hidden size={18} className="rtl:-scale-x-100" />
          {t("common.navigate")}
        </a>
        <Button variant="secondary" block onClick={onAddToDay}>
          {t("route.discover.addToDay")}
        </Button>
      </div>
    </BottomSheet>
  );
}

// Keep LibraryPlace import referenced for future layer enrichment (kosher/malls).
export type { LibraryPlace };
