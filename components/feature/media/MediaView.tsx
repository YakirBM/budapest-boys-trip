"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, FolderPlus, Heart, Lock, Loader2, Pencil, Search, Star, Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { pushToast } from "@/components/ui/Toast";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cacheSnapshot, readSnapshot } from "@/lib/offline/db";
import {
  addMediaCommentAction,
  registerMediaItemAction,
  setMediaVisibilityAction,
  softDeleteMediaAction,
  toggleMediaLikeAction,
  updateMediaMetadataAction,
} from "@/lib/actions/media";
import type { MediaBoard, MediaPlaceRow, MediaReactionRow } from "@/lib/data/media";
import type { TripMember } from "@/lib/data/trip";
import { compressImage, isAllowedImageFile, sha256Hex, MAX_INPUT_BYTES } from "@/lib/utils/image";
import {
  collectMediaTags,
  DEFAULT_MEDIA_SORT,
  hasActiveMediaFilters,
  sortMediaItems,
  type MediaSortMode,
  type MediaVisibilityFilter,
} from "@/lib/utils/media";
import { getSignedUrls, peekSignedUrl } from "./signedUrlCache";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { ViewSwitcher } from "./ViewSwitcher";
import { AlbumsPane, DaysPane, MapPane, PeoplePane, PlacesPane } from "./MediaPanes";
import { createAlbumWithVisibility, updateMediaExtendedColumns } from "./album-actions";
import {
  isMediaWallView,
  peopleOf,
  placeOf,
  type MediaWallView,
  type WallViewItem,
} from "./media-views";

export interface MediaViewProps {
  tripId: string;
  initial: MediaBoard;
  members: TripMember[];
  userId: string;
  /** Current trip day clamped (docs/00 rule 1) — pre-trip uploads get null. */
  defaultDay: number | null;
  isPreTrip: boolean;
}

/**
 * Wall item: legacy row + §6 organization columns (migration 0022). New
 * columns fall back to their legacy mirrors so pre-migration rows stay valid.
 * Structurally compatible with WallViewItem (docs/14 §6.3, one source).
 */
export interface WallItem {
  id: string;
  uploader_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  width: number | null;
  height: number | null;
  day_number: number | null;
  caption: string | null;
  visibility: "group" | "private";
  is_moment_of_day: boolean;
  uploaded_at: string;
  size_bytes: number | null;
  mime_stored: string;
  title: string | null;
  original_filename: string | null;
  album_id: string | null;
  linked_place_id: string | null;
  tagged_member_ids: string[];
  tags: string[];
  people: string[];
  place_id: string | null;
  address_text: string | null;
  taken_at: string | null;
  lat: number | null;
  lng: number | null;
}

export interface WallAlbum {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  visibility: "shared" | "private";
  owner_id: string | null;
  cover_item_id: string | null;
}

interface MediaPayload {
  items: WallItem[];
  reactions: MediaReactionRow[];
  albums: WallAlbum[];
  places: MediaPlaceRow[];
  stale: boolean;
}

interface UploadTile {
  key: string;
  name: string;
  previewUrl: string;
  status: "uploading" | "done" | "failed";
}

const MEDIA_CACHE_KEY = "media";

const LEGACY_ITEM_SELECT =
  "id,uploader_id,storage_path,thumbnail_path,width,height,day_number,caption,visibility,is_moment_of_day,uploaded_at,size_bytes,mime_stored,title,original_filename,album_id,linked_place_id,tagged_member_ids,tags";
const FULL_ITEM_SELECT = `${LEGACY_ITEM_SELECT},people,place_id,address_text,taken_at,lat,lng`;
const LEGACY_ALBUM_SELECT = "id,name,description,created_by";
const FULL_ALBUM_SELECT = "id,name,description,created_by,visibility,owner_id,cover_item_id";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** PostgREST "unknown column" (PGRST204 / schema-cache) → retry legacy select. */
function isMissingColumnError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const record = err as Record<string, unknown>;
  const message = typeof record["message"] === "string" ? record["message"] : "";
  const code = typeof record["code"] === "string" ? record["code"] : "";
  return (
    code === "PGRST204" ||
    /column .* does not exist|schema cache|Could not find the '.*' column/i.test(message)
  );
}

function normalizeItem(row: Record<string, unknown>): WallItem {
  const linkedPlace = asOptionalString(row["linked_place_id"]);
  return {
    id: String(row["id"] ?? ""),
    uploader_id: String(row["uploader_id"] ?? ""),
    storage_path: String(row["storage_path"] ?? ""),
    thumbnail_path: asOptionalString(row["thumbnail_path"]),
    width: asNumberOrNull(row["width"]),
    height: asNumberOrNull(row["height"]),
    day_number: asNumberOrNull(row["day_number"]),
    caption: asOptionalString(row["caption"]),
    visibility: row["visibility"] === "private" ? "private" : "group",
    is_moment_of_day: Boolean(row["is_moment_of_day"]),
    uploaded_at: String(row["uploaded_at"] ?? ""),
    size_bytes: asNumberOrNull(row["size_bytes"]),
    mime_stored: asOptionalString(row["mime_stored"]) ?? "image/webp",
    title: asOptionalString(row["title"]),
    original_filename: asOptionalString(row["original_filename"]),
    album_id: asOptionalString(row["album_id"]),
    linked_place_id: linkedPlace,
    tagged_member_ids: asStringArray(row["tagged_member_ids"]),
    tags: asStringArray(row["tags"]),
    people: asStringArray(row["people"]),
    place_id: asOptionalString(row["place_id"]) ?? linkedPlace,
    address_text: asOptionalString(row["address_text"]),
    taken_at: asOptionalString(row["taken_at"]),
    lat: asNumberOrNull(row["lat"]),
    lng: asNumberOrNull(row["lng"]),
  };
}

function normalizeAlbum(row: Record<string, unknown>): WallAlbum {
  return {
    id: String(row["id"] ?? ""),
    name: String(row["name"] ?? ""),
    description: asOptionalString(row["description"]),
    created_by: String(row["created_by"] ?? ""),
    visibility: row["visibility"] === "private" ? "private" : "shared",
    owner_id: asOptionalString(row["owner_id"]),
    cover_item_id: asOptionalString(row["cover_item_id"]),
  };
}

function normalizeReaction(row: Record<string, unknown>): MediaReactionRow {
  return {
    id: String(row["id"]),
    media_id: String(row["media_id"]),
    member_id: String(row["member_id"]),
    kind: row["kind"] === "comment" ? "comment" : "like",
    body: row["body"] === null ? null : String(row["body"]),
    created_at: String(row["created_at"] ?? ""),
  };
}

