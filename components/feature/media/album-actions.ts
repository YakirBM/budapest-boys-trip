"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createMediaAlbumAction } from "@/lib/actions/media";

/**
 * Client-side album/geo helpers for the Memory Wall (docs/14 §6).
 * New-column writes go through the RLS-gated browser client; when the 0022
 * migration has not been applied yet the insert/update fails and callers fall
 * back to the legacy server actions so the trusted upload pipeline never
 * breaks (migration-lag tolerance, docs/13 §8).
 */

export type AlbumVisibility = "shared" | "private";

export async function createAlbumWithVisibility(
  tripId: string,
  name: string,
  visibility: AlbumVisibility,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const clean = name.trim().slice(0, 80);
  if (clean === "") return { ok: false, error: "media.errors.albumCreate" };
  try {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "media.errors.forbidden" };
    const inserted = await supabase
      .from("media_albums")
      .insert({
        trip_id: tripId,
        name: clean,
        visibility,
        owner_id: user.id,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (!inserted.error && inserted.data) {
      return { ok: true, id: String((inserted.data as unknown as { id: string }).id) };
    }
    // Pre-migration schema (no visibility/owner_id columns): use the legacy path.
  } catch {
    // Network/auth failure: fall through to the legacy server action.
  }
  return createMediaAlbumAction(clean);
}

export interface MediaExtendedPatch {
  people?: string[];
  place_id?: string | null;
  address_text?: string | null;
  taken_at?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/**
 * Persist the §6 organization columns. Returns false when the migration has
 * not been applied or the write is denied — the legacy row written by the
 * server action stays valid, so callers treat false as a soft degradation.
 */
export async function updateMediaExtendedColumns(
  mediaId: string,
  patch: MediaExtendedPatch,
): Promise<boolean> {
  try {
    const supabase = getSupabaseBrowserClient();
    const updated = await supabase
      .from("media_items")
      .update(patch)
      .eq("id", mediaId)
      .select("id")
      .maybeSingle();
    return !updated.error && updated.data !== null;
  } catch {
    return false;
  }
}
