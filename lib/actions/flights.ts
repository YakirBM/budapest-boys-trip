"use server";

/**
 * Flights server actions — zod-validated, typed results (docs/06-features/02).
 * Rules honored here:
 * - Verification of arrival times is a HUMAN task: the checkbox only records
 *   "checked on Arkia" as an app_events row — arr_time itself is never written.
 * - Documents go to the PRIVATE trip-documents bucket under the owner's path;
 *   signed URLs (1h TTL) are minted on demand and never persisted.
 */
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, TRIP_ID } from "@/lib/data/trip";

export type ActionError = "auth" | "network" | "forbidden" | "validation" | "generic";
export type ActionResult = { ok: true } | { ok: false; error: ActionError };
export type UrlResult = { ok: true; url: string } | { ok: false; error: ActionError };

function toError(err: unknown): ActionError {
  const message = String((err as { message?: string })?.message ?? err ?? "");
  if (/auth/i.test(message)) return "auth";
  if (/row-level security|permission|forbidden/i.test(message)) return "forbidden";
  if (/fetch|network|timeout/i.test(message)) return "network";
  return "generic";
}

const uuidSchema = z.string().uuid();

/** Toggle MY check-in on a flight — RLS restricts the UPDATE to my own row. */
export async function markMyCheckin(flightId: string, checkedIn: boolean): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(flightId);
  if (!parsedId.success) return { ok: false, error: "validation" };
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const { error } = await supabase
      .from("flight_passengers")
      .update({
        checked_in: checkedIn,
        checkin_done_at: checkedIn ? new Date().toISOString() : null,
      })
      .eq("flight_id", parsedId.data)
      .eq("member_id", user.id);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error("markMyCheckin failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

/**
 * Record "I cross-checked the arrival time on Arkia" — an audit event only.
 * The actual arr_time update remains a human/owner task (hard rule 5).
 * Offline path: the client enqueues the same app_events insert into the outbox.
 */
export async function recordArrivalChecked(flightId: string): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(flightId);
  if (!parsedId.success) return { ok: false, error: "validation" };
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const { error } = await supabase.from("app_events").insert({
      trip_id: TRIP_ID,
      actor_id: user.id,
      action: "verify.arrival",
      entity: "flights",
      entity_id: parsedId.data,
      meta: { channel: "online" },
    });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error("recordArrivalChecked failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

const ETICKET_MAX_BYTES = 10 * 1024 * 1024; // trip-documents bucket limit
const ETICKET_MIME = "application/pdf";

/** Upload MY personal copy of the e-ticket PDF (private, owner-only). */
export async function uploadEticket(formData: FormData): Promise<ActionResult> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "validation" };
    if (file.size <= 0 || file.size > ETICKET_MAX_BYTES) return { ok: false, error: "validation" };
    if (file.type !== ETICKET_MIME) return { ok: false, error: "validation" };

    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const path = `trips/${TRIP_ID}/documents/${user.id}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("trip-documents")
      .upload(path, file, { contentType: ETICKET_MIME, upsert: false });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from("documents").insert({
      trip_id: TRIP_ID,
      owner_id: user.id,
      document_type: "eticket",
      title: "Arkia e-ticket 1385•••93",
      storage_path: path,
      mime: ETICKET_MIME,
      bytes: file.size,
      is_private: true,
    });
    if (insertError) throw insertError;
    return { ok: true };
  } catch (err) {
    console.error("uploadEticket failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

/** Mint a 1h signed URL for MY e-ticket copy. Returned transiently — never cached. */
export async function openEticket(documentId: string): Promise<UrlResult> {
  const parsedId = uuidSchema.safeParse(documentId);
  if (!parsedId.success) return { ok: false, error: "validation" };
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const { data, error } = await supabase
      .from("documents")
      .select("storage_path")
      .eq("id", parsedId.data)
      .eq("owner_id", user.id)
      .eq("document_type", "eticket")
      .limit(1);
    if (error) throw error;
    const path = data?.[0]?.storage_path;
    if (!path) return { ok: false, error: "forbidden" };
    const { data: signed, error: signError } = await supabase.storage
      .from("trip-documents")
      .createSignedUrls([path], 3600);
    if (signError || !signed?.[0]?.signedUrl) return { ok: false, error: "generic" };
    return { ok: true, url: signed[0].signedUrl };
  } catch (err) {
    console.error("openEticket failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}
