import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/utils/ics";

describe("buildIcs (docs/08 §5)", () => {
  const iz291 = {
    uid: "iz291-outbound@trip",
    start: { at: new Date("2026-10-04T13:35:00Z"), tzid: "Asia/Jerusalem" },
    end: { at: new Date("2026-10-04T17:35:00Z"), tzid: "Europe/Budapest" },
    summary: "Flight IZ291 TLV → BUD",
    description: "Arkia reservation 1385•••93 — check-in ≥3h prior",
  };

  it("emits required fields with TZID wall times", () => {
    const ics = buildIcs([iz291]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//budapest-boys-trip//EN");
    expect(ics).toContain("UID:iz291-outbound@trip");
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    expect(ics).toContain("DTSTART;TZID=Asia/Jerusalem:20261004T163500");
    expect(ics).toContain("DTEND;TZID=Europe/Budapest:20261004T193500");
    expect(ics).toContain("SUMMARY:Flight IZ291 TLV → BUD");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("escapes commas/semicolons and folds long lines", () => {
    const long = "A".repeat(200);
    const ics = buildIcs([
      { ...iz291, summary: "test, with; special\nchars", description: long },
    ]);
    expect(ics).toContain("SUMMARY:test\\, with\\; special\\nchars");
    expect(ics).toContain("\r\n ");
  });

  it("never embeds the full reservation number (masked input required)", () => {
    const ics = buildIcs([iz291]);
    expect(ics).not.toContain("13859993");
    expect(ics).toContain("1385•••93");
  });
});
