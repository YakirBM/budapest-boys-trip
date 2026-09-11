import { describe, expect, it } from "vitest";
import {
  computeLeaveBy,
  currentTripDayClamped,
  tzOffsetMinutes,
  todayInTz,
  tripDayNumber,
  weekdayHebrew,
  zonedWallTimeToUtc,
} from "@/lib/utils/time";

const TRIP_START = "2026-10-04";
const TRIP_END = "2026-10-08";

describe("timezone basics (docs/12 §10)", () => {
  it("Budapest is UTC+2 and Jerusalem UTC+3 during the trip", () => {
    const duringTrip = new Date("2026-10-05T12:00:00Z");
    expect(tzOffsetMinutes("Europe/Budapest", duringTrip)).toBe(120);
    expect(tzOffsetMinutes("Asia/Jerusalem", duringTrip)).toBe(180);
  });

  it("todayInTz rolls by Budapest local date, not device date", () => {
    // 2026-10-05 00:30 Budapest = 2026-10-04 late evening elsewhere
    const at = new Date("2026-10-04T22:30:00Z");
    expect(todayInTz("Europe/Budapest", at)).toBe("2026-10-05");
    expect(todayInTz("Asia/Jerusalem", at)).toBe("2026-10-05");
  });

  it("converts wall time in a zone to the correct instant", () => {
    // IZ291 dep: 2026-10-04 16:35 Asia/Jerusalem = 13:35Z
    expect(zonedWallTimeToUtc("2026-10-04", "16:35", "Asia/Jerusalem").toISOString())
      .toBe("2026-10-04T13:35:00.000Z");
    // IZ292 dep: 2026-10-08 10:25 Europe/Budapest = 08:25Z
    expect(zonedWallTimeToUtc("2026-10-08", "10:25", "Europe/Budapest").toISOString())
      .toBe("2026-10-08T08:25:00.000Z");
  });
});

describe("trip day mapping (doc 00 rule 1)", () => {
  it("maps trip dates to days 1–5", () => {
    expect(tripDayNumber("2026-10-04", TRIP_START, TRIP_END)).toBe(1);
    expect(tripDayNumber("2026-10-08", TRIP_START, TRIP_END)).toBe(5);
    expect(tripDayNumber("2026-10-06", TRIP_START, TRIP_END)).toBe(3);
  });

  it("clamps outside the window: pre-trip → day 1, post-trip → day 5", () => {
    const pre = currentTripDayClamped(new Date("2026-09-11T12:00:00Z"), TRIP_START, TRIP_END);
    expect(pre).toEqual({ dayNumber: 1, isPreTrip: true, isPostTrip: false });
    const post = currentTripDayClamped(new Date("2026-10-20T12:00:00Z"), TRIP_START, TRIP_END);
    expect(post).toEqual({ dayNumber: 5, isPreTrip: false, isPostTrip: true });
  });
});

describe("leave-by + labels", () => {
  it("computes leave_by with travel + buffer (doc 00 rule 3)", () => {
    // IZ292 08:25Z, travel 20, buffer 12 → 07:53Z
    expect(computeLeaveBy(new Date("2026-10-08T08:25:00Z"), 20).toISOString())
      .toBe("2026-10-08T07:53:00.000Z");
  });

  it("renders Hebrew weekday and the tz-labeled time", () => {
    expect(weekdayHebrew("2026-10-04")).toBe("יום ראשון");
    const iz291 = zonedWallTimeToUtc("2026-10-04", "16:35", "Asia/Jerusalem");
    expect(new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(iz291)).toBe("16:35");
  });
});
