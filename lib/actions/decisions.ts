"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { TRIP_ID } from "@/lib/data/trip";
import { TZ_BUDAPEST, zonedWallTimeToUtc } from "@/lib/utils/time";

/**
 * Decisions & polls server actions (docs/06-features/09).
 * Creation validates 2–5 options + future deadline (≥ 15 min, rule 1/edge).
 * Conversion is idempotent via polls.winner_item_id — a second call returns the
 * existing itinerary item instead of duplicating it (rule 6).
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const ITINERARY_CATEGORIES = [
  "food",
  "attraction",
  "walk",
  "transit",
  "rest",
  "nightlife",
  "flight",
  "accommodation",
  "other",
] as const;

export interface NewPollOption {
  label: string;
  estCost: number | null;
  currency: string | null;
}

export interface CreatePollInput {
  question: string;
  options: NewPollOption[];
  deadlineIso: string;
  quorumRule: "majority" | "unanimous";
  anonymousUntilClose: boolean;
}

export type CreatePollResult = { ok: true; pollId: string } | { ok: false; error: string };

export interface ConvertDecisionInput {
  pollId: string;
  dayNumber: number;
  /** "HH:mm" wall clock in Europe/Budapest. */
  timeHHmm: string;
  category: string;
  status: "confirmed" | "planned";
}

export type ConvertDecisionResult =
  | { ok: true; itemId: string; existing: boolean }
  | { ok: false; error: string };

const ERR = {
  invalid: "decisions.errors.invalid",
  forbidden: "decisions.errors.forbidden",
  notFound: "decisions.errors.notFound",
  deadline: "decisions.composer.errDeadline",
  generic: "decisions.errors.generic",
} as const;

export async function createPollAction(input: CreatePollInput): Promise<CreatePollResult> {
  const parsed = z
    .object({
      question: z.string().trim().min(1).max(200),
      options: z
        .array(
          z.object({
            label: z.string().trim().min(1).max(120),
            estCost: z.number().positive().nullable(),
            currency: z.string().length(3).nullable(),
          }),
        )
        .min(2)
        .max(5),
      deadlineIso: z.string().min(10),
      quorumRule: z.enum(["majority", "unanimous"]),
      anonymousUntilClose: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: ERR.invalid };

  const deadline = Date.parse(parsed.data.deadlineIso);
  // Rule: deadline must be ≥ 15 min ahead at creation (docs/06-features/09 edge).
  if (!Number.isFinite(deadline) || deadline < Date.now() + 15 * 60_000) {
    return { ok: false, error: ERR.deadline };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERR.forbidden };

  const inserted = await supabase
    .from("polls")
    .insert({
      trip_id: TRIP_ID,
      question: parsed.data.question,
      status: "open",
      deadline: new Date(deadline).toISOString(),
      quorum_rule: parsed.data.quorumRule,
      anonymous_until_close: parsed.data.anonymousUntilClose,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (inserted.error) {
    console.error("createPoll failed", inserted.error.message);
    return { ok: false, error: ERR.forbidden };
  }
  const pollId = String(inserted.data["id"]);

  const optionsIns = await supabase.from("poll_options").insert(
    parsed.data.options.map((option, index) => ({
      poll_id: pollId,
      label: option.label,
      est_cost: option.estCost,
      currency: option.currency ?? "HUF",
      sort_order: (index + 1) * 10,
    })),
  );
  if (optionsIns.error) {
    await supabase.from("polls").delete().eq("id", pollId);
    console.error("createPoll options failed", optionsIns.error.message);
    return { ok: false, error: ERR.generic };
  }

  revalidatePath("/decisions");
  return { ok: true, pollId };
}

/** One-tap convert (docs/06-features/09 rule 6). Idempotent via winner_item_id. */
export async function convertDecisionAction(
  input: ConvertDecisionInput,
): Promise<ConvertDecisionResult> {
  const parsed = z
    .object({
      pollId: z.string().min(8),
      dayNumber: z.number().int().min(1).max(5),
      timeHHmm: z.string().regex(/^\d{2}:\d{2}$/),
      category: z.enum(ITINERARY_CATEGORIES),
      status: z.enum(["confirmed", "planned"]),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: ERR.invalid };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERR.forbidden };

  const pollRes = await supabase
    .from("polls")
    .select("id,question,decided_option_id,decision_note,winner_item_id,status")
    .eq("id", parsed.data.pollId)
    .eq("trip_id", TRIP_ID)
    .maybeSingle();
  if (pollRes.error || !pollRes.data) return { ok: false, error: ERR.notFound };
  const poll = pollRes.data as Record<string, unknown>;

  // Idempotent: already converted → return the existing item.
  if (poll["winner_item_id"]) {
    return { ok: true, itemId: String(poll["winner_item_id"]), existing: true };
  }
  if (!poll["decided_option_id"]) return { ok: false, error: ERR.invalid };

  const optionRes = await supabase
    .from("poll_options")
    .select("label")
    .eq("id", String(poll["decided_option_id"]))
    .maybeSingle();
  if (optionRes.error || !optionRes.data) return { ok: false, error: ERR.notFound };

  const dayRes = await supabase
    .from("day_plans")
    .select("id,date")
    .eq("trip_id", TRIP_ID)
    .eq("day_number", parsed.data.dayNumber)
    .maybeSingle();
  if (dayRes.error || !dayRes.data) return { ok: false, error: ERR.notFound };
  const dayPlan = dayRes.data as { id: string; date: string };

  const startUtc = zonedWallTimeToUtc(dayPlan.date, parsed.data.timeHHmm, TZ_BUDAPEST);

  const itemIns = await supabase
    .from("itinerary_items")
    .insert({
      day_plan_id: dayPlan.id,
      title: String(optionRes.data["label"]),
      category: parsed.data.category,
      start_time: startUtc.toISOString(),
      status: parsed.data.status,
      poll_id: poll["id"],
      notes: poll["decision_note"] ? String(poll["decision_note"]) : null,
      sort_order: 900,
    })
    .select("id")
    .single();
  if (itemIns.error) {
    console.error("convertDecision insert failed", itemIns.error.message);
    return { ok: false, error: ERR.forbidden };
  }
  const itemId = String(itemIns.data["id"]);

  const pollUpd = await supabase
    .from("polls")
    .update({ winner_item_id: itemId })
    .eq("id", poll["id"])
    .select("id")
    .maybeSingle();
  if (pollUpd.error) {
    console.error("convertDecision poll link failed", pollUpd.error.message);
    return { ok: false, error: ERR.generic };
  }

  revalidatePath("/decisions");
  revalidatePath("/today");
  revalidatePath("/route");
  return { ok: true, itemId, existing: false };
}
