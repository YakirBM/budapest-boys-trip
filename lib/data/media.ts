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
}

/** Hard cap for the MVP grid (no infinite scroll — simplification, reported). */
export const MEDIA_PAGE_LIMIT = 240;

export async function getMediaBoard(tripId: string): Promise<MediaBoard> {
  const supabase = await getSupabaseServerClient();

  const res = await supabase
    .from("media_items")
    .select(
      "id,uploader_id,storage_path,thumbnail_path,width,height,day_number,caption,visibility,is_moment_of_day,uploaded_at,size_bytes,mime_stored",
    )
    .eq("trip_id", tripId)
    .eq("status", "active")
    .order("uploaded_at", { ascending: false })
    .limit(MEDIA_PAGE_LIMIT);
  if (res.error) throw res.error;

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
