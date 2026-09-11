"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { TRIP_ID } from "@/lib/data/trip";
import {
  isCurrency,
  minorToNumber,
  splitEqual,
  splitExact,
  splitPercent,
  splitShares,
  type Currency,
} from "@/lib/utils/money";

/**
 * Money server actions (docs/06-features/05-finance.md).
 * Splits are RECOMPUTED server-side from the declared plan — client amounts are
 * never trusted for accounting. Personal expenses never get splits.
 * Error fields are i18n codes (money.errors.*) — never user-facing Hebrew here.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const EXPENSE_CATEGORIES = [
  "lodging",
  "food",
  "transit",
  "attraction",
  "shopping",
  "nightlife",
  "taxi",
  "other",
] as const;

const SPLIT_METHODS = ["equal", "exact", "percent", "shares"] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

export interface ParticipantInput {
  memberId: string;
  /** exact: HUF-minor | percent: 0–100 | shares: positive units | equal: ignored. */
  value: number | null;
}

export interface SplitPlan {
  method: SplitMethod;
  payerId: string;
  participants: ParticipantInput[];
}

export interface CreateExpenseInput {
  title: string;
  category: string;
  /** Minor units of `currency`. */
  amountMinor: number;
  currency: string;
  /** Minor HUF — total converted at the rate in use (HUF minor == major). */
  amountBaseHufMinor: number;
  /** HUF per 1 unit of `currency`; null when currency is HUF. */
  fxRateUsed: number | null;
  paidBy: string;
  isPersonal: boolean;
  dayNumber: number | null;
  spentAtIso: string;
  tipMinor: number | null;
  feeMinor: number | null;
  note: string | null;
  plan: SplitPlan;
}

export type CreateExpenseResult = { ok: true; id: string } | { ok: false; error: string };

const uuid = z.string().min(8);

const createExpenseSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum(EXPENSE_CATEGORIES),
  amountMinor: z.number().int().positive(),
  currency: z.string().refine(isCurrency),
  amountBaseHufMinor: z.number().int().positive(),
  fxRateUsed: z.number().positive().nullable(),
  paidBy: uuid,
  isPersonal: z.boolean(),
  dayNumber: z.number().int().min(1).max(5).nullable(),
  spentAtIso: z.string().min(10),
  tipMinor: z.number().int().nonnegative().nullable(),
  feeMinor: z.number().int().nonnegative().nullable(),
  note: z.string().max(500).nullable(),
  plan: z.object({
    method: z.enum(SPLIT_METHODS),
    payerId: uuid,
    participants: z
      .array(z.object({ memberId: uuid, value: z.number().nullable() }))
      .min(1)
      .max(12),
  }),
});

const ERR = {
  invalid: "money.errors.invalid",
  forbidden: "money.errors.forbidden",
  notFound: "money.errors.notFound",
  generic: "money.errors.generic",
} as const;

