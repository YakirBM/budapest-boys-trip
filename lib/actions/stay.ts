"use server";

/**
 * Stay server actions — zod-validated (docs/06-features/03-accommodation.md).
 * Mode A: candidates + favorites → poll. Mode B: logged reveal of the door code.
 * Never fabricates a booking: nothing here sets status='booked'.
 */
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, TRIP_ID } from "@/lib/data/trip";
import { t } from "@/lib/i18n";

export type ActionError = "auth" | "network" | "forbidden" | "validation" | "generic";
export type ActionResult = { ok: true } | { ok: false; error: ActionError };
export type PollResult =
  | { ok: true; pollId: string }
  | { ok: false; error: ActionError };
export type RevealResult =
  | { ok: true; value: string }
  | { ok: false; error: ActionError };

function toError(err: unknown): ActionError {
  const message = String((err as { message?: string })?.message ?? err ?? "");
  if (/auth/i.test(message)) return "auth";
  if (/row-level security|permission|forbidden/i.test(message)) return "forbidden";
  if (/fetch|network|timeout/i.test(message)) return "network";
  return "generic";
}

const candidateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  district: z.string().trim().max(40).optional(),
  beds: z.number().int().min(1).max(20).optional(),
  totalPrice: z.number().nonnegative().optional(),
  currency: z.enum(["HUF", "ILS", "EUR", "USD"]).default("HUF"),
  url: z.string().trim().url().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional(),
});

export type CandidateInput = z.infer<typeof candidateSchema>;

/** Add a candidate apartment (Mode A). District is kept as a notes prefix — the
 * implemented schema has no district column (docs/03 §13). */
export async function addCandidate(input: CandidateInput): Promise<ActionResult> {
  const parsed = candidateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation" };
  const { name, district, beds, totalPrice, currency, url, notes } = parsed.data;
  try {
    const supabase = await getSupabaseServerClient();
    await requireUser();
    const notesParts: string[] = [];
    if (district) notesParts.push(`רובע: ${district}`);
    if (notes) notesParts.push(notes);
    const { error } = await supabase.from("accommodations").insert({
      trip_id: TRIP_ID,
      name,
      status: "candidate",
      beds: beds ?? null,
      total_price: totalPrice ?? null,
      currency,
      url: url ? url : null,
      notes: notesParts.length > 0 ? notesParts.join("\n") : null,
    });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error("addCandidate failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["candidate", "favorite", "rejected"]),
});

export async function setCandidateStatus(input: z.infer<typeof statusSchema>): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation" };
  try {
    const supabase = await getSupabaseServerClient();
    await requireUser();
    const { error } = await supabase
      .from("accommodations")
      .update({ status: parsed.data.status })
      .eq("id", parsed.data.id)
      .eq("trip_id", TRIP_ID)
      .neq("status", "booked");
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error("setCandidateStatus failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

/** "הפוך להצבעה" — creates a poll from all favorite candidates (doc 03 §Cross-link). */
export async function createStayPoll(): Promise<PollResult> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();

    const { data: favorites, error: favErr } = await supabase
      .from("accommodations")
      .select("id, name, total_price, currency, url")
      .eq("trip_id", TRIP_ID)
      .eq("status", "favorite")
      .order("created_at");
    if (favErr) throw favErr;
    if (!favorites || favorites.length === 0) return { ok: false, error: "validation" };

    // Poll deadline: 48h from creation (long before the 2026-09-20 booking deadline).
    const deadline = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const { data: poll, error: pollErr } = await supabase
      .from("polls")
      .insert({
        trip_id: TRIP_ID,
        question: t("stay.pollQuestion"),
        status: "open",
        deadline,
        quorum_rule: "majority",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (pollErr) throw pollErr;
    if (!poll) return { ok: false, error: "generic" };

    const { error: optErr } = await supabase.from("poll_options").insert(
      favorites.map((fav, index) => ({
        poll_id: poll.id,
        label: fav.name,
        est_cost: fav.total_price,
        currency: fav.currency,
        availability_note: fav.url,
        source: "manual",
        sort_order: index * 10,
      })),
    );
    if (optErr) throw optErr;
    return { ok: true, pollId: poll.id };
  } catch (err) {
    console.error("createStayPoll failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

const revealSchema = z.object({
  accommodationId: z.string().uuid(),
  field: z.enum(["door_code", "wifi_password"]),
});

/**
 * Masked-until-tap reveal (door code / Wi-Fi password). The value is never
 * included in the RSC payload — each reveal writes an app_events audit row.
 */
export async function revealStaySecret(input: z.infer<typeof revealSchema>): Promise<RevealResult> {
  const parsed = revealSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation" };
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const { data, error } = await supabase
      .from("accommodations")
      .select("id, door_code, wifi_password")
      .eq("id", parsed.data.accommodationId)
      .eq("trip_id", TRIP_ID)
      .limit(1);
    if (error) throw error;
    const row = data?.[0];
    const raw = parsed.data.field === "door_code" ? row?.door_code : row?.wifi_password;
    if (!row || typeof raw !== "string" || raw.trim() === "") {
      return { ok: false, error: "validation" };
    }
    const { error: logErr } = await supabase.from("app_events").insert({
      trip_id: TRIP_ID,
      actor_id: user.id,
      action: parsed.data.field === "door_code" ? "reveal.door_code" : "reveal.wifi_password",
      entity: "accommodations",
      entity_id: row.id,
      meta: { field: parsed.data.field },
    });
    if (logErr) throw logErr;
    // Revealed only after the audit row above was written. The RSC payload
    // carries the masked form; this is the single unmasking path.
    return { ok: true, value: raw };
  } catch (err) {
    console.error("revealStaySecret failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}
