import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side data access for the Media Wall (docs/06-features/07).
 * Metadata rows ONLY — signed URLs are minted client-side per batch and never
 * persisted. RLS hides other members' private items and soft-deleted rows.
 */

export interface MediaItemRow {
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
}

export interface MediaAlbumRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
}

export interface MediaPlaceRow {
  id: string;
  name: string;
}

export interface MediaReactionRow {
  id: string;
  media_id: string;
  member_id: string;
  kind: "like" | "comment";
  body: string | null;
  created_at: string;
}

export interface MediaBoard {
  items: MediaItemRow[];
  reactions: MediaReactionRow[];
  albums: MediaAlbumRow[];
  places: MediaPlaceRow[];
}

/** Hard cap for the MVP grid (no infinite scroll — simplification, reported). */
export const MEDIA_PAGE_LIMIT = 240;

export async function getMediaBoard(tripId: string): Promise<MediaBoard> {
  const supabase = await getSupabaseServerClient();

  const [res, albumsRes, placesRes] = await Promise.all([
    supabase
      .from("media_items")
      .select(
        "id,uploader_id,storage_path,thumbnail_path,width,height,day_number,caption,visibility,is_moment_of_day,uploaded_at,size_bytes,mime_stored,title,original_filename,album_id,linked_place_id,tagged_member_ids,tags",
      )
      .eq("trip_id", tripId)
      .eq("status", "active")
      .order("uploaded_at", { ascending: false })
      .limit(MEDIA_PAGE_LIMIT),
    supabase.from("media_albums").select("id,name,description,created_by").eq("trip_id", tripId).order("name"),
    supabase.from("places").select("id,name").eq("trip_id", tripId).neq("status", "rejected").order("name"),
  ]);
  if (res.error) throw res.error;
  if (albumsRes.error) throw albumsRes.error;
  if (placesRes.error) throw placesRes.error;

  const items = ((res.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row["id"]),
    uploader_id: String(row["uploader_id"]),
    storage_path: String(row["storage_path"]),
    thumbnail_path: row["thumbnail_path"] === null ? null : String(row["thumbnail_path"]),
    width: row["width"] === null ? null : Number(row["width"]),
    height: row["height"] === null ? null : Number(row["height"]),
    day_number: row["day_number"] === null ? null : Number(row["day_number"]),
    caption: row["caption"] === null ? null : String(row["caption"]),
    visibility: (row["visibility"] === "private" ? "private" : "group") as "group" | "private",
    is_moment_of_day: Boolean(row["is_moment_of_day"]),
    uploaded_at: String(row["uploaded_at"]),
    size_bytes: row["size_bytes"] === null ? null : Number(row["size_bytes"]),
    mime_stored: String(row["mime_stored"] ?? "image/webp"),
    title: row["title"] === null ? null : String(row["title"]),
    original_filename: row["original_filename"] === null ? null : String(row["original_filename"]),
    album_id: row["album_id"] === null ? null : String(row["album_id"]),
    linked_place_id: row["linked_place_id"] === null ? null : String(row["linked_place_id"]),
    tagged_member_ids: Array.isArray(row["tagged_member_ids"]) ? row["tagged_member_ids"].map(String) : [],
    tags: Array.isArray(row["tags"]) ? row["tags"].map(String) : [],
  }));

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

  return {
    items,
    albums: (albumsRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      description: row.description === null ? null : String(row.description),
      created_by: String(row.created_by),
    })),
    places: (placesRes.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
    reactions: ((reactionsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      media_id: String(row["media_id"]),
      member_id: String(row["member_id"]),
      kind: row["kind"] === "comment" ? "comment" : "like",
      body: row["body"] === null ? null : String(row["body"]),
      created_at: String(row["created_at"]),
    })),
  };
}