async function fetchMedia(tripId: string): Promise<MediaPayload> {
  const supabase = getSupabaseBrowserClient();
  try {
    const itemsQuery = (select: string) =>
      supabase
        .from("media_items")
        .select(select)
        .eq("trip_id", tripId)
        .eq("status", "active")
        .order("uploaded_at", { ascending: false })
        .limit(240);
    const albumsQuery = (select: string) =>
      supabase.from("media_albums").select(select).eq("trip_id", tripId).order("name");
    const fetched = await Promise.all([
      itemsQuery(FULL_ITEM_SELECT),
      albumsQuery(FULL_ALBUM_SELECT),
      supabase.from("places").select("id,name").eq("trip_id", tripId).neq("status", "rejected").order("name"),
    ]);
    let itemsRes = fetched[0];
    let albumsRes = fetched[1];
    const placesRes = fetched[2];
    // Pre-0022 schema: the new organization columns do not exist yet.
    if (itemsRes.error && isMissingColumnError(itemsRes.error)) {
      itemsRes = await itemsQuery(LEGACY_ITEM_SELECT);
    }
    if (albumsRes.error && isMissingColumnError(albumsRes.error)) {
      albumsRes = await albumsQuery(LEGACY_ALBUM_SELECT);
    }
    if (itemsRes.error) throw itemsRes.error;
    if (albumsRes.error) throw albumsRes.error;
    if (placesRes.error) throw placesRes.error;
    const items = ((itemsRes.data ?? []) as unknown as Record<string, unknown>[]).map(normalizeItem);
    const itemIds = items.map((i) => i.id);
    const reactionsRes =
      itemIds.length > 0
        ? await supabase
            .from("media_reactions")
            .select("id,media_id,member_id,kind,body,created_at")
            .in("media_id", itemIds)
            .order("created_at", { ascending: true })
            .limit(5000)
        : { data: [], error: null };
    if (reactionsRes.error) throw reactionsRes.error;

    const payload: MediaPayload = {
      items,
      reactions: ((reactionsRes.data ?? []) as unknown as Record<string, unknown>[]).map(normalizeReaction),
      albums: ((albumsRes.data ?? []) as unknown as Record<string, unknown>[]).map(normalizeAlbum),
      places: (placesRes.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
      stale: false,
    };
    await cacheSnapshot(MEDIA_CACHE_KEY, {
      items: payload.items,
      reactions: payload.reactions,
      albums: payload.albums,
      places: payload.places,
    });
    return payload;
  } catch (err) {
    const snap = await readSnapshot<Omit<MediaPayload, "stale">>(MEDIA_CACHE_KEY);
    if (snap) {
      // Offline snapshot: rows may predate migration 0022 — normalize.
      const snapItems = (snap.data.items as unknown as Record<string, unknown>[]).map(normalizeItem);
      const snapAlbums = (snap.data.albums as unknown as Record<string, unknown>[]).map(normalizeAlbum);
      return { ...snap.data, items: snapItems, albums: snapAlbums, stale: true };
    }
    throw err;
  }
}

function ThumbImage({
  path,
  width,
  height,
  alt,
}: {
  path: string | null;
  width: number | null;
  height: number | null;
  alt: string;
}) {
  const [src, setSrc] = useState<string | null>(() => (path ? peekSignedUrl(path) : null));
  useEffect(() => {
    if (!path) return;
    let live = true;
    void getSignedUrls([path])
      .then((map) => {
        const url = map.get(path);
        if (live && url) setSrc(url);
      })
      .catch(() => {
        // Offline / signing failure: tile stays a placeholder (no URL caching).
      });
    return () => {
      live = false;
    };
  }, [path]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src ?? undefined}
      alt={alt}
      width={width ?? 400}
      height={height ?? 300}
      loading="lazy"
      decoding="async"
      onError={() => setSrc(null)}
      className="w-full object-cover"
      style={{ aspectRatio: width && height ? `${width} / ${height}` : "4 / 3" }}
    />
  );
}

/**
 * Media wall (docs/06-features/07): masonry grid of signed-URL thumbnails,
 * day/uploader filters, an online-only upload pipeline (client WebP compress →
 * direct storage upload → server-validated row insert), like/comment viewer,
 * private toggle and soft delete.
 */
