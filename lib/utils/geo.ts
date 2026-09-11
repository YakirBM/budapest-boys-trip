export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance; deterministic and safe to calculate offline. */
export function haversineMeters(from: GeoPoint, to: GeoPoint): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const dLat = lat2 - lat1;
  const dLng = radians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

/** Walking estimate at 4.8 km/h; the UI must label this as an estimate. */
export function estimatedWalkingMinutes(distanceMeters: number): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
  return Math.max(1, Math.round(distanceMeters / 80));
}

export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1_000).toFixed(distanceMeters < 10_000 ? 1 : 0)} km`;
}

/**
 * Generous Budapest metro bounding box (districts + inner suburbs). Seeded
 * coordinates outside this box are almost certainly wrong (e.g. swapped
 * lat/lng or a different city) — the map flags them instead of rendering
 * them silently far off-screen.
 */
export const BUDAPEST_BOUNDS = {
  minLat: 47.34,
  maxLat: 47.64,
  minLng: 18.84,
  maxLng: 19.36,
} as const;

export function isWithinBudapest(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= BUDAPEST_BOUNDS.minLat &&
    lat <= BUDAPEST_BOUNDS.maxLat &&
    lng >= BUDAPEST_BOUNDS.minLng &&
    lng <= BUDAPEST_BOUNDS.maxLng
  );
}

export interface ClusterInput {
  id: string;
  lat: number;
  lng: number;
}

export interface MarkerCluster {
  /** Centroid of the grouped points. */
  lat: number;
  lng: number;
  /** Member point ids (length 1 = no visual clustering needed). */
  ids: string[];
}

/** MapLibre zoom levels below this render place clusters instead of every pin. */
export const CLUSTER_MAX_ZOOM = 11;

/** Grid-cell size in degrees for ~80px cells at a given zoom level. */
export function clusterCellForZoom(zoom: number): number {
  return 360 / (256 * 2 ** Math.max(0, zoom)) * 80;
}

/**
 * Deterministic grid clustering for low-zoom declutter. Pure and offline-safe;
 * the renderer draws one numbered button per multi-member cell.
 */
export function clusterMarkers(points: readonly ClusterInput[], cellDegrees: number): MarkerCluster[] {
  const cells = new Map<string, ClusterInput[]>();
  for (const point of points) {
    const key = `${Math.floor(point.lat / cellDegrees)}:${Math.floor(point.lng / cellDegrees)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(point);
    else cells.set(key, [point]);
  }
  return [...cells.values()].map((bucket) => ({
    lat: bucket.reduce((sum, p) => sum + p.lat, 0) / bucket.length,
    lng: bucket.reduce((sum, p) => sum + p.lng, 0) / bucket.length,
    ids: bucket.map((p) => p.id),
  }));
}
