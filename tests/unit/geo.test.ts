import { describe, expect, it } from "vitest";
import {
  CLUSTER_MAX_ZOOM,
  clusterCellForZoom,
  clusterMarkers,
  estimatedWalkingMinutes,
  formatDistance,
  haversineMeters,
  isWithinBudapest,
} from "@/lib/utils/geo";

describe("map distance estimates", () => {
  it("calculates the Budapest great-circle distance consistently", () => {
    const distance = haversineMeters(
      { lat: 47.4979, lng: 19.0402 },
      { lat: 47.4984, lng: 19.0408 },
    );
    expect(distance).toBeGreaterThan(60);
    expect(distance).toBeLessThan(90);
  });

  it("formats distances and estimates walking at 4.8 km/h", () => {
    expect(formatDistance(840)).toBe("840 m");
    expect(formatDistance(1_250)).toBe("1.3 km");
    expect(estimatedWalkingMinutes(800)).toBe(10);
  });
});

describe("Budapest coordinate validation", () => {
  it("accepts central Budapest and the district edges", () => {
    expect(isWithinBudapest(47.4979, 19.0402)).toBe(true); // Deák Ferenc tér
    expect(isWithinBudapest(47.35, 18.9)).toBe(true);
    expect(isWithinBudapest(47.63, 19.35)).toBe(true);
  });

  it("rejects other cities, swapped coordinates and non-finite input", () => {
    expect(isWithinBudapest(32.0853, 34.7818)).toBe(false); // Tel Aviv
    expect(isWithinBudapest(48.2082, 16.3738)).toBe(false); // Vienna
    expect(isWithinBudapest(19.0402, 47.4979)).toBe(false); // swapped lat/lng
    expect(isWithinBudapest(Number.NaN, 19.04)).toBe(false);
  });
});

describe("low-zoom marker clustering", () => {
  it("groups nearby points and keeps distant ones separate", () => {
    const clusters = clusterMarkers(
      [
        { id: "a", lat: 47.5, lng: 19.04 },
        { id: "b", lat: 47.501, lng: 19.041 },
        { id: "c", lat: 47.6, lng: 19.3 },
      ],
      clusterCellForZoom(9),
    );
    expect(clusters).toHaveLength(2);
    const grouped = clusters.find((c) => c.ids.length === 2);
    expect(grouped?.ids.sort()).toEqual(["a", "b"]);
    expect(clusters.find((c) => c.ids.length === 1)?.ids).toEqual(["c"]);
  });

  it("computes the centroid of a cluster", () => {
    const [cluster] = clusterMarkers(
      [
        { id: "a", lat: 47.5, lng: 19.0 },
        { id: "b", lat: 47.52, lng: 19.04 },
      ],
      clusterCellForZoom(9),
    );
    expect(cluster!.lat).toBeCloseTo(47.51, 5);
    expect(cluster!.lng).toBeCloseTo(19.02, 5);
  });

  it("widens cells as zoom drops below the cluster threshold", () => {
    expect(CLUSTER_MAX_ZOOM).toBe(11);
    expect(clusterCellForZoom(8)).toBeGreaterThan(clusterCellForZoom(10));
  });
});
