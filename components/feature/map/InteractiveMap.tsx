"use client";

import { useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import type { AnchorStation, MapPlace } from "@/lib/data/route";
import {
  CLUSTER_MAX_ZOOM,
  clusterCellForZoom,
  clusterMarkers,
  type GeoPoint,
} from "@/lib/utils/geo";

const BUDAPEST_CENTER: [number, number] = [19.0402, 47.4979];
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [TILE_URL],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution:
        '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function markerElement(label: string, kind: "place" | "anchor", day: number | null): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `real-map-marker real-map-marker--${kind}`;
  element.setAttribute("aria-label", label);
  element.title = label;
  element.textContent = kind === "anchor" ? "★" : day ? String(day) : "•";
  return element;
}

function clusterElement(count: number, label: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "real-map-marker real-map-marker--cluster";
  element.setAttribute("aria-label", label);
  element.title = label;
  element.textContent = String(count);
  return element;
}

export interface InteractiveMapProps {
  places: MapPlace[];
  anchors: AnchorStation[];
  showPlaces: boolean;
  showAnchors: boolean;
  selectedPlaceId: string | null;
  userLocation: GeoPoint | null;
  userLocationLabel: string;
  clusterAriaLabel: (count: number) => string;
  onSelectPlace: (id: string) => void;
  /** Fired once tile loading fails so the parent can show a visible banner. */
  onTileError?: () => void;
}

export default function InteractiveMap({
  places,
  anchors,
  showPlaces,
  showAnchors,
  selectedPlaceId,
  userLocation,
  userLocationLabel,
  clusterAriaLabel,
  onSelectPlace,
  onTileError,
}: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const locationMarkerRef = useRef<Marker | null>(null);
  const tileErrorRef = useRef(onTileError);
  tileErrorRef.current = onTileError;
  const fittedRef = useRef<string | null>(null);
  const [zoom, setZoom] = useState(12.4);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE,
      center: BUDAPEST_CENTER,
      zoom: 12.4,
      attributionControl: false,
      cooperativeGestures: true,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.on("zoomend", () => setZoom(map.getZoom()));
    map.on("error", (event) => {
      const detail = event as unknown as { sourceId?: string; tile?: unknown };
      if (detail.sourceId === "osm" || detail.tile) tileErrorRef.current?.();
    });
    map.on("load", () => {
      const brand =
        getComputedStyle(document.documentElement).getPropertyValue("--c-brand").trim() ||
        "#0e7c74";
      map.addSource("selection-line", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "selection-line",
        type: "line",
        source: "selection-line",
        paint: { "line-color": brand, "line-width": 3, "line-dasharray": [2, 2] },
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markersRef.current) marker.remove();
    const markers: Marker[] = [];
    const bounds = new LngLatBounds();

    if (showPlaces) {
      const visible = places.filter(
        (place) => place.lat !== null && place.lng !== null && place.status !== "rejected",
      );
      if (zoom < CLUSTER_MAX_ZOOM && visible.length > 1) {
        for (const cluster of clusterMarkers(
          visible.map((place) => ({ id: place.id, lat: place.lat as number, lng: place.lng as number })),
          clusterCellForZoom(zoom),
        )) {
          if (cluster.ids.length < 2) {
            const place = visible.find((p) => p.id === cluster.ids[0]);
            if (!place || place.lat === null || place.lng === null) continue;
            const element = markerElement(place.name, "place", place.scheduledDay);
            element.dataset.selected = String(place.id === selectedPlaceId);
            element.addEventListener("click", () => onSelectPlace(place.id));
            markers.push(new Marker({ element, anchor: "center" }).setLngLat([place.lng, place.lat]).addTo(map));
          } else {
            const label = clusterAriaLabel(cluster.ids.length);
            const element = clusterElement(cluster.ids.length, label);
            element.addEventListener("click", () => {
              map.easeTo({ center: [cluster.lng, cluster.lat], zoom: Math.min(zoom + 2.5, 14) });
            });
            markers.push(new Marker({ element, anchor: "center" }).setLngLat([cluster.lng, cluster.lat]).addTo(map));
          }
          bounds.extend([cluster.lng, cluster.lat]);
        }
      } else {
        for (const place of visible) {
          if (place.lat === null || place.lng === null) continue;
          const element = markerElement(place.name, "place", place.scheduledDay);
          element.dataset.selected = String(place.id === selectedPlaceId);
          element.addEventListener("click", () => onSelectPlace(place.id));
          markers.push(new Marker({ element, anchor: "center" }).setLngLat([place.lng, place.lat]).addTo(map));
          bounds.extend([place.lng, place.lat]);
        }
      }
    }
    if (showAnchors) {
      for (const anchor of anchors) {
        if (anchor.lat === null || anchor.lng === null) continue;
        const element = markerElement(anchor.nameHe, "anchor", null);
        markers.push(new Marker({ element, anchor: "center" }).setLngLat([anchor.lng, anchor.lat]).addTo(map));
        bounds.extend([anchor.lng, anchor.lat]);
      }
    }
    markersRef.current = markers;
    // Auto-fit only when the underlying dataset changes — never fight the
    // user's own zoom (which also drives low-zoom clustering).
    const fitSignature = JSON.stringify([
      showPlaces ? places.map((p) => p.id) : [],
      showAnchors ? anchors.map((a) => a.id) : [],
      selectedPlaceId,
    ]);
    if (!bounds.isEmpty() && fittedRef.current !== fitSignature) {
      fittedRef.current = fitSignature;
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 500 });
    }
  }, [anchors, clusterAriaLabel, onSelectPlace, places, selectedPlaceId, showAnchors, showPlaces, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    locationMarkerRef.current?.remove();
    locationMarkerRef.current = null;
    if (!map || !userLocation) return;
    const element = document.createElement("span");
    element.className = "real-map-user-marker";
    element.setAttribute("aria-label", userLocationLabel);
    locationMarkerRef.current = new Marker({ element, anchor: "center" })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map);
    map.easeTo({ center: [userLocation.lng, userLocation.lat], zoom: Math.max(map.getZoom(), 14) });
  }, [userLocation, userLocationLabel]);

  useEffect(() => {
    const map = mapRef.current;
    const selected = places.find((place) => place.id === selectedPlaceId);
    if (!map || !selected || selected.lat === null || selected.lng === null) return;
    map.easeTo({ center: [selected.lng, selected.lat], zoom: Math.max(map.getZoom(), 14) });
    const source = map.getSource("selection-line") as GeoJSONSource | undefined;
    if (!source) return;
    const origin = userLocation ?? anchors.find((a) => a.lat !== null && a.lng !== null);
    source.setData({
      type: "FeatureCollection",
      features: origin && origin.lat !== null && origin.lng !== null
        ? [{
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [[origin.lng, origin.lat], [selected.lng, selected.lat]],
            },
          }]
        : [],
    });
  }, [anchors, places, selectedPlaceId, userLocation]);

  return <div ref={containerRef} className="h-[54dvh] min-h-80 w-full" dir="ltr" />;
}