function computeSplits(
  baseTotalMinor: number,
  plan: SplitPlan,
): { memberId: string; amountMinor: number; shareValue: number | null }[] | string {
  const ids = plan.participants.map((p) => p.memberId);
  if (!ids.includes(plan.payerId)) return "money.form.errPayerNotParticipant";
  try {
    switch (plan.method) {
      case "equal":
        return splitEqual(baseTotalMinor, ids, plan.payerId).map((s) => ({
          memberId: s.memberId,
          amountMinor: s.amountMinor,
          shareValue: null,
        }));
      case "exact": {
        const amounts = plan.participants.map((p) => ({
          memberId: p.memberId,
          amountMinor: Math.round(p.value ?? 0),
        }));
        return splitExact(baseTotalMinor, amounts).map((s) => ({
          memberId: s.memberId,
          amountMinor: s.amountMinor,
          shareValue: s.amountMinor,
        }));
      }
      case "percent": {
        const percents = plan.participants.map((p) => ({
          memberId: p.memberId,
          percent: p.value ?? 0,
        }));
        return splitPercent(baseTotalMinor, percents, plan.payerId).map((s) => {
          const input = plan.participants.find((p) => p.memberId === s.memberId);
          return { memberId: s.memberId, amountMinor: s.amountMinor, shareValue: input?.value ?? null };
        });
      }
      case "shares": {
        const shares = plan.participants.map((p) => ({
          memberId: p.memberId,
          shares: p.value ?? 0,
        }));
        if (shares.every((s) => s.shares <= 0)) return "money.form.errSharesSum";
        return splitShares(baseTotalMinor, shares, plan.payerId).map((s) => {
          const input = plan.participants.find((p) => p.memberId === s.memberId);
          return { memberId: s.memberId, amountMinor: s.amountMinor, shareValue: input?.value ?? null };
        });
      }
    }
  } catch (err) {
    return err instanceof Error && err.message === "exact amounts do not sum to total"
      ? "money.form.errExactSum"
      : err instanceof Error && err.message === "percents must sum to 100"
        ? "money.form.errPercentSum"
        : ERR.invalid;
  }
}

export async function createExpenseAction(
  input: CreateExpenseInput,
): Promise<CreateExpenseResult> {
  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: ERR.invalid };
  const data = parsed.data;

  // Personal expenses carry no splits and never enter group math.
  const plan: SplitPlan = data.isPersonal
    ? { method: "equal", payerId: data.paidBy, participants: [{ memberId: data.paidBy, value: null }] }
    : data.plan;

  const splitRows = computeSplits(data.amountBaseHufMinor, plan);
  if (typeof splitRows === "string") return { ok: false, error: splitRows };
  if (!data.isPersonal && splitRows.length === 0) return { ok: false, error: "money.form.errParticipants" };

  const supabase = await getSupabaseServerClient();
  const currency = data.currency as Currency;

  const inserted = await supabase
    .from("expenses")
    .insert({
      trip_id: TRIP_ID,
      title: data.title,
      category: data.category,
      amount: minorToNumber(data.amountMinor, currency),
      currency,
      amount_base_huf: minorToNumber(data.amountBaseHufMinor, "HUF"),
      fx_rate_used: data.fxRateUsed,
      spent_at: data.spentAtIso,
      paid_by: data.paidBy,
      is_personal: data.isPersonal,
      tip: data.tipMinor === null ? null : minorToNumber(data.tipMinor, currency),
      fee: data.feeMinor === null ? null : minorToNumber(data.feeMinor, currency),
      note: data.note,
      status: "confirmed",
      day_number: data.dayNumber,
    })
    .select("id")
    .single();
  if (inserted.error) {
    console.error("createExpense insert failed", inserted.error.message);
    return { ok: false, error: ERR.generic };
  }
  const expenseId = String(inserted.data["id"]);

  if (splitRows.length > 0) {
    const splitsIns = await supabase.from("expense_splits").insert(
      splitRows.map((s) => ({
        expense_id: expenseId,
        member_id: s.memberId,
        method: plan.method,
        share_value: s.shareValue,
        computed_amount: minorToNumber(s.amountMinor, "HUF"),
      })),
    );
    if (splitsIns.error) {
      // Roll back the orphan expense — an expense without its splits lies.
      await supabase.from("expenses").delete().eq("id", expenseId);
      console.error("createExpense splits failed", splitsIns.error.message);
      return { ok: false, error: ERR.generic };
    }
  }

  revalidatePath("/money");
  return { ok: true, id: expenseId };
}

export async function deleteExpenseAction(expenseId: string): Promise<ActionResult> {
  if (!z.string().min(8).safeParse(expenseId).success) return { ok: false, error: ERR.invalid };
  const supabase = await getSupabaseServerClient();
  // RLS: paid_by = me or trip owner; splits cascade.
  const deleted = await supabase.from("expenses").delete().eq("id", expenseId);
  if (deleted.error) {
    console.error("deleteExpense failed", deleted.error.message);
    return { ok: false, error: ERR.forbidden };
  }
  revalidatePath("/money");
  return { ok: true };
}