export function MediaView({ tripId, initial, members, userId, defaultDay, isPreTrip }: MediaViewProps) {
  const queryClient = useQueryClient();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WallItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<WallItem | null>(null);
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [albumFilter, setAlbumFilter] = useState("");
  const [placeFilter, setPlaceFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<MediaVisibilityFilter>("all");
  const [likedOnly, setLikedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<MediaSortMode>(DEFAULT_MEDIA_SORT);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<MediaWallView>("albums");
  const [personFilter, setPersonFilter] = useState("");
  // Upload defaults (§6.1): applied to every photo picked in this session.
  const [upAlbumId, setUpAlbumId] = useState("");
  const [upNewAlbumName, setUpNewAlbumName] = useState("");
  const [upNewAlbumVisibility, setUpNewAlbumVisibility] = useState<"shared" | "private">("shared");
  const [upCreatingAlbum, setUpCreatingAlbum] = useState(false);
  const [upPeople, setUpPeople] = useState<string[]>([]);
  const [upPlaceId, setUpPlaceId] = useState("");
  const [upAddress, setUpAddress] = useState("");
  const [upLat, setUpLat] = useState<number | null>(null);
  const [upLng, setUpLng] = useState<number | null>(null);
  const [uploads, setUploads] = useState<UploadTile[]>([]);
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View + filters persist in URL params (?view=, ?day=, …) for deep-linking.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextView = params.get("view");
    if (nextView && isMediaWallView(nextView)) setView(nextView);
    const day = params.get("day");
    if (day !== null && ["1", "2", "3", "4", "5"].includes(day)) setDayFilter(Number(day));
    const album = params.get("album");
    if (album !== null) setAlbumFilter(album);
    const place = params.get("place");
    if (place !== null) setPlaceFilter(place);
    const person = params.get("person");
    if (person !== null) setPersonFilter(person);
    const tag = params.get("tag");
    if (tag !== null) setTagFilter(tag);
    const vis = params.get("vis");
    if (vis === "group" || vis === "private") setVisibilityFilter(vis);
    if (params.get("liked") === "1") setLikedOnly(true);
    if (params.get("mine") === "1") setMineOnly(true);
    const query = params.get("q");
    if (query !== null) setSearch(query);
    const sort = params.get("sort");
    if (sort === "newest" || sort === "oldest" || sort === "day" || sort === "title") setSortMode(sort);
  }, []);

  const skipUrlWrite = useRef(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (skipUrlWrite.current) {
      skipUrlWrite.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const set = (key: string, value: string): void => {
      if (value === "") params.delete(key);
      else params.set(key, value);
    };
    set("view", view);
    set("day", dayFilter === null ? "" : String(dayFilter));
    set("album", albumFilter);
    set("place", placeFilter);
    set("person", personFilter);
    set("tag", tagFilter);
    set("vis", visibilityFilter === "all" ? "" : visibilityFilter);
    set("liked", likedOnly ? "1" : "");
    set("mine", mineOnly ? "1" : "");
    set("q", search.trim());
    set("sort", sortMode === DEFAULT_MEDIA_SORT ? "" : sortMode);
    const next = params.toString();
    window.history.replaceState(null, "", next === "" ? window.location.pathname : `${window.location.pathname}?${next}`);
  }, [view, dayFilter, albumFilter, placeFilter, personFilter, tagFilter, visibilityFilter, likedOnly, mineOnly, search, sortMode]);

  const mediaQ = useQuery({
    queryKey: ["media", tripId],
    queryFn: () => fetchMedia(tripId),
    initialData: {
      items: (initial.items as unknown as Record<string, unknown>[]).map(normalizeItem),
      reactions: initial.reactions,
      albums: (initial.albums as unknown as Record<string, unknown>[]).map(normalizeAlbum),
      places: initial.places,
      stale: false,
    },
  });

  const nameOf = useMemo(() => new Map(members.map((m) => [m.user_id, m.full_name])), [members]);

  const likeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of mediaQ.data.reactions) {
      if (r.kind !== "like") continue;
      map.set(r.media_id, (map.get(r.media_id) ?? 0) + 1);
    }
    return map;
  }, [mediaQ.data.reactions]);

  const commentCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of mediaQ.data.reactions) {
      if (r.kind !== "comment") continue;
      map.set(r.media_id, (map.get(r.media_id) ?? 0) + 1);
    }
    return map;
  }, [mediaQ.data.reactions]);

  const likedIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of mediaQ.data.reactions) {
      if (r.kind === "like" && r.member_id === userId) set.add(r.media_id);
    }
    return set;
  }, [mediaQ.data.reactions, userId]);

  const availableTags = useMemo(() => collectMediaTags(mediaQ.data.items), [mediaQ.data.items]);

  const filtersActive =
    hasActiveMediaFilters({
      day: dayFilter,
      mineOnly,
      albumId: albumFilter,
      placeId: placeFilter,
      tag: tagFilter,
      visibility: visibilityFilter,
      likedOnly,
      search,
    }) || personFilter !== "";

  function resetFilters(): void {
    setDayFilter(null);
    setMineOnly(false);
    setAlbumFilter("");
    setPlaceFilter("");
    setPersonFilter("");
    setTagFilter("");
    setVisibilityFilter("all");
    setLikedOnly(false);
    setSearch("");
    setSortMode(DEFAULT_MEDIA_SORT);
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("he-IL");
    const matches = mediaQ.data.items.filter((item) => {
      const searchable = [
        item.title,
        item.caption,
        item.original_filename,
        item.address_text,
        ...item.tags,
        ...peopleOf(item).map((id) => nameOf.get(id) ?? ""),
        mediaQ.data.albums.find((album) => album.id === item.album_id)?.name,
        mediaQ.data.places.find((place) => place.id === placeOf(item))?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("he-IL");
      return (
        (dayFilter === null || item.day_number === dayFilter) &&
        (!mineOnly || item.uploader_id === userId) &&
        (albumFilter === "" || (albumFilter === "none" ? item.album_id === null : item.album_id === albumFilter)) &&
        (placeFilter === "" || (placeFilter === "none" ? placeOf(item) === null : placeOf(item) === placeFilter)) &&
        (personFilter === "" || (personFilter === "none" ? peopleOf(item).length === 0 : peopleOf(item).includes(personFilter))) &&
        (tagFilter === "" || item.tags.includes(tagFilter)) &&
        (visibilityFilter === "all" || item.visibility === visibilityFilter) &&
        (!likedOnly || likedIds.has(item.id)) &&
        (needle === "" || searchable.includes(needle))
      );
    });
    return sortMediaItems(matches, sortMode);
  }, [albumFilter, dayFilter, likedIds, likedOnly, mediaQ.data.albums, mediaQ.data.items, mediaQ.data.places, mineOnly, nameOf, personFilter, placeFilter, search, sortMode, tagFilter, userId, visibilityFilter]);

  const viewer = viewerId !== null ? mediaQ.data.items.find((i) => i.id === viewerId) ?? null : null;

  function patchCache(mediaId: string, mutate: (item: WallItem) => WallItem): void {
    queryClient.setQueryData<MediaPayload>(["media", tripId], (old) =>
      old
        ? { ...old, items: old.items.map((i) => (i.id === mediaId ? mutate(i) : i)) }
        : old,
    );
  }

  async function createUploadAlbum(): Promise<void> {
    if (upNewAlbumName.trim() === "") return;
    setUpCreatingAlbum(true);
    const result = await createAlbumWithVisibility(tripId, upNewAlbumName, upNewAlbumVisibility);
    setUpCreatingAlbum(false);
    if (!result.ok) {
      pushToast({ message: t("media.errors.albumCreate"), type: "danger" });
      return;
    }
    const created: WallAlbum = {
      id: result.id,
      name: upNewAlbumName.trim(),
      description: null,
      created_by: userId,
      visibility: upNewAlbumVisibility,
      owner_id: userId,
      cover_item_id: null,
    };
    queryClient.setQueryData<MediaPayload>(["media", tripId], (old) =>
      old ? { ...old, albums: [...old.albums, created].sort((a, b) => a.name.localeCompare(b.name, "he")) } : old,
    );
    setUpAlbumId(result.id);
    setUpNewAlbumName("");
    pushToast({ message: t("media.albumCreated"), type: "success" });
  }

  async function uploadOne(file: File, key: string): Promise<void> {
    const setStatus = (status: UploadTile["status"]): void =>
      setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status } : u)));
    const uploadedPaths: string[] = [];
    try {
      if (file.size > MAX_INPUT_BYTES) {
        pushToast({ message: t("media.fileTooLarge", { name: file.name }), type: "danger" });
        setStatus("failed");
        return;
      }
      if (!isAllowedImageFile(file)) {
        pushToast({ message: t("media.fileUnsupported", { name: file.name }), type: "danger" });
        setStatus("failed");
        return;
      }

      const comp = await compressImage(file);
      const storedMime = "image/webp" as const;
      const sha = await sha256Hex(comp.blob);
      const uuid = crypto.randomUUID();
      const mainPath = `trips/${tripId}/media/${userId}/${uuid}.webp`;
      const thumbBlobIsWebp = comp.thumbBlob !== comp.blob && comp.thumbBlob.type === "image/webp";
      const thumbPath = thumbBlobIsWebp ? `trips/${tripId}/thumbnails/${userId}/${uuid}.webp` : mainPath;

      const storage = getSupabaseBrowserClient().storage.from("trip-media");
      const mainUp = await storage.upload(mainPath, comp.blob, {
        contentType: storedMime,
        cacheControl: "31536000",
      });
      if (mainUp.error) throw mainUp.error;
      uploadedPaths.push(mainPath);
      if (thumbBlobIsWebp) {
        const thumbUp = await storage.upload(thumbPath, comp.thumbBlob, {
          contentType: "image/webp",
          cacheControl: "31536000",
        });
        if (thumbUp.error) throw thumbUp.error;
        uploadedPaths.push(thumbPath);
      }

      const reg = await registerMediaItemAction({
        storagePath: mainPath,
        thumbPath,
        mimeStored: storedMime,
        mimeOriginal: file.type || "application/octet-stream",
        bytesStored: comp.blob.size,
        bytesOriginal: file.size,
        width: comp.width > 0 ? comp.width : null,
        height: comp.height > 0 ? comp.height : null,
        sha256: sha,
        dayNumber: isPreTrip ? null : defaultDay,
        caption: null,
        visibility: "group",
        clientItemId: uuid,
        title: file.name.replace(/\.[^.]+$/, "").trim().slice(0, 120) || null,
        originalFilename: file.name.trim().slice(0, 180) || null,
        albumId: upAlbumId || null,
        linkedPlaceId: upPlaceId || null,
        taggedMemberIds: upPeople,
        tags: [],
      });
      if (!reg.ok) throw new Error(reg.error);

      // §6 organization columns (migration 0022). Best-effort: the legacy row
      // above is already valid, so a pre-migration schema only loses the
      // mirrors. GPS/taken_at stored solely from this user-picked file.
      if (upPeople.length > 0 || upPlaceId !== "" || upAddress.trim() !== "" || upLat !== null || upLng !== null) {
        await updateMediaExtendedColumns(reg.id, {
          people: upPeople,
          place_id: upPlaceId || null,
          address_text: upAddress.trim().slice(0, 240) || null,
          taken_at: new Date().toISOString(),
          lat: upLat,
          lng: upLng,
        });
      }

      setStatus("done");
      void queryClient.invalidateQueries({ queryKey: ["media", tripId] });
    } catch (err) {
      console.error("media upload failed", err);
      if (uploadedPaths.length > 0) {
        const cleanup = await getSupabaseBrowserClient().storage.from("trip-media").remove(uploadedPaths);
        if (cleanup.error) console.error("media upload cleanup failed", cleanup.error.message);
      }
      setStatus("failed");
      pushToast({
        message:
          err instanceof Error && err.message === "image_safe_reencode_failed"
            ? t("media.compressionFailed", { name: file.name })
            : t("media.uploadFailed"),
        type: "danger",
      });
    }
  }

  function onFilesPicked(input: HTMLInputElement): void {
    const list = Array.from(input.files ?? []);
    input.value = ""; // allow re-picking the same file
    if (list.length === 0) return;
    setUploadSheetOpen(false);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      pushToast({ message: t("media.requiresConnection"), type: "danger" });
      return;
    }
    const tiles: UploadTile[] = list.map((f) => ({
      key: crypto.randomUUID(),
      name: f.name,
      previewUrl: URL.createObjectURL(f),
      status: "uploading" as const,
    }));
    setUploads((prev) => [...tiles, ...prev]);
    // Two workers avoid memory spikes when several 15MB phone photos are picked.
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (nextIndex < list.length) {
        const index = nextIndex++;
        await uploadOne(list[index]!, tiles[index]!.key);
      }
    };
    void Promise.all(Array.from({ length: Math.min(2, list.length) }, () => worker()));
  }

  function toggleLike(item: WallItem): void {
    const liked = mediaQ.data.reactions.some((r) => r.kind === "like" && r.media_id === item.id && r.member_id === userId);
    const tempId = `temp-${crypto.randomUUID()}`;
    queryClient.setQueryData<MediaPayload>(["media", tripId], (old) =>
      old
        ? {
            ...old,
            reactions: liked
              ? old.reactions.filter((r) => !(r.kind === "like" && r.media_id === item.id && r.member_id === userId))
              : [
                  ...old.reactions,
                  { id: tempId, media_id: item.id, member_id: userId, kind: "like" as const, body: null, created_at: new Date().toISOString() },
                ],
          }
        : old,
    );
    void toggleMediaLikeAction(item.id, !liked).then((result) => {
      if (!result.ok) {
        pushToast({ message: t("media.errors.generic"), type: "danger" });
        void queryClient.invalidateQueries({ queryKey: ["media", tripId] });
      }
    });
  }

  function sendComment(item: WallItem, body: string): void {
    if (body.trim() === "") return;
    if (body.length > 280) {
      pushToast({ message: t("media.errors.commentTooLong"), type: "danger" });
      return;
    }
    const tempId = `temp-${crypto.randomUUID()}`;
    queryClient.setQueryData<MediaPayload>(["media", tripId], (old) =>
      old
        ? {
            ...old,
            reactions: [
              ...old.reactions,
              { id: tempId, media_id: item.id, member_id: userId, kind: "comment" as const, body: body.trim(), created_at: new Date().toISOString() },
            ],
          }
        : old,
    );
    void addMediaCommentAction(item.id, body.trim()).then((result) => {
      if (!result.ok) {
        pushToast({
          message: result.error === "media.errors.commentTooLong" ? t("media.errors.commentTooLong") : t("media.errors.generic"),
          type: "danger",
        });
        void queryClient.invalidateQueries({ queryKey: ["media", tripId] });
      }
    });
  }

  function togglePrivate(item: WallItem): void {
    const next = item.visibility === "private" ? "group" : "private";
    patchCache(item.id, (i) => ({ ...i, visibility: next }));
    void setMediaVisibilityAction(item.id, next).then((result) => {
      if (!result.ok) {
        pushToast({ message: t("media.errors.forbidden"), type: "danger" });
        void queryClient.invalidateQueries({ queryKey: ["media", tripId] });
      }
    });
  }

  function confirmDelete(): void {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteLoading(true);
    void softDeleteMediaAction(id)
      .then((result) => {
        setDeleteLoading(false);
        setDeleteTarget(null);
        setViewerId(null);
        if (!result.ok) {
          pushToast({ message: t("media.errors.forbidden"), type: "danger" });
          return;
        }
        queryClient.setQueryData<MediaPayload>(["media", tripId], (old) =>
          old ? { ...old, items: old.items.filter((i) => i.id !== id) } : old,
        );
        pushToast({ message: t("media.deletedToast"), type: "success" });
      })
      .catch(() => {
        setDeleteLoading(false);
        pushToast({ message: t("media.errors.generic"), type: "danger" });
      });
  }

  function renderTile(item: WallViewItem): ReactNode {
    const full = item as WallItem;
    return (
      <button
        key={full.id}
        type="button"
        onClick={() => setViewerId(full.id)}
        aria-label={full.title ?? full.caption ?? t("media.title")}
        className="relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-lg border border-border bg-surface-raised text-start active:opacity-80"
      >
        <ThumbImage
          path={full.thumbnail_path ?? full.storage_path}
          width={full.width}
          height={full.height}
          alt={full.title ?? full.caption ?? t("media.title")}
        />
        {full.is_moment_of_day && (
          <span aria-label={t("media.dayLabel", { day: full.day_number ?? 0 })} className="absolute top-1 end-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-warning/90 text-white">
            <Star aria-hidden size={14} />
          </span>
        )}
        {full.visibility === "private" && (
          <span aria-label={t("media.privateBadge")} className="absolute top-1 start-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
            <Lock aria-hidden size={13} />
          </span>
        )}
        {((likeCounts.get(full.id) ?? 0) > 0 || (commentCount.get(full.id) ?? 0) > 0) && (
          <span className="absolute bottom-1 end-1 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">
            <Heart aria-hidden size={11} />
            <span dir="ltr" className="tnum">{likeCounts.get(full.id) ?? 0}</span>
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      {/* Upload entry + hints */}
      <div className="mb-3 flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-hidden
          onChange={(e) => onFilesPicked(e.currentTarget)}
        />
        <button
          type="button"
          onClick={() => setUploadSheetOpen(true)}
          aria-label={t("media.uploadAria")}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-semibold text-brand-contrast transition-opacity active:opacity-80"
        >
          <Camera aria-hidden size={20} />
          {t("media.uploadButton")}
        </button>
        <p className="text-xs text-text-muted">
          {t("media.photosOnlyHint")} · {t("media.exifNote")}
        </p>
      </div>

      <BottomSheet
        open={uploadSheetOpen}
        onClose={() => setUploadSheetOpen(false)}
        title={t("media.uploadDetails")}
      >
        <div className="flex flex-col gap-3 pb-2">
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-sm font-bold text-text-primary">{t("media.uploadDetails")}</p>
          <p className="mt-0.5 text-xs text-text-muted">{t("media.uploadDetailsHint")}</p>
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold text-text-secondary">
              {t("media.albumField")}
              <select
                value={upAlbumId}
                onChange={(event) => setUpAlbumId(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-border bg-surface-raised px-3 text-sm text-text-primary outline-none focus:border-brand"
              >
                <option value="">{t("media.noAlbum")}</option>
                {mediaQ.data.albums.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.name}
                    {album.visibility === "private" ? ` (${t("media.visibilityPrivate")})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <input
                value={upNewAlbumName}
                onChange={(event) => setUpNewAlbumName(event.target.value)}
                maxLength={80}
                placeholder={t("media.newAlbumPlaceholder")}
                aria-label={t("media.newAlbumPlaceholder")}
                className="min-h-12 w-full min-w-0 flex-1 rounded-xl border border-border bg-surface-raised px-3 text-sm text-text-primary outline-none focus:border-brand"
              />
              <Button
                type="button"
                variant="secondary"
                loading={upCreatingAlbum}
                disabled={upNewAlbumName.trim() === ""}
                onClick={() => void createUploadAlbum()}
                icon={<FolderPlus size={18} />}
              >
                {t("media.createAlbum")}
              </Button>
            </div>
            <div className="flex gap-1.5" role="group" aria-label={t("media.albumVisibilityLabel")}>
              {(["shared", "private"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={upNewAlbumVisibility === mode}
                  onClick={() => setUpNewAlbumVisibility(mode)}
                  className={
                    upNewAlbumVisibility === mode
                      ? "inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-brand px-3 text-xs font-bold text-brand-contrast"
                      : "inline-flex min-h-10 flex-1 items-center justify-center rounded-full border border-border bg-surface-raised px-3 text-xs font-bold text-text-secondary"
                  }
                >
                  {mode === "shared" ? t("media.visibilityShared") : t("media.visibilityPrivate")}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted">
              {upNewAlbumVisibility === "shared" ? t("media.albumSharedHint") : t("media.albumPrivateHint")}
            </p>
            <fieldset className="rounded-xl border border-border p-3">
              <legend className="px-1 text-sm font-semibold text-text-secondary">{t("media.peopleField")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {members.map((member) => (
                  <label key={member.user_id} className="flex min-h-12 items-center gap-2 rounded-lg bg-surface-raised px-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={upPeople.includes(member.user_id)}
                      onChange={(event) =>
                        setUpPeople((current) =>
                          event.target.checked
                            ? [...current, member.user_id]
                            : current.filter((id) => id !== member.user_id),
                        )
                      }
                    />
                    <span className="truncate">{member.full_name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1 text-sm font-semibold text-text-secondary">
              {t("media.placeField")}
              <select
                value={upPlaceId}
                onChange={(event) => setUpPlaceId(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-border bg-surface-raised px-3 text-sm text-text-primary outline-none focus:border-brand"
              >
                <option value="">{t("media.noPlace")}</option>
                {mediaQ.data.places.map((place) => (
                  <option key={place.id} value={place.id}>{place.name}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1 text-sm font-semibold text-text-secondary">
              <span>{t("media.addressField")}</span>
              <AddressAutocomplete
                value={upAddress}
                onValueChange={(next) => {
                  setUpAddress(next);
                  setUpLat(null);
                  setUpLng(null);
                }}
                onSelect={(selection) => {
                  setUpAddress(selection.address);
                  setUpLat(selection.lat);
                  setUpLng(selection.lng);
                }}
              />
            </div>
            <p className="text-xs text-text-muted">{t("media.locationNote")}</p>
          </div>
        </div>
          <Button
            block
            icon={<Camera aria-hidden size={19} />}
            onClick={() => fileInputRef.current?.click()}
          >
            {t("media.uploadButton")}
          </Button>
        </div>
      </BottomSheet>

      {/* Upload tiles (indeterminate progress per file — simplification) */}
      {uploads.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold text-text-muted">
            {t("media.uploading", { count: uploads.filter((u) => u.status === "uploading").length })}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {uploads.map((tile) => (
              <div key={tile.key} className="relative overflow-hidden rounded-lg border border-border bg-surface-raised">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tile.previewUrl} alt={tile.name} className="aspect-square w-full object-cover" />
                <span
                  className={
                    tile.status === "uploading"
                      ? "absolute bottom-1 end-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white"
                      : tile.status === "done"
                        ? "absolute bottom-1 end-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-success/90 text-white"
                        : "absolute bottom-1 end-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-danger/90 text-white"
                  }
                  role={tile.status === "uploading" ? "status" : undefined}
                  aria-label={tile.status === "uploading" ? t("media.uploadPending") : tile.status === "done" ? t("media.uploadDone") : t("media.uploadFailed")}
                >
                  {tile.status === "uploading" ? (
                    <Loader2 aria-hidden size={14} className="animate-spin" />
                  ) : (
                    <span aria-hidden className="text-xs font-bold">
                      {tile.status === "done" ? "✓" : "!"}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="relative col-span-2">
          <Search aria-hidden size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <span className="sr-only">{t("media.searchLabel")}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("media.searchPlaceholder")}
            className="min-h-12 w-full rounded-xl border border-border bg-surface-raised pe-3 ps-10 text-sm text-text-primary outline-none focus:border-brand"
          />
        </label>
        <label>
          <span className="sr-only">{t("media.albumFilter")}</span>
          <select
            value={albumFilter}
            onChange={(event) => setAlbumFilter(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-secondary"
          >
            <option value="">{t("media.allAlbums")}</option>
            <option value="none">{t("media.unknownAlbum")}</option>
            {mediaQ.data.albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">{t("media.placeFilter")}</span>
          <select
            value={placeFilter}
            onChange={(event) => setPlaceFilter(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-secondary"
          >
            <option value="">{t("media.allPlaces")}</option>
            <option value="none">{t("media.unknownPlace")}</option>
            {mediaQ.data.places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select>
        </label>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-pressed={dayFilter === null}
          onClick={() => setDayFilter(null)}
          className={
            dayFilter === null
              ? "min-h-10 rounded-full bg-brand px-3 text-xs font-bold text-brand-contrast"
              : "min-h-10 rounded-full border border-border bg-surface px-3 text-xs font-bold text-text-secondary"
          }
        >
          {t("media.filterAllDays")}
        </button>
        {[1, 2, 3, 4, 5].map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={dayFilter === day}
            onClick={() => setDayFilter(day)}
            className={
              dayFilter === day
                ? "min-h-10 rounded-full bg-brand px-3 text-xs font-bold text-brand-contrast"
                : "min-h-10 rounded-full border border-border bg-surface px-3 text-xs font-bold text-text-secondary"
            }
          >
            {t("media.filterDay", { day })}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={mineOnly}
          onClick={() => setMineOnly((v) => !v)}
          className={
            mineOnly
              ? "min-h-10 rounded-full bg-brand px-3 text-xs font-bold text-brand-contrast"
              : "min-h-10 rounded-full border border-border bg-surface px-3 text-xs font-bold text-text-secondary"
          }
        >
          {t("media.filterMine")}
        </button>
        <button
          type="button"
          aria-pressed={likedOnly}
          onClick={() => setLikedOnly((v) => !v)}
          className={
            likedOnly
              ? "min-h-10 rounded-full bg-brand px-3 text-xs font-bold text-brand-contrast"
              : "min-h-10 rounded-full border border-border bg-surface px-3 text-xs font-bold text-text-secondary"
          }
        >
          {t("media.likedOnly")}
        </button>
        {filtersActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="min-h-10 rounded-full border border-danger/40 bg-surface px-3 text-xs font-bold text-danger"
          >
            {t("media.resetFilters")}
          </button>
        )}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label>
          <span className="sr-only">{t("media.sortLabel")}</span>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as MediaSortMode)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-secondary"
          >
            <option value="newest">{t("media.sortNewest")}</option>
            <option value="oldest">{t("media.sortOldest")}</option>
            <option value="day">{t("media.sortDay")}</option>
            <option value="title">{t("media.sortTitle")}</option>
          </select>
        </label>
        <label>
          <span className="sr-only">{t("media.visibilityLabel")}</span>
          <select
            value={visibilityFilter}
            onChange={(event) => setVisibilityFilter(event.target.value as MediaVisibilityFilter)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-secondary"
          >
            <option value="all">{t("media.visibilityAll")}</option>
            <option value="group">{t("media.visibilityGroup")}</option>
            <option value="private">{t("media.visibilityPrivate")}</option>
          </select>
        </label>
        <label className="col-span-2">
          <span className="sr-only">{t("media.tagLabel")}</span>
          <select
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-secondary"
          >
            <option value="">{t("media.allTags")}</option>
            {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </label>
      </div>

      {/* Views — one source, five panes (docs/14 §6.3) */}
      <ViewSwitcher view={view} onChange={setView} />

      {filtered.length === 0 ? (
        mediaQ.data.items.length === 0 ? (
          <EmptyState illustration="media" title={t("media.empty")} hint={t("media.emptyHint")} />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <EmptyState illustration="media" title={t("media.emptyFiltered")} hint={t("media.emptyFilteredHint")} />
            <Button variant="secondary" onClick={resetFilters}>
              {t("media.resetFilters")}
            </Button>
          </div>
        )
      ) : view === "map" ? (
        <MapPane items={filtered} onOpenItem={(id) => setViewerId(id)} />
      ) : view === "days" ? (
        <DaysPane items={filtered} renderTile={renderTile} />
      ) : view === "albums" ? (
        <AlbumsPane
          items={filtered}
          albums={mediaQ.data.albums}
          activeAlbumId={albumFilter === "" ? null : albumFilter}
          onSelectAlbum={(id) => setAlbumFilter(id ?? "")}
          renderTile={renderTile}
        />
      ) : view === "people" ? (
        <PeoplePane
          items={filtered}
          members={members}
          activePerson={personFilter}
          onSelectPerson={setPersonFilter}
          renderTile={renderTile}
        />
      ) : (
        <PlacesPane
          items={filtered}
          places={mediaQ.data.places}
          activePlace={placeFilter}
          onSelectPlace={setPlaceFilter}
          renderTile={renderTile}
        />
      )}

      {/* Viewer */}
      <BottomSheet
        open={viewer !== null}
        onClose={() => setViewerId(null)}
        title={viewer?.title ?? (viewer?.day_number === null || viewer === null ? t("media.title") : t("media.dayLabel", { day: viewer.day_number }))}
      >
        {viewer && (
          <div className="flex flex-col gap-3 pb-4">
            <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
              <ThumbImage
                path={viewer.storage_path}
                width={viewer.width}
                height={viewer.height}
                alt={viewer.title ?? viewer.caption ?? t("media.title")}
              />
            </div>

            <div className="flex flex-col gap-0.5 text-sm">
              <span className="font-semibold text-text-primary">
                {t("media.uploadedBy", { name: nameOf.get(viewer.uploader_id) ?? "—" })}
              </span>
              <span className="text-xs text-text-muted">
                {viewer.day_number === null ? t("media.noDay") : t("media.dayLabel", { day: viewer.day_number })}
                {viewer.visibility === "private" && ` · ${t("media.privateBadge")}`}
              </span>
              {viewer.caption && <p className="text-sm text-text-secondary">{viewer.caption}</p>}
              {(viewer.album_id || placeOf(viewer) || viewer.address_text || viewer.tags.length > 0 || peopleOf(viewer).length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-text-muted">
                  {viewer.album_id && <span className="rounded-full bg-brand-soft px-2 py-1">{mediaQ.data.albums.find((album) => album.id === viewer.album_id)?.name}</span>}
                  {placeOf(viewer) && <span className="rounded-full bg-brand-soft px-2 py-1">{mediaQ.data.places.find((place) => place.id === placeOf(viewer))?.name}</span>}
                  {viewer.address_text && <span dir="auto" className="rounded-full bg-brand-soft px-2 py-1">{viewer.address_text}</span>}
                  {peopleOf(viewer).map((id) => <span key={id} className="rounded-full bg-surface px-2 py-1">{nameOf.get(id)}</span>)}
                  {viewer.tags.map((tag) => <span key={tag} className="rounded-full bg-surface px-2 py-1">#{tag}</span>)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleLike(viewer)}
                aria-label={t("media.likeAria")}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-bold text-text-secondary transition-opacity active:opacity-80"
              >
                <Heart
                  aria-hidden
                  size={18}
                  className={
                    mediaQ.data.reactions.some((r) => r.kind === "like" && r.media_id === viewer.id && r.member_id === userId)
                      ? "fill-danger text-danger"
                      : ""
                  }
                />
                <span dir="ltr" className="tnum">{likeCounts.get(viewer.id) ?? 0}</span>
              </button>
              {viewer.uploader_id === userId && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setViewerId(null);
                      setEditTarget(viewer);
                    }}
                    className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-bold text-text-secondary"
                  >
                    <Pencil aria-hidden size={16} />
                    {t("media.editMetadata")}
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePrivate(viewer)}
                    aria-pressed={viewer.visibility === "private"}
                    className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-bold text-text-secondary transition-opacity active:opacity-80"
                  >
                    <Lock aria-hidden size={16} />
                    {t("media.privateToggle")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(viewer)}
                    aria-label={t("media.deletePhoto")}
                    className="inline-flex min-h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface text-text-muted transition-colors active:text-danger"
                  >
                    <Trash2 aria-hidden size={18} />
                  </button>
                </>
              )}
            </div>

            <CommentsBlock
              reactions={mediaQ.data.reactions.filter((r) => r.media_id === viewer.id)}
              nameOf={nameOf}
              onSend={(body) => sendComment(viewer, body)}
            />
          </div>
        )}
      </BottomSheet>

      <MediaEditSheet
        key={editTarget?.id ?? "closed"}
        item={editTarget}
        albums={mediaQ.data.albums}
        places={mediaQ.data.places}
        members={members}
        tripId={tripId}
        userId={userId}
        onClose={() => setEditTarget(null)}
        onSaved={(updated) => {
          patchCache(updated.id, () => updated);
          setEditTarget(null);
        }}
        onAlbumCreated={(album) => {
          queryClient.setQueryData<MediaPayload>(["media", tripId], (old) =>
            old ? { ...old, albums: [...old.albums, album].sort((a, b) => a.name.localeCompare(b.name, "he")) } : old,
          );
        }}
      />

      <ConfirmSheet
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleteLoading}
        title={t("media.deleteConfirmTitle")}
        description={t("media.deleteDescription")}
        confirmLabel={t("common.delete")}
      />
    </>
  );
}

function MediaEditSheet({
  item,
  albums,
  places,
  members,
  tripId,
  userId,
  onClose,
  onSaved,
  onAlbumCreated,
}: {
  item: WallItem | null;
  albums: WallAlbum[];
  places: MediaPlaceRow[];
  members: TripMember[];
  tripId: string;
  userId: string;
  onClose: () => void;
  onSaved: (item: WallItem) => void;
  onAlbumCreated: (album: WallAlbum) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [caption, setCaption] = useState(item?.caption ?? "");
  const [day, setDay] = useState(item?.day_number?.toString() ?? "");
  const [albumId, setAlbumId] = useState(item?.album_id ?? "");
  const [placeId, setPlaceId] = useState(item?.place_id ?? item?.linked_place_id ?? "");
  const [tagged, setTagged] = useState<string[]>(() =>
    item ? Array.from(new Set([...item.people, ...item.tagged_member_ids])) : [],
  );
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");
  const [newAlbum, setNewAlbum] = useState("");
  const [albumVisibility, setAlbumVisibility] = useState<"shared" | "private">("shared");
  const [addressText, setAddressText] = useState(item?.address_text ?? "");
  const [addrLat, setAddrLat] = useState<number | null>(item?.lat ?? null);
  const [addrLng, setAddrLng] = useState<number | null>(item?.lng ?? null);
  const [takenAt, setTakenAt] = useState(item?.taken_at ? item.taken_at.slice(0, 16) : "");
  const [saving, setSaving] = useState(false);
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  async function createAlbum(): Promise<void> {
    if (!item || newAlbum.trim() === "") return;
    setCreatingAlbum(true);
    const result = await createAlbumWithVisibility(tripId, newAlbum, albumVisibility);
    setCreatingAlbum(false);
    if (!result.ok) {
      pushToast({ message: t("media.errors.albumCreate"), type: "danger" });
      return;
    }
    const album: WallAlbum = {
      id: result.id,
      name: newAlbum.trim(),
      description: null,
      created_by: item.uploader_id,
      visibility: albumVisibility,
      owner_id: userId,
      cover_item_id: null,
    };
    onAlbumCreated(album);
    setAlbumId(result.id);
    setNewAlbum("");
    pushToast({ message: t("media.albumCreated"), type: "success" });
  }

  async function save(): Promise<void> {
    if (!item) return;
    const normalizedTags = [...new Set(tags.split(/[,#]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
    const cleanAddress = addressText.trim().slice(0, 240) || null;
    let cleanTakenAt: string | null = null;
    if (takenAt !== "") {
      const parsed = Date.parse(takenAt);
      if (Number.isNaN(parsed)) {
        pushToast({ message: t("media.errors.metadataSave"), type: "danger" });
        return;
      }
      cleanTakenAt = new Date(parsed).toISOString();
    }
    setSaving(true);
    const result = await updateMediaMetadataAction({
      mediaId: item.id,
      title: title.trim() || null,
      caption: caption.trim() || null,
      dayNumber: day === "" ? null : Number(day),
      albumId: albumId || null,
      linkedPlaceId: placeId || null,
      taggedMemberIds: tagged,
      tags: normalizedTags,
    });
    if (!result.ok) {
      setSaving(false);
      pushToast({ message: t("media.errors.metadataSave"), type: "danger" });
      return;
    }
    // §6 mirrors: the same people/place land on the new columns (best-effort;
    // the legacy row above is already valid on a pre-migration schema).
    await updateMediaExtendedColumns(item.id, {
      people: tagged,
      place_id: placeId || null,
      address_text: cleanAddress,
      taken_at: cleanTakenAt,
      lat: addrLat,
      lng: addrLng,
    });
    setSaving(false);
    onSaved({
      ...item,
      title: title.trim() || null,
      caption: caption.trim() || null,
      day_number: day === "" ? null : Number(day),
      album_id: albumId || null,
      linked_place_id: placeId || null,
      tagged_member_ids: tagged,
      tags: normalizedTags.map((tag) => tag.toLocaleLowerCase("he-IL")),
      people: tagged,
      place_id: placeId || null,
      address_text: cleanAddress,
      taken_at: cleanTakenAt,
      lat: addrLat,
      lng: addrLng,
    });
    pushToast({ message: t("media.metadataSaved"), type: "success" });
  }

  const fieldClass = "min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand";

  return (
    <BottomSheet open={item !== null} onClose={onClose} title={t("media.editMetadata")}>
      {item && (
        <form
          className="flex flex-col gap-3 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-semibold text-text-secondary">
            {t("media.titleLabel")}
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-text-secondary">
            {t("media.captionLabel")}
            <textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={200} rows={3} className={`${fieldClass} py-3`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-text-secondary">
              {t("media.dayField")}
              <select value={day} onChange={(event) => setDay(event.target.value)} className={fieldClass}>
                <option value="">{t("media.noDay")}</option>
                {[1, 2, 3, 4, 5].map((number) => <option key={number} value={number}>{t("media.filterDay", { day: number })}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-text-secondary">
              {t("media.placeField")}
              <select value={placeId} onChange={(event) => setPlaceId(event.target.value)} className={fieldClass}>
                <option value="">{t("media.noPlace")}</option>
                {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-semibold text-text-secondary">
            {t("media.albumField")}
            <select value={albumId} onChange={(event) => setAlbumId(event.target.value)} className={fieldClass}>
              <option value="">{t("media.noAlbum")}</option>
              {albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <input
              value={newAlbum}
              onChange={(event) => setNewAlbum(event.target.value)}
              maxLength={80}
              placeholder={t("media.newAlbumPlaceholder")}
              aria-label={t("media.newAlbumPlaceholder")}
              className={`${fieldClass} min-w-0 flex-1`}
            />
            <Button type="button" variant="secondary" loading={creatingAlbum} disabled={newAlbum.trim() === ""} onClick={() => void createAlbum()} icon={<FolderPlus size={18} />}>
              {t("media.createAlbum")}
            </Button>
          </div>
          <div className="flex gap-1.5" role="group" aria-label={t("media.albumVisibilityLabel")}>
            {(["shared", "private"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={albumVisibility === mode}
                onClick={() => setAlbumVisibility(mode)}
                className={
                  albumVisibility === mode
                    ? "inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-brand px-3 text-xs font-bold text-brand-contrast"
                    : "inline-flex min-h-10 flex-1 items-center justify-center rounded-full border border-border bg-surface px-3 text-xs font-bold text-text-secondary"
                }
              >
                {mode === "shared" ? t("media.visibilityShared") : t("media.visibilityPrivate")}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted">
            {albumVisibility === "shared" ? t("media.albumSharedHint") : t("media.albumPrivateHint")}
          </p>
          <fieldset className="rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-semibold text-text-secondary">{t("media.peopleField")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {members.map((member) => (
                <label key={member.user_id} className="flex min-h-12 items-center gap-2 rounded-lg bg-surface px-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={tagged.includes(member.user_id)}
                    onChange={(event) => setTagged((current) => event.target.checked ? [...current, member.user_id] : current.filter((id) => id !== member.user_id))}
                  />
                  <span className="truncate">{member.full_name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-semibold text-text-secondary">
            {t("media.tagsField")}
            <input value={tags} onChange={(event) => setTags(event.target.value)} maxLength={660} placeholder={t("media.tagsPlaceholder")} className={fieldClass} />
          </label>
          <div className="flex flex-col gap-1 text-sm font-semibold text-text-secondary">
            <span>{t("media.addressField")}</span>
            <AddressAutocomplete
              value={addressText}
              onValueChange={(next) => {
                setAddressText(next);
                setAddrLat(null);
                setAddrLng(null);
              }}
              onSelect={(selection) => {
                setAddressText(selection.address);
                setAddrLat(selection.lat);
                setAddrLng(selection.lng);
              }}
            />
          </div>
          <label className="flex flex-col gap-1 text-sm font-semibold text-text-secondary">
            {t("media.takenAtLabel")}
            <input
              type="datetime-local"
              value={takenAt}
              onChange={(event) => setTakenAt(event.target.value)}
              className={fieldClass}
              dir="ltr"
            />
          </label>
          <p className="text-xs text-text-muted">{t("media.locationNote")}</p>
          <Button type="submit" block loading={saving}>{t("common.save")}</Button>
        </form>
      )}
    </BottomSheet>
  );
}

function CommentsBlock({
  reactions,
  nameOf,
  onSend,
}: {
  reactions: MediaReactionRow[];
  nameOf: Map<string, string>;
  onSend: (body: string) => void;
}) {
  const [text, setText] = useState("");
  const comments = reactions.filter((r) => r.kind === "comment");

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <h3 className="mb-2 text-sm font-bold text-text-primary">{t("media.commentsTitle")}</h3>
      {comments.length === 0 ? (
        <p className="pb-2 text-xs text-text-muted">{t("media.noComments")}</p>
      ) : (
        <ul className="mb-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg bg-surface-raised px-3 py-2">
              <span className="text-xs font-bold text-text-primary">{nameOf.get(c.member_id) ?? "—"}</span>
              <p className="text-sm text-text-secondary">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSend(text);
          setText("");
        }}
      >
        <input
          type="text"
          value={text}
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("media.commentPlaceholder")}
          aria-label={t("media.commentPlaceholder")}
          className="min-h-12 flex-1 rounded-xl border border-border bg-surface-raised px-3 text-sm text-text-primary outline-none focus:border-brand"
        />
        <Button type="submit" disabled={text.trim() === ""}>
          {t("media.commentSend")}
        </Button>
      </form>
    </div>
  );
}
