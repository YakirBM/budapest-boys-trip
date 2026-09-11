"use server";

import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, TRIP_ID } from "@/lib/data/trip";
import { LEGAL_TRANSITIONS } from "@/lib/data/today";
import type { ItineraryStatus } from "@/components/ui/types";

/**
 * Server actions for the Today dashboard (docs/06-features/00).
 * Every action: zod-validated input → requireUser → RLS-scoped write.
 * Legal status machine (doc 00 rule 5) is enforced here, not just in the UI.
 */

export interface ActionResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } };
}

const updateStatusInput = z.object({
  itemId: z.string().uuid(),
  status: z.enum([
    "planned",
    "confirmed",
    "in_progress",
    "completed",
    "skipped",
    "cancelled",
  ] as const satisfies readonly ItineraryStatus[]),
});

/** Legal transitions come from lib/data/today.ts — UI and DB agree by construction. */

async function isTripOwner(userId: string): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("trip_members")
    .select("role, status")
    .eq("trip_id", TRIP_ID)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "owner" && data?.status === "active";
}

/** Next.js redirect() throws a control-flow error — never swallow it. */
function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    ((err as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (err as { digest: string }).digest.startsWith("NEXT_NOT_FOUND"))
  );
}

export async function updateItemStatusAction(
  input: z.input<typeof updateStatusInput>,
): Promise<ActionResult<{ status: ItineraryStatus }>> {
  const parsed = updateStatusInput.safeParse(input);
  if (!parsed.success) return fail("validation", "invalid input");
  const { itemId, status } = parsed.data;

  try {
    const user = await requireUser();
    const supabase = await getSupabaseServerClient();

    const { data: item, error } = await supabase
      .from("itinerary_items")
      .select("id, status")
      .eq("id", itemId)
      .maybeSingle();
    if (error) return fail("db", error.message);
    const current = item?.status as ItineraryStatus | undefined;
    if (!item || !current) return fail("not_found", "item not found");

    if (!LEGAL_TRANSITIONS[current].includes(status)) {
      return fail("invalid_transition", `${current} → ${status} is not legal`);
    }
    // Reverting skipped/cancelled → planned is owner-only (doc 00 rule 5).
    if ((current === "skipped" || current === "cancelled") && status === "planned") {
      if (!(await isTripOwner(user.id))) return fail("owner_only", "owner-only revert");
    }

    const { error: updateError } = await supabase
      .from("itinerary_items")
      .update({ status })
      .eq("id", itemId);
    if (updateError) return fail("db", updateError.message);

    return { ok: true, data: { status } };
  } catch (err) {
    if (isRedirect(err)) throw err;
    return fail("db", err instanceof Error ? err.message : String(err));
  }
}

const addNoteInput = z.object({
  dayPlanId: z.string().uuid(),
  body: z.string().trim().min(1).max(280),
  noteKind: z.enum(["user", "system"]).default("user"),
});

/** Online path for feed notes. Offline writes go through the outbox (client). */
export async function addDayNoteAction(
  input: z.input<typeof addNoteInput>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = addNoteInput.safeParse(input);
  if (!parsed.success) return fail("validation", "invalid input");
  const { dayPlanId, body, noteKind } = parsed.data;

  try {
    const user = await requireUser();
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("day_notes")
      .insert({
        trip_id: TRIP_ID,
        day_plan_id: dayPlanId,
        author_id: user.id,
        body,
        note_kind: noteKind,
      })
      .select("id")
      .single();
    if (error) return fail("db", error.message);
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    if (isRedirect(err)) throw err;
    return fail("db", err instanceof Error ? err.message : String(err));
  }
}
