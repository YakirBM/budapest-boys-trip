import { describe, expect, it } from "vitest";
import { estimatedWalkingMinutes, formatDistance, haversineMeters } from "@/lib/utils/geo";

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