/** Owner-only: mark every confirmed shared expense settled + audit event. */
export async function settleTripAction(): Promise<ActionResult> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERR.forbidden };

  const ownerRes = await supabase
    .from("trip_members")
    .select("role,status")
    .eq("trip_id", TRIP_ID)
    .eq("user_id", user.id)
    .maybeSingle();
  if (ownerRes.error || !ownerRes.data || ownerRes.data.role !== "owner" || ownerRes.data.status !== "active") {
    return { ok: false, error: ERR.forbidden };
  }

  const updated = await supabase
    .from("expenses")
    .update({ status: "settled" })
    .eq("trip_id", TRIP_ID)
    .eq("status", "confirmed");
  if (updated.error) {
    console.error("settleTrip failed", updated.error.message);
    return { ok: false, error: ERR.generic };
  }

  await supabase.from("app_events").insert({
    trip_id: TRIP_ID,
    actor_id: user.id,
    action: "money.settle_trip",
    entity: "trip",
    entity_id: TRIP_ID,
    meta: { settled_status: "settled" },
  });

  revalidatePath("/money");
  return { ok: true };
}

export interface SplitsAttachment {
  /** The expense row id — equals the outbox op id (client PK, idempotent). */
  expenseId: string;
  plan: SplitPlan;
}

/**
 * Reconnect path for offline-entered expenses: the outbox replay inserts the
 * expense row only; the split plan (persisted client-side keyed by op id) is
 * attached here. Idempotent — existing splits are left untouched.
 */
export async function attachExpenseSplitsAction(
  attachments: SplitsAttachment[],
): Promise<{ ok: true; attached: number } | { ok: false; error: string }> {
  const schema = z.object({
    expenseId: uuid,
    plan: z.object({
      method: z.enum(SPLIT_METHODS),
      payerId: uuid,
      participants: z.array(z.object({ memberId: uuid, value: z.number().nullable() })).min(1).max(12),
    }),
  });

  const supabase = await getSupabaseServerClient();
  let attached = 0;

  for (const item of attachments) {
    const parsed = schema.safeParse(item);
    if (!parsed.success) continue;
    const { expenseId, plan } = parsed.data;

    const expenseRes = await supabase
      .from("expenses")
      .select("id,amount_base_huf,amount,currency,is_personal,status")
      .eq("id", expenseId)
      .maybeSingle();
    if (expenseRes.error || !expenseRes.data) continue;
    const expense = expenseRes.data as Record<string, unknown>;
    if (expense["is_personal"] || expense["status"] === "settled") continue;

    const existing = await supabase
      .from("expense_splits")
      .select("member_id")
      .eq("expense_id", expenseId)
      .limit(1);
    if (existing.error) continue;
    if ((existing.data ?? []).length > 0) continue; // already attached — idempotent

    const baseHuf = Number(expense["amount_base_huf"] ?? expense["amount"] ?? 0);
    const baseTotalMinor = Math.round(baseHuf); // HUF: minor == major
    if (baseTotalMinor <= 0) continue;

    const rows = computeSplits(baseTotalMinor, plan);
    if (typeof rows === "string" || rows.length === 0) continue;

    const ins = await supabase
      .from("expense_splits")
      .upsert(
        rows.map((s) => ({
          expense_id: expenseId,
          member_id: s.memberId,
          method: plan.method,
          share_value: s.shareValue,
          computed_amount: minorToNumber(s.amountMinor, "HUF"),
        })),
        { onConflict: "expense_id,member_id", ignoreDuplicates: true },
      );
    if (!ins.error) attached += 1;
  }

  revalidatePath("/money");
  return { ok: true, attached };
}
