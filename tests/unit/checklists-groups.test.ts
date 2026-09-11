import { describe, expect, it } from "vitest";
import {
  mapSeedTitleToGroup,
  moveItemIds,
  normalizeChecklistGroup,
  normalizeChecklistSubFilter,
  rebalancePositions,
  summarizeProgress,
} from "@/components/feature/checklists/checklistGroups";

describe("mapSeedTitleToGroup (0021 backfill parity)", () => {
  it("maps the 7 seeded Hebrew lists to their life-phase groups", () => {
    // preflight (packing / preflight-like)
    expect(mapSeedTitleToGroup("לפני הטיסה")).toBe("preflight");
    expect(mapSeedTitleToGroup("יום הטיסה")).toBe("preflight");
    // travelers (shared gear / during-trip)
    expect(mapSeedTitleToGroup("כניסה לדירה")).toBe("travelers");
    expect(mapSeedTitleToGroup("כל בוקר")).toBe("travelers");
    expect(mapSeedTitleToGroup("יציאה ללילה")).toBe("travelers");
    // return (post / return)
    expect(mapSeedTitleToGroup("יום החזרה")).toBe("return");
    expect(mapSeedTitleToGroup("אחרי הטיול")).toBe("return");
  });

  it("maps English/custom titles by keyword", () => {
    expect(mapSeedTitleToGroup("packing list")).toBe("preflight");
    expect(mapSeedTitleToGroup("preflight docs")).toBe("preflight");
    expect(mapSeedTitleToGroup("shared-gear")).toBe("travelers");
    expect(mapSeedTitleToGroup("Shared Gear")).toBe("travelers");
    expect(mapSeedTitleToGroup("post-trip")).toBe("return");
    expect(mapSeedTitleToGroup("Return day")).toBe("return");
  });

  it("prefers return over travelers/preflight on ambiguous titles", () => {
    // Contains both 'יום' (flight-day-like) and 'חזרה' — must be return.
    expect(mapSeedTitleToGroup("יום החזרה")).toBe("return");
  });

  it("defaults unknown and empty titles to preflight", () => {
    expect(mapSeedTitleToGroup("רשימה חדשה שלי")).toBe("preflight");
    expect(mapSeedTitleToGroup("")).toBe("preflight");
    expect(mapSeedTitleToGroup("   ")).toBe("preflight");
  });

  it("normalizes URL/DB group values with a preflight fallback", () => {
    expect(normalizeChecklistGroup("travelers")).toBe("travelers");
    expect(normalizeChecklistGroup("return")).toBe("return");
    expect(normalizeChecklistGroup("nope")).toBe("preflight");
    expect(normalizeChecklistGroup(null)).toBe("preflight");
    expect(normalizeChecklistSubFilter("mine")).toBe("mine");
    expect(normalizeChecklistSubFilter("bogus")).toBe("all");
  });
});

describe("rebalancePositions + moveItemIds", () => {
  it("assigns seed-style 10-step positions in order", () => {
    expect(rebalancePositions(["a", "b", "c"])).toEqual([
      { id: "a", position: 10 },
      { id: "b", position: 20 },
      { id: "c", position: 30 },
    ]);
  });

  it("supports custom start/step and empty input", () => {
    expect(rebalancePositions([])).toEqual([]);
    expect(rebalancePositions(["x"], { startAt: 0, step: 5 })).toEqual([
      { id: "x", position: 0 },
    ]);
    expect(rebalancePositions(["a", "b"], { startAt: 100, step: 10 })).toEqual([
      { id: "a", position: 100 },
      { id: "b", position: 110 },
    ]);
  });

  it("moves the dragged id to the drop target without mutating", () => {
    const order = ["a", "b", "c", "d"];
    expect(moveItemIds(order, "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveItemIds(order, "d", "a")).toEqual(["d", "a", "b", "c"]);
    expect(moveItemIds(order, "b", "b")).toEqual(order);
    expect(order).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves the order unchanged for unknown ids", () => {
    expect(moveItemIds(["a", "b"], "zzz", "a")).toEqual(["a", "b"]);
    expect(moveItemIds(["a", "b"], "a", "zzz")).toEqual(["a", "b"]);
  });

  it("rebalanced drag results stay 1..n sequential", () => {
    const moved = moveItemIds(["a", "b", "c"], "c", "a");
    const assignments = rebalancePositions(moved);
    expect(assignments.map((a) => a.id)).toEqual(["c", "a", "b"]);
    expect(assignments.map((a) => a.position)).toEqual([10, 20, 30]);
  });
});

describe("summarizeProgress (list + readiness math)", () => {
  it("counts done/total and rounds the percent", () => {
    expect(summarizeProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
    expect(
      summarizeProgress([{ status: "done" }, { status: "not_started" }, { status: "done" }]),
    ).toEqual({ done: 2, total: 3, pct: 67 });
    expect(
      summarizeProgress([{ status: "done" }, { status: "done" }]),
    ).toEqual({ done: 2, total: 2, pct: 100 });
  });

  it("treats any non-done status as open", () => {
    expect(
      summarizeProgress([
        { status: "in_progress" },
        { status: "blocked" },
        { status: "not_started" },
      ]),
    ).toEqual({ done: 0, total: 3, pct: 0 });
  });
});
