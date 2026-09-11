/**
 * Memory Wall view helpers (docs/14 §6, Tab 4 — "Memory Wall").
 *
 * Pure, side-effect-free grouping / sorting / tag utilities over ONE media
 * source for the five wall views (albums | people | places | map | days).
 * Node-safe and unit-tested in tests/unit/media-views.test.ts.
 *
 * Reconciliation note: `people[]` mirrors the legacy `tagged_member_ids`
 * and `place_id` mirrors the legacy `linked_place_id` (migration 0022 keeps
 * both for pipeline compatibility). Every helper below reads the new column
 * first and falls back to the legacy one, so pre- and post-migration rows
 * group identically.
 */

export type MediaWallView = "albums" | "people" | "places" | "map" | "days";

export const MEDIA_WALL_VIEWS: readonly MediaWallView[] = [
  "albums",
  "people",
  "places",
  "map",
  "days",
];

export function isMediaWallView(value: string): value is MediaWallView {
  return (MEDIA_WALL_VIEWS as readonly string[]).includes(value);
}

/** Minimal wall-item surface every view operates on. */
export interface WallViewItem {
  id: string;
  album_id: string | null;
  linked_place_id: string | null;
  place_id: string | null;
  day_number: number | null;
  taken_at: string | null;
  uploaded_at: string;
  title: string | null;
  caption: string | null;
  tags: string[];
  tagged_member_ids: string[];
  people: string[];
  lat: number | null;
  lng: number | null;
  address_text: string | null;
}

export interface WallAlbum {
  id: string;
  name: string;
  visibility: "shared" | "private";
}

export function normalizeAlbumVisibility(value: unknown): "shared" | "private" {
  return value === "private" ? "private" : "shared";
}

/** Union of new `people[]` + legacy `tagged_member_ids`, deduped, stable. */
export function peopleOf(item: Pick<WallViewItem, "people" | "tagged_member_ids">): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...item.people, ...item.tagged_member_ids]) {
    const id = raw.trim();
    if (id !== "" && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** New `place_id` first, legacy `linked_place_id` as fallback. */
export function placeOf(
  item: Pick<WallViewItem, "place_id" | "linked_place_id">,
): string | null {
  return item.place_id ?? item.linked_place_id;
}

/** True only for finite, in-range photo coordinates. */
export function hasLocation(
  item: Pick<WallViewItem, "lat" | "lng">,
): boolean {
  return (
    item.lat !== null &&
    item.lng !== null &&
    Number.isFinite(item.lat) &&
    Number.isFinite(item.lng) &&
    item.lat >= -90 &&
    item.lat <= 90 &&
    item.lng >= -180 &&
    item.lng <= 180
  );
}

export interface AlbumGroup {
  albumId: string | null;
  items: WallViewItem[];
}

/** Group by album in first-appearance order; the "no album" bucket sorts last. */
export function groupItemsByAlbum(items: readonly WallViewItem[]): AlbumGroup[] {
  const groups = new Map<string, WallViewItem[]>();
  const unknown: WallViewItem[] = [];
  for (const item of items) {
    if (item.album_id === null) {
      unknown.push(item);
    } else {
      const bucket = groups.get(item.album_id);
      if (bucket) bucket.push(item);
      else groups.set(item.album_id, [item]);
    }
  }
  const out: AlbumGroup[] = [...groups.entries()].map(([albumId, groupItems]) => ({
    albumId,
    items: groupItems,
  }));
  if (unknown.length > 0) out.push({ albumId: null, items: unknown });
  return out;
}

export interface PersonGroup {
  personId: string | null;
  items: WallViewItem[];
}

/**
 * Group by tagged person (new + legacy ids unified). Busiest person first,
 * ties broken by id for determinism; the untagged bucket is always last.
 */
export function groupItemsByPerson(items: readonly WallViewItem[]): PersonGroup[] {
  const groups = new Map<string, WallViewItem[]>();
  const untagged: WallViewItem[] = [];
  for (const item of items) {
    const people = peopleOf(item);
    if (people.length === 0) {
      untagged.push(item);
    } else {
      for (const personId of people) {
        const bucket = groups.get(personId);
        if (bucket) bucket.push(item);
        else groups.set(personId, [item]);
      }
    }
  }
  const out: PersonGroup[] = [...groups.entries()]
    .sort(([aId, aItems], [bId, bItems]) => {
      if (bItems.length !== aItems.length) return bItems.length - aItems.length;
      return aId.localeCompare(bId);
    })
    .map(([personId, groupItems]) => ({ personId, items: groupItems }));
  if (untagged.length > 0) out.push({ personId: null, items: untagged });
  return out;
}

export interface PlaceGroup {
  placeId: string | null;
  items: WallViewItem[];
}

/** Group by place (new + legacy ids unified); unknown-address bucket last. */
export function groupItemsByPlace(items: readonly WallViewItem[]): PlaceGroup[] {
  const groups = new Map<string, WallViewItem[]>();
  const unknown: WallViewItem[] = [];
  for (const item of items) {
    const placeId = placeOf(item);
    if (placeId === null) {
      unknown.push(item);
    } else {
      const bucket = groups.get(placeId);
      if (bucket) bucket.push(item);
      else groups.set(placeId, [item]);
    }
  }
  const out: PlaceGroup[] = [...groups.entries()].map(([groupPlaceId, groupItems]) => ({
    placeId: groupPlaceId,
    items: groupItems,
  }));
  if (unknown.length > 0) out.push({ placeId: null, items: unknown });
  return out;
}

export interface DayGroup {
  day: number | null;
  items: WallViewItem[];
}

/**
 * Sections day 1..5 + a trailing no-day group, always in that order. Only groups
 * that contain items are returned; input order inside a group is preserved
 * (callers pass an already-sorted slice for stability).
 */
export function groupItemsByDay(items: readonly WallViewItem[]): DayGroup[] {
  const buckets = new Map<number, WallViewItem[]>();
  const none: WallViewItem[] = [];
  for (const item of items) {
    if (item.day_number === null) {
      none.push(item);
    } else {
      const bucket = buckets.get(item.day_number);
      if (bucket) bucket.push(item);
      else buckets.set(item.day_number, [item]);
    }
  }
  const out: DayGroup[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, groupItems]) => ({ day, items: groupItems }));
  if (none.length > 0) out.push({ day: null, items: none });
  return out;
}

