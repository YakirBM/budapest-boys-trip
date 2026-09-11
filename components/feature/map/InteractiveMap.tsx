"use client";

import { useEffect, useRef } from "react";
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
import type { GeoPoint } from "@/lib/utils/geo";

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

export interface InteractiveMapProps {
  places: MapPlace[];
  anchors: AnchorStation[];
  showPlaces: boolean;
  showAnchors: boolean;
  selectedPlaceId: string | null;
  userLocation: GeoPoint | null;
  userLocationLabel: string;
  onSelectPlace: (id: string) => void;
}

export default function InteractiveMap({
  places,
  anchors,
  showPlaces,
  showAnchors,
  selectedPlaceId,
  userLocation,
  userLocationLabel,
  onSelectPlace,
}: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const locationMarkerRef = useRef<Marker | null>(null);

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
    map.on("load", () => {
      map.addSource("selection-line", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "selection-line",
        type: "line",
        source: "selection-line",
        paint: { "line-color": "#0e7490", "line-width": 3, "line-dasharray": [2, 2] },
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
      for (const place of places) {
        if (place.lat === null || place.lng === null || place.status === "rejected") continue;
        const element = markerElement(place.name, "place", place.scheduledDay);
        element.dataset.selected = String(place.id === selectedPlaceId);
        element.addEventListener("click", () => onSelectPlace(place.id));
        markers.push(new Marker({ element, anchor: "center" }).setLngLat([place.lng, place.lat]).addTo(map));
        bounds.extend([place.lng, place.lat]);
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
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 500 });
  }, [anchors, onSelectPlace, places, selectedPlaceId, showAnchors, showPlaces]);

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
