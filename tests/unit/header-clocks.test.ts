import { describe, expect, it } from "vitest";
import { formatFullDate, formatFullTime } from "@/lib/utils/header-clock";

/** Phase 1 gate: header clocks render full date/time in fixed zones. */
describe("header clocks", () => {
  const at = new Date("2026-10-04T12:00:00Z");

  it("formats full Budapest time (UTC+2, DST) with seconds", () => {
    expect(formatFullTime("Europe/Budapest", at)).toBe("14:00:00");
  });

  it("formats full Israel time (UTC+3) with seconds", () => {
    expect(formatFullTime("Asia/Jerusalem", at)).toBe("15:00:00");
  });

  it("formats the full Hebrew trip-local date", () => {
    const out = formatFullDate(at);
    expect(out).toContain("2026");
    expect(out).toContain("4");
  });
});
