import { describe, expect, it } from "vitest";
import {
  collectViewTags,
  compareWallRecency,
  groupItemsByAlbum,
  groupItemsByDay,
  groupItemsByPerson,
  groupItemsByPlace,
  hasLocation,
  peopleOf,
  placeOf,
  readViewParam,
  splitByLocation,
  stableSortBy,
  writeViewParam,
  type WallViewItem,
} from "@/components/feature/media/media-views";

function mk(overrides: Partial<WallViewItem> & { id: string }): WallViewItem {
  return {
    album_id: null,
    linked_place_id: null,
    place_id: null,
    day_number: null,
    taken_at: null,
    uploaded_at: "2026-10-05T10:00:00Z",
    title: null,
    caption: null,
    tags: [],
    tagged_member_ids: [],
    people: [],
    lat: null,
    lng: null,
    address_text: null,
    ...overrides,
  };
}

const UID_A = "11111111-1111-1111-1111-111111111111";
const UID_B = "22222222-2222-2222-2222-222222222222";

describe("media wall view grouping", () => {
  it("groups by album in first-appearance order with the no-album bucket last", () => {
    const items = [
      mk({ id: "u1" }),
      mk({ id: "a1", album_id: "alb-1" }),
      mk({ id: "a2", album_id: "alb-2" }),
      mk({ id: "a3", album_id: "alb-1" }),
      mk({ id: "u2" }),
    ];
    const groups = groupItemsByAlbum(items);
    expect(groups.map((g) => g.albumId)).toEqual(["alb-1", "alb-2", null]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a1", "a3"]);
    expect(groups[2]?.items.map((i) => i.id)).toEqual(["u1", "u2"]);
  });

  it("unifies new people[] with legacy tagged_member_ids", () => {
    const item = mk({ id: "x", people: [UID_A], tagged_member_ids: [UID_A, UID_B] });
    expect(peopleOf(item)).toEqual([UID_A, UID_B]);
    expect(placeOf(mk({ id: "y", place_id: "new", linked_place_id: "old" }))).toBe("new");
    expect(placeOf(mk({ id: "z", linked_place_id: "old" }))).toBe("old");
  });

  it("groups by person busiest-first with the untagged bucket last", () => {
    const items = [
      mk({ id: "t1", people: [UID_A, UID_B] }),
      mk({ id: "t2", tagged_member_ids: [UID_B] }),
      mk({ id: "t3" }),
    ];
    const groups = groupItemsByPerson(items);
    expect(groups.map((g) => g.personId)).toEqual([UID_B, UID_A, null]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["t1", "t2"]);
    expect(groups[2]?.items.map((i) => i.id)).toEqual(["t3"]);
  });

  it("groups by place with the unknown-address bucket last", () => {
    const items = [
      mk({ id: "p0" }),
      mk({ id: "p1", place_id: "place-1" }),
      mk({ id: "p2", linked_place_id: "place-1" }),
      mk({ id: "p3", place_id: "place-2" }),
    ];
    const groups = groupItemsByPlace(items);
    expect(groups.map((g) => g.placeId)).toEqual(["place-1", "place-2", null]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["p1", "p2"]);
  });

  it("groups days 1..5 ascending with the no-day section last", () => {
    const items = [
      mk({ id: "n", day_number: null }),
      mk({ id: "d3", day_number: 3 }),
      mk({ id: "d1", day_number: 1 }),
      mk({ id: "d1b", day_number: 1 }),
    ];
    const groups = groupItemsByDay(items);
    expect(groups.map((g) => g.day)).toEqual([1, 3, null]);
    // Stability: input order preserved inside a day.
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["d1", "d1b"]);
  });

  it("splits located/unlocated with reconciling counts", () => {
    const items = [
      mk({ id: "g1", lat: 47.4979, lng: 19.0402 }),
      mk({ id: "g2" }),
      mk({ id: "g3", lat: 47.5, lng: null }),
      mk({ id: "g4", lat: 999, lng: 19 }),
    ];
    expect(hasLocation(items[0]!)).toBe(true);
    expect(hasLocation(items[3]!)).toBe(false);
    const { located, unlocated } = splitByLocation(items);
    expect(located.map((i) => i.id)).toEqual(["g1"]);
    expect(unlocated.map((i) => i.id)).toEqual(["g2", "g3", "g4"]);
    expect(located.length + unlocated.length).toBe(items.length);
  });
});

describe("media wall sort stability", () => {
  it("keeps original order for equal recency keys", () => {
    const items = [
      mk({ id: "first", uploaded_at: "2026-10-05T10:00:00Z" }),
      mk({ id: "second", uploaded_at: "2026-10-05T10:00:00Z" }),
      mk({ id: "third", uploaded_at: "2026-10-05T10:00:00Z" }),
    ];
    expect(stableSortBy(items, compareWallRecency).map((i) => i.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("prefers taken_at over uploaded_at, newest first", () => {
    const items = [
      mk({ id: "old-upload-new-photo", uploaded_at: "2026-10-04T08:00:00Z", taken_at: "2026-10-06T12:00:00Z" }),
      mk({ id: "new-upload-old-photo", uploaded_at: "2026-10-07T08:00:00Z", taken_at: "2026-10-04T12:00:00Z" }),
    ];
    expect(stableSortBy(items, compareWallRecency).map((i) => i.id)).toEqual([
      "old-upload-new-photo",
      "new-upload-old-photo",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [mk({ id: "b" }), mk({ id: "a" })];
    stableSortBy(items, (x, y) => x.id.localeCompare(y.id));
    expect(items.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("media wall tag collection", () => {
  it("collects distinct Hebrew-collated tags with a cap", () => {
    const tags = collectViewTags([
      { tags: ["לילה", "אוכל"] },
      { tags: ["אוכל", "  ", "גשר"] },
      { tags: [] },
    ]);
    expect(tags).toEqual(["אוכל", "גשר", "לילה"]);
    expect(collectViewTags([{ tags: ["b", "a", "c"] }], 2)).toEqual(["a", "b"]);
  });
});

describe("media wall view URL params", () => {
  it("reads and writes ?view= while preserving other params", () => {
    expect(readViewParam("?view=map&day=2")).toBe("map");
    expect(readViewParam("?day=2")).toBeNull();
    expect(readViewParam("?view=bogus")).toBeNull();
    expect(writeViewParam("?day=2", "people")).toBe("?day=2&view=people");
    expect(writeViewParam("", "days")).toBe("?view=days");
  });
});