export interface LocatedSplit {
  located: WallViewItem[];
  unlocated: WallViewItem[];
}

/** Map-view split: only geotagged items become pins. Counts reconcile. */
export function splitByLocation(items: readonly WallViewItem[]): LocatedSplit {
  const located: WallViewItem[] = [];
  const unlocated: WallViewItem[] = [];
  for (const item of items) {
    if (hasLocation(item)) located.push(item);
    else unlocated.push(item);
  }
  return { located, unlocated };
}

/** Distinct manual tags, Hebrew-collated, capped. Mirrors collectMediaTags. */
export function collectViewTags(items: readonly { tags: string[] }[], limit = 60): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags) {
      const clean = tag.trim();
      if (clean !== "") seen.add(clean);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "he")).slice(0, Math.max(0, limit));
}

/** Index-decorated stable sort: equal keys keep their original order. */
export function stableSortBy<T>(items: readonly T[], compare: (a: T, b: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map((entry) => entry.item);
}

/** Newest first by photo time (`taken_at`) with upload time as fallback. */
export function compareWallRecency(a: WallViewItem, b: WallViewItem): number {
  return (b.taken_at ?? b.uploaded_at).localeCompare(a.taken_at ?? a.uploaded_at);
}

/* ------------------------------------------------------------------ */
/* URL persistence (pure query-string helpers — no window dependency). */
/* ------------------------------------------------------------------ */

export const MEDIA_VIEW_PARAM = "view";

function paramsOf(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

/** Read the persisted wall view (`?view=`), or null when absent/invalid. */
export function readViewParam(search: string): MediaWallView | null {
  const value = paramsOf(search).get(MEDIA_VIEW_PARAM);
  return value !== null && isMediaWallView(value) ? value : null;
}

/** Set `?view=` while preserving every other param. Returns the new search. */
export function writeViewParam(search: string, view: MediaWallView): string {
  const params = paramsOf(search);
  params.set(MEDIA_VIEW_PARAM, view);
  const out = params.toString();
  return out === "" ? "" : `?${out}`;
}
