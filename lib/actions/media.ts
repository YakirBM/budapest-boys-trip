"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { TRIP_ID } from "@/lib/data/trip";

/**
 * Media wall server actions (docs/06-features/07).
 * The storage upload itself is direct browser→storage (RLS-gated); these
 * actions own the row lifecycle with server-side validation of the path
 * scheme, mime and visibility. Signed URLs are NEVER inputs or outputs here.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface RegisterMediaItemInput {
  storagePath: string;
  thumbPath: string | null;
  mimeStored: string;
  mimeOriginal: string;
  bytesStored: number;
  bytesOriginal: number;
  width: number | null;
  height: number | null;
  sha256: string | null;
  dayNumber: number | null;
  caption: string | null;
  visibility: "group" | "private";
  clientItemId: string;
  title: string | null;
  originalFilename: string | null;
  albumId: string | null;
  linkedPlaceId: string | null;
  taggedMemberIds: string[];
  tags: string[];
}

export type RegisterMediaResult =
  | { ok: true; id: string; existing: boolean }
  | { ok: false; error: string };

const ERR = {
  invalid: "media.errors.generic",
  forbidden: "media.errors.forbidden",
  notFound: "media.errors.notFound",
} as const;

function validateMediaPath(path: string, userId: string): boolean {
  // trips/{tripId}/media|thumbnails/{userId}/{uuid}.webp — the trip segment is
  // validated by the DB (storage_trip_id); here we check ownership shape.
  const parts = path.split("/");
  return (
    parts.length === 5 &&
    parts[0] === "trips" &&
    (parts[2] === "media" || parts[2] === "thumbnails") &&
    parts[3] === userId &&
    parts[4]!.length > 0
  );
}

/** Insert the media row after a successful storage upload. Idempotent on clientItemId. */
export async function registerMediaItemAction(
  input: RegisterMediaItemInput,
): Promise<RegisterMediaResult> {
  const parsed = z
    .object({
      storagePath: z.string().min(8),
      thumbPath: z.string().min(8).nullable(),
      mimeStored: z.enum(["image/webp", "image/jpeg", "image/png", "image/heic"]),
      mimeOriginal: z.string().min(3).max(60),
      bytesStored: z.number().int().positive(),
      bytesOriginal: z.number().int().nonnegative(),
      width: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
      sha256: z.string().length(64).nullable(),
      dayNumber: z.number().int().min(1).max(5).nullable(),
      caption: z.string().max(200).nullable(),
      visibility: z.enum(["group", "private"]),
      clientItemId: z.string().min(8),
      title: z.string().trim().min(1).max(120).nullable(),
      originalFilename: z.string().trim().min(1).max(180).nullable(),
      albumId: z.string().uuid().nullable(),
      linkedPlaceId: z.string().uuid().nullable(),
      taggedMemberIds: z.array(z.string().uuid()).max(6),
      tags: z.array(z.string().trim().min(1).max(32)).max(20),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: ERR.invalid };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERR.forbidden };

  if (!validateMediaPath(parsed.data.storagePath, user.id)) {
    return { ok: false, error: ERR.forbidden };
  }

  // Idempotent retry: if the client id row already exists, return it.
  const existing = await supabase
    .from("media_items")
    .select("id")
    .eq("id", parsed.data.clientItemId)
    .maybeSingle();
  if (!existing.error && existing.data) {
    return { ok: true, id: String(existing.data["id"]), existing: true };
  }

  const inserted = await supabase
    .from("media_items")
    .insert({
      id: parsed.data.clientItemId,
      trip_id: TRIP_ID,
      uploader_id: user.id,
      storage_path: parsed.data.storagePath,
      thumbnail_path: parsed.data.thumbPath,
      media_type: "image",
      sha256: parsed.data.sha256,
      mime_original: parsed.data.mimeOriginal,
      mime_stored: parsed.data.mimeStored,
      bytes_original: parsed.data.bytesOriginal,
      size_bytes: parsed.data.bytesStored,
      width: parsed.data.width,
      height: parsed.data.height,
      day_number: parsed.data.dayNumber,
      caption: parsed.data.caption,
      visibility: parsed.data.visibility,
      status: "active",
      title: parsed.data.title,
      original_filename: parsed.data.originalFilename,
      album_id: parsed.data.albumId,
      linked_place_id: parsed.data.linkedPlaceId,
      tagged_member_ids: parsed.data.taggedMemberIds,
      tags: parsed.data.tags,
    })
    .select("id")
    .single();
  if (inserted.error) {
    console.error("registerMediaItem failed", inserted.error.message);
    return { ok: false, error: ERR.forbidden };
  }

  revalidatePath("/media");
  return { ok: true, id: String(inserted.data["id"]), existing: false };
}

export interface UpdateMediaMetadataInput {
  mediaId: string;
  title: string | null;
  caption: string | null;
  dayNumber: number | null;
  albumId: string | null;
  linkedPlaceId: string | null;
  taggedMemberIds: string[];
  tags: string[];
}

