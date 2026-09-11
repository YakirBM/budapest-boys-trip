import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUFFER_MIN,
  evaluateDayFeasibility,
  resolveNextUp,
  type FeasibilityInput,
} from "@/lib/utils/feasibility";

const MIN = 60_000;
const base = 0;

function item(partial: Partial<FeasibilityInput> & { id: string }): FeasibilityInput {
  return {
    title: partial.id,
    status: "planned",
    startTime: base,
    endTime: null,
    ...partial,
  };
}

describe("evaluateDayFeasibility (doc 00 rule 8)", () => {
  it("warns when slack < buffer and clears when times move", () => {
    // prev ends 12:30 (=750m), travel 23 → arrival 12:53 (=773m); next starts 13:00 (=780m) → slack 7 < 12
    const items: FeasibilityInput[] = [
      item({ id: "lunch-prev", startTime: base, endTime: base + 750 * MIN, travelMinToNext: 23 }),
      item({ id: "lunch", startTime: base + 780 * MIN }),
    ];
    const warnings = evaluateDayFeasibility(items);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ itemId: "lunch", severity: "warning", slackMin: 7 });

    // Move next to 13:30 → slack 37 → clear
    const moved = [items[0]!, item({ id: "lunch", startTime: base + 810 * MIN })];
    expect(evaluateDayFeasibility(moved)).toHaveLength(0);
  });

  it("hard-conflict when a reserved item is reached late", () => {
    const items: FeasibilityInput[] = [
      item({ id: "a", startTime: base, endTime: base + 60 * MIN, travelMinToNext: 10 }),
      item({ id: "b", startTime: base + 60 * MIN, hasReservation: true }),
    ];
    const warnings = evaluateDayFeasibility(items);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ itemId: "b", severity: "conflict" });
  });

  it("uses duration fallback when end_time missing and skips skipped/cancelled", () => {
    const items: FeasibilityInput[] = [
      item({ id: "prev", startTime: base, durationMin: 90, travelMinToNext: 0, status: "in_progress" }),
      item({ id: "skipped", startTime: base + 200 * MIN, status: "skipped" }),
      item({ id: "next", startTime: base + 95 * MIN }),
    ];
    // prev ends 90 → arrival 90; next starts 95 → slack 5 < 12 → warning
    const warnings = evaluateDayFeasibility(items, DEFAULT_BUFFER_MIN);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.itemId).toBe("next");
  });
});

describe("resolveNextUp (doc 00)", () => {
  it("prefers the in-progress item, then the first upcoming within 15 min", () => {
    const now = base + 10 * 60 * MIN;
    const items: FeasibilityInput[] = [
      item({ id: "past", startTime: base, endTime: base + 60 * MIN, status: "completed" }),
      item({ id: "upcoming-far", startTime: now + 120 * MIN }),
      item({ id: "upcoming-soon", startTime: now + 10 * MIN }),
    ];
    expect(resolveNextUp(items, now)?.id).toBe("upcoming-soon");

    const withCurrent = [
      item({ id: "current", startTime: now - 30 * MIN, durationMin: 90, status: "in_progress" }),
      ...items,
    ];
    expect(resolveNextUp(withCurrent, now)?.id).toBe("current");
  });
});
