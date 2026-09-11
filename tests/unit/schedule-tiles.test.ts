import { describe, expect, it } from "vitest";
import {
  isDay5AnchorConflict,
  isDay5AnchorConflictHHMM,
  isLegalStatusTransition,
  isMapPinWithinBounds,
  rebalanceSortOrders,
  reorderIds,
  sortScheduleItems,
  sumCostLines,
  sumDayEstimateHuf,
} from "@/components/feature/schedule/schedule-logic";
import { estimatedWalkingMinutes, haversineMeters } from "@/lib/utils/geo";

describe("schedule sort-merge (time then order)", () => {
  it("orders by start_time first, nulls last", () => {
    const items = [
      { id: "c", startTime: null, sortOrder: 10 },
      { id: "b", startTime: "2026-10-04T10:00:00+02:00", sortOrder: 30 },
      { id: "a", startTime: "2026-10-04T08:00:00+02:00", sortOrder: 20 },
    ];
    expect(sortScheduleItems(items).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks time ties by sort_order", () => {
    const same = "2026-10-05T09:00:00+02:00";
    const items = [
      { id: "second", startTime: same, sortOrder: 20 },
      { id: "first", startTime: same, sortOrder: 10 },
    ];
    expect(sortScheduleItems(items).map((i) => i.id)).toEqual(["first", "second"]);
  });

  it("rebalances to steps of 10 and moves ids for dnd commits", () => {
    expect(rebalanceSortOrders(3)).toEqual([10, 20, 30]);
    expect(reorderIds(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(reorderIds(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("Day-5 anchor warning (IZ292 10:25 HU, cutoff 06:00)", () => {
  it("flags items after 06:00 on day 5 only", () => {
    expect(isDay5AnchorConflictHHMM(5, "06:01")).toBe(true);
    expect(isDay5AnchorConflictHHMM(5, "06:00")).toBe(false);
    expect(isDay5AnchorConflictHHMM(5, "05:59")).toBe(false);
    expect(isDay5AnchorConflictHHMM(4, "09:00")).toBe(false);
    expect(isDay5AnchorConflictHHMM(5, null)).toBe(false);
  });

  it("parses ISO instants in Europe/Budapest", () => {
    // 07:30 Budapest wall time on day 5 → conflict.
    expect(isDay5AnchorConflict(5, "2026-10-08T05:30:00Z")).toBe(true);
    // 05:30 Budapest wall time on day 5 → clear.
    expect(isDay5AnchorConflict(5, "2026-10-08T03:30:00Z")).toBe(false);
    expect(isDay5AnchorConflict(5, null)).toBe(false);
  });
});

describe("legal status transitions", () => {
  it("allows the documented machine and blocks the rest", () => {
    expect(isLegalStatusTransition("planned", "confirmed")).toBe(true);
    expect(isLegalStatusTransition("confirmed", "in_progress")).toBe(true);
    expect(isLegalStatusTransition("in_progress", "completed")).toBe(true);
    expect(isLegalStatusTransition("skipped", "planned")).toBe(true);
    expect(isLegalStatusTransition("planned", "completed")).toBe(false);
    expect(isLegalStatusTransition("completed", "planned")).toBe(false);
    expect(isLegalStatusTransition("in_progress", "cancelled")).toBe(false);
  });
});

describe("cost sums", () => {
  it("sums AmountInput cost lines in minor units", () => {
    expect(
      sumCostLines([
        { label: "lunch", amountMinor: 4500, currency: "HUF" },
        { label: "metro", amountMinor: 500, currency: "HUF" },
      ]),
    ).toBe(5000);
    expect(sumCostLines([])).toBe(0);
  });

  it("rolls up HUF group estimates (group ?? per-person × members)", () => {
    expect(
      sumDayEstimateHuf(
        [
          { estCostGroup: 12000, estCostPerPerson: null, currency: "HUF" },
          { estCostGroup: null, estCostPerPerson: 1000, currency: "HUF" },
          { estCostGroup: null, estCostPerPerson: 50, currency: "EUR" },
        ],
        4,
      ),
    ).toBe(16000);
  });
});

describe("haversine fixture (Parliament → Fisherman's Bastion)", () => {
  it("measures ~800m with a ~10min walk estimate", () => {
    const distance = haversineMeters({ lat: 47.5071, lng: 19.0456 }, { lat: 47.502, lng: 19.0349 });
    expect(distance).toBeGreaterThan(600);
    expect(distance).toBeLessThan(1200);
    expect(estimatedWalkingMinutes(distance)).toBeGreaterThanOrEqual(7);
    expect(estimatedWalkingMinutes(distance)).toBeLessThanOrEqual(16);
  });
});

describe("map-pin bounds reject (47.2–47.7 / 18.8–19.4)", () => {
  it("accepts central Budapest and rejects outside cities", () => {
    expect(isMapPinWithinBounds(47.4979, 19.0402)).toBe(true);
    expect(isMapPinWithinBounds(47.2, 18.8)).toBe(true);
    expect(isMapPinWithinBounds(47.7, 19.4)).toBe(true);
    expect(isMapPinWithinBounds(32.0853, 34.7818)).toBe(false);
    expect(isMapPinWithinBounds(48.2082, 16.3738)).toBe(false);
    expect(isMapPinWithinBounds(47.1, 19.0)).toBe(false);
    expect(isMapPinWithinBounds(Number.NaN, 19.04)).toBe(false);
  });
});
