import { describe, expect, it } from "vitest";
import { googleCalendarTemplate, googleMapsDir, parseMapsLink, telLink, whatsappShare } from "@/lib/utils/deeplinks";

describe("googleMapsDir", () => {
  it("builds a transit dir link with encoded destination", () => {
    const url = googleMapsDir("Deák Ferenc tér, Budapest", "transit");
    expect(url).toContain("https://www.google.com/maps/dir/?");
    expect(url).toContain("travelmode=transit");
    expect(url).toContain("destination=De%C3%A1k");
  });

  it("includes origin when provided", () => {
    expect(googleMapsDir("X", "walking", "Y")).toContain("origin=Y");
  });
});

describe("parseMapsLink (docs/06-features/01 rule 2)", () => {
  it("parses full place URLs and strips ALL query/tracking params", () => {
    const result = parseMapsLink(
      "https://www.google.com/maps/place/Sz%C3%A9chenyi+F%C3%BCrd%C5%91/@47.6184,19.0798,15z?utm_source=x&g_st=abc",
    );
    expect(result?.name).toContain("Széchenyi");
    expect(result?.lat).toBeCloseTo(47.6184);
    expect(result?.lng).toBeCloseTo(19.0798);
    expect(result?.cleanUrl).not.toContain("utm_source");
    expect(result?.cleanUrl).not.toContain("g_st");
  });

  it("parses bare coordinate pairs", () => {
    const result = parseMapsLink("47.4979, 19.0402");
    expect(result?.lat).toBe(47.4979);
    expect(result?.lng).toBe(19.0402);
  });

  it("returns null for garbage and non-maps URLs", () => {
    expect(parseMapsLink("https://example.com")).toBeNull();
    expect(parseMapsLink("not a url")).toBeNull();
    expect(parseMapsLink("")).toBeNull();
  });
});

describe("communication links", () => {
  it("builds tel: links stripping separators", () => {
    expect(telLink("+972-3-6903712")).toBe("tel:+97236903712");
    expect(telLink("112")).toBe("tel:112");
  });

  it("builds wa.me share links with encoded text", () => {
    expect(whatsappShare("שלום 123")).toBe(`https://wa.me/?text=${encodeURIComponent("שלום 123")}`);
  });

  it("builds google calendar template links", () => {
    const url = googleCalendarTemplate({
      title: "Flight IZ291 TLV → BUD",
      startUtc: new Date("2026-10-04T13:35:00Z"),
      endUtc: new Date("2026-10-04T17:35:00Z"),
      location: "TLV",
    });
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("20261004T133500Z");
  });
});
