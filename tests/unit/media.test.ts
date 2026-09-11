import { describe, expect, it } from "vitest";
import {
  collectMediaTags,
  DEFAULT_MEDIA_FILTERS,
  hasActiveMediaFilters,
  sortMediaItems,
} from "@/lib/utils/media";

const A = { uploaded_at: "2026-10-05T10:00:00Z", day_number: 2, title: "בננה", caption: null };
const B = { uploaded_at: "2026-10-04T10:00:00Z", day_number: 1, title: "אבטיח", caption: null };
const C = { uploaded_at: "2026-10-06T10:00:00Z", day_number: null, title: null, caption: "תפוז" };

describe("media wall sorting", () => {
  it("orders newest-first by default", () => {
    expect(sortMediaItems([A, B, C], "newest").map((i) => i.uploaded_at)).toEqual([
      C.uploaded_at,
      A.uploaded_at,
      B.uploaded_at,
    ]);
  });

  it("orders oldest-first", () => {
    expect(sortMediaItems([A, B, C], "oldest").map((i) => i.uploaded_at)).toEqual([
      B.uploaded_at,
      A.uploaded_at,
      C.uploaded_at,
    ]);
  });

  it("groups by day with pre-trip items last", () => {
    expect(sortMediaItems([C, A, B], "day").map((i) => i.day_number)).toEqual([1, 2, null]);
  });

  it("sorts by Hebrew title (caption fallback)", () => {
    // אבטיח < בננה < תפוז in Hebrew collation
    expect(sortMediaItems([A, C, B], "title").map((i) => i.title ?? i.caption)).toEqual([
      "אבטיח",
      "בננה",
      "תפוז",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [A, B];
    sortMediaItems(input, "oldest");
    expect(input).toEqual([A, B]);
  });
});

describe("media wall filters", () => {
  it("reports no active filters by default", () => {
    expect(hasActiveMediaFilters(DEFAULT_MEDIA_FILTERS)).toBe(false);
  });

  it("detects each active filter dimension", () => {
    expect(hasActiveMediaFilters({ ...DEFAULT_MEDIA_FILTERS, day: 2 })).toBe(true);
    expect(hasActiveMediaFilters({ ...DEFAULT_MEDIA_FILTERS, mineOnly: true })).toBe(true);
    expect(hasActiveMediaFilters({ ...DEFAULT_MEDIA_FILTERS, albumId: "a" })).toBe(true);
    expect(hasActiveMediaFilters({ ...DEFAULT_MEDIA_FILTERS, placeId: "p" })).toBe(true);
    expect(hasActiveMediaFilters({ ...DEFAULT_MEDIA_FILTERS, tag: "אוכל" })).toBe(true);
    expect(hasActiveMediaFilters({ ...DEFAULT_MEDIA_FILTERS, visibility: "private" })).toBe(true);
    expect(hasActiveMediaFilters({ ...DEFAULT_MEDIA_FILTERS, likedOnly: true })).toBe(true);
    expect(hasActiveMediaFilters({ ...DEFAULT_MEDIA_FILTERS, search: "  גשר " })).toBe(true);
    expect(hasActiveMediaFilters({ ...DEFAULT_MEDIA_FILTERS, search: "   " })).toBe(false);
  });

  it("collects distinct Hebrew-collated tags with a cap", () => {
    const tags = collectMediaTags([
      { tags: ["לילה", "אוכל"] },
      { tags: ["אוכל", "  ", "גשר"] },
      { tags: [] },
    ]);
    expect(tags).toEqual(["אוכל", "גשר", "לילה"]);
    expect(collectMediaTags([{ tags: ["b", "a", "c"] }], 2)).toEqual(["a", "b"]);
  });
});