export async function updateMediaMetadataAction(input: UpdateMediaMetadataInput): Promise<ActionResult> {
  const parsed = z.object({
    mediaId: z.string().uuid(),
    title: z.string().trim().min(1).max(120).nullable(),
    caption: z.string().trim().max(200).nullable(),
    dayNumber: z.number().int().min(1).max(5).nullable(),
    albumId: z.string().uuid().nullable(),
    linkedPlaceId: z.string().uuid().nullable(),
    taggedMemberIds: z.array(z.string().uuid()).max(6),
    tags: z.array(z.string().trim().min(1).max(32)).max(20),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: ERR.invalid };
  const supabase = await getSupabaseServerClient();
  const user = (await supabase.auth.getClaims()).data?.claims?.sub;
  if (typeof user !== "string") return { ok: false, error: ERR.forbidden };
  const updated = await supabase.from("media_items").update({
    title: parsed.data.title,
    caption: parsed.data.caption,
    day_number: parsed.data.dayNumber,
    album_id: parsed.data.albumId,
    linked_place_id: parsed.data.linkedPlaceId,
    tagged_member_ids: parsed.data.taggedMemberIds,
    tags: [...new Set(parsed.data.tags.map((tag) => tag.toLocaleLowerCase("he-IL")))],
  }).eq("id", parsed.data.mediaId).eq("uploader_id", user).select("id").maybeSingle();
  if (updated.error || !updated.data) return { ok: false, error: ERR.forbidden };
  revalidatePath("/media");
  return { ok: true };
}

export async function createMediaAlbumAction(name: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = z.string().trim().min(1).max(80).safeParse(name);
  if (!parsed.success) return { ok: false, error: ERR.invalid };
  const supabase = await getSupabaseServerClient();
  const user = (await supabase.auth.getClaims()).data?.claims?.sub;
  if (typeof user !== "string") return { ok: false, error: ERR.forbidden };
  const inserted = await supabase.from("media_albums").insert({
    trip_id: TRIP_ID,
    name: parsed.data,
    created_by: user,
  }).select("id").single();
  if (inserted.error) return { ok: false, error: ERR.invalid };
  revalidatePath("/media");
  return { ok: true, id: String(inserted.data.id) };
}

/** Soft delete — uploader or trip owner only (RLS-verified server-side). */
export async function softDeleteMediaAction(mediaId: string): Promise<ActionResult> {
  if (!z.string().min(8).safeParse(mediaId).success) return { ok: false, error: ERR.invalid };
  const supabase = await getSupabaseServerClient();

  const updated = await supabase
    .from("media_items")
    .update({ status: "deleted" })
    .eq("id", mediaId)
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data) return { ok: false, error: ERR.forbidden };

  revalidatePath("/media");
  return { ok: true };
}

export async function setMediaVisibilityAction(
  mediaId: string,
  visibility: "group" | "private",
): Promise<ActionResult> {
  if (!z.string().min(8).safeParse(mediaId).success) return { ok: false, error: ERR.invalid };
  const supabase = await getSupabaseServerClient();

  // media_update policy: uploader only.
  const updated = await supabase
    .from("media_items")
    .update({ visibility })
    .eq("id", mediaId)
    .eq("uploader_id", (await supabase.auth.getUser()).data.user?.id ?? "00000000-0000-0000-0000-000000000000")
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data) return { ok: false, error: ERR.forbidden };

  revalidatePath("/media");
  return { ok: true };
}

export async function addMediaCommentAction(mediaId: string, body: string): Promise<ActionResult> {
  const parsed = z
    .object({
      mediaId: z.string().min(8),
      body: z.string().trim().min(1).max(280),
    })
    .safeParse({ mediaId, body });
  if (!parsed.success) return { ok: false, error: "media.errors.commentTooLong" };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERR.forbidden };

  const inserted = await supabase.from("media_reactions").insert({
    media_id: parsed.data.mediaId,
    member_id: user.id,
    kind: "comment",
    body: parsed.data.body,
  });
  if (inserted.error) {
    console.error("addMediaComment failed", inserted.error.message);
    return { ok: false, error: ERR.forbidden };
  }

  revalidatePath("/media");
  return { ok: true };
}

/** Toggle my like: insert or delete my single 'like' row (partial unique index). */
export async function toggleMediaLikeAction(
  mediaId: string,
  like: boolean,
): Promise<ActionResult> {
  if (!z.string().min(8).safeParse(mediaId).success) return { ok: false, error: ERR.invalid };
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERR.forbidden };

  if (like) {
    const inserted = await supabase.from("media_reactions").insert({
      media_id: mediaId,
      member_id: user.id,
      kind: "like",
      body: null,
    });
    // Duplicate like (race) is fine — unique index keeps one row.
    if (inserted.error && inserted.error.code !== "23505") {
      console.error("toggleMediaLike insert failed", inserted.error.message);
      return { ok: false, error: ERR.forbidden };
    }
  } else {
    const deleted = await supabase
      .from("media_reactions")
      .delete()
      .eq("media_id", mediaId)
      .eq("member_id", user.id)
      .eq("kind", "like");
    if (deleted.error) {
      console.error("toggleMediaLike delete failed", deleted.error.message);
      return { ok: false, error: ERR.forbidden };
    }
  }

  revalidatePath("/media");
  return { ok: true };
}
