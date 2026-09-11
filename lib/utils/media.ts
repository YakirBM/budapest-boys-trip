/** Pure media-wall helpers (docs/06-features/07): sorting, tag collection and
 * filter-state inspection. Kept side-effect free so the wall matrix is unit
 * testable without a browser or Supabase session. */

export type MediaSortMode = "newest" | "oldest" | "day" | "title";

export type MediaVisibilityFilter = "all" | "group" | "private";

export interface SortableMediaItem {
  uploaded_at: string;
  day_number: number | null;
  title: string | null;
  caption: string | null;
}

export interface MediaFilterSnapshot {
  day: number | null;
  mineOnly: boolean;
  albumId: string;
  placeId: string;
  tag: string;
  visibility: MediaVisibilityFilter;
  likedOnly: boolean;
  search: string;
}

export const DEFAULT_MEDIA_SORT: MediaSortMode = "newest";

export const DEFAULT_MEDIA_FILTERS: MediaFilterSnapshot = {
  day: null,
  mineOnly: false,
  albumId: "",
  placeId: "",
  tag: "",
  visibility: "all",
  likedOnly: false,
  search: "",
};

/** True when any wall filter narrows the result set (sort mode excluded). */
export function hasActiveMediaFilters(filters: MediaFilterSnapshot): boolean {
  return (
    filters.day !== null ||
    filters.mineOnly ||
    filters.albumId !== "" ||
    filters.placeId !== "" ||
    filters.tag !== "" ||
    filters.visibility !== "all" ||
    filters.likedOnly ||
    filters.search.trim() !== ""
  );
}

function titleOf(item: SortableMediaItem): string {
  return (item.title ?? item.caption ?? "").toLocaleLowerCase("he-IL");
}

/**
 * Deterministic wall ordering. "day" groups pre-trip (null day) last and falls
 * back to newest-first inside a day; "title" uses Hebrew collation.
 */
export function sortMediaItems<T extends SortableMediaItem>(items: readonly T[], mode: MediaSortMode): T[] {
  const copy = [...items];
  switch (mode) {
    case "oldest":
      copy.sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
      break;
    case "day":
      copy.sort((a, b) => {
        if (a.day_number === null && b.day_number === null) return b.uploaded_at.localeCompare(a.uploaded_at);
        if (a.day_number === null) return 1;
        if (b.day_number === null) return -1;
        if (a.day_number !== b.day_number) return a.day_number - b.day_number;
        return b.uploaded_at.localeCompare(a.uploaded_at);
      });
      break;
    case "title":
      copy.sort((a, b) => titleOf(a).localeCompare(titleOf(b), "he"));
      break;
    case "newest":
    default:
      copy.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
      break;
  }
  return copy;
}

/** Distinct manual tags across the loaded wall slice, Hebrew-collated, capped. */
export function collectMediaTags(items: readonly { tags: string[] }[], limit = 60): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags) {
      const clean = tag.trim();
      if (clean !== "") seen.add(clean);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "he")).slice(0, Math.max(0, limit));
}
