"use server";

import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, TRIP_ID } from "@/lib/data/trip";
import { TZ_BUDAPEST, zonedWallTimeToUtc } from "@/lib/utils/time";
import { parseMapsLink } from "@/lib/utils/deeplinks";
import type { ActionResult } from "@/lib/actions/today";
import type { Category } from "@/components/ui/types";
import type { PlaceStatus } from "@/lib/data/route";

/**
 * Server actions for Route & Places (docs/06-features/01).
 * All writes are zod-validated + requireUser + RLS-scoped.
 * Itinerary times are stored as timestamptz via zonedWallTimeToUtc (Europe/Budapest).
 */

function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } };
}

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

const CATEGORIES = [
  "food",
  "attraction",
  "walk",
  "transit",
  "rest",
  "nightlife",
  "flight",
  "accommodation",
  "other",
] as const satisfies readonly Category[];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const addItemInput = z.object({
  dayPlanId: z.string().uuid(),
  placeId: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORIES).default("other"),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(TIME_RE),
  ownerId: z.string().uuid().nullable().default(null),
  durationMin: z.number().int().min(5).max(720).nullable().default(null),
  estCostPerPerson: z.number().min(0).max(10_000_000).nullable().default(null),
});

export async function addItemAction(
  input: z.input<typeof addItemInput>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = addItemInput.safeParse(input);
  if (!parsed.success) return fail("validation", parsed.error.issues[0]?.message ?? "invalid");
  const fields = parsed.data;

  try {
    const user = await requireUser();
    const supabase = await getSupabaseServerClient();

    // Zero-ambiguity: the day plan must belong to the trip and match the given date.
    const { data: plan, error: planError } = await supabase
      .from("day_plans")
      .select("id, date")
      .eq("id", fields.dayPlanId)
      .eq("trip_id", TRIP_ID)
      .maybeSingle();
    if (planError) return fail("db", planError.message);
    if (!plan) return fail("not_found", "day plan not found");
    if (plan.date !== fields.dateIso) return fail("validation", "date does not match day plan");

    // When scheduling from the library the place supplies title/address/category.
    let place: { id: string; name: string; district: string | null; type: string; status: string } | null =
      null;
    if (fields.placeId) {
      const { data: placeRow, error: placeError } = await supabase
        .from("places")
        .select("id, name, district, type, status")
        .eq("id", fields.placeId)
        .eq("trip_id", TRIP_ID)
        .maybeSingle();
      if (placeError) return fail("db", placeError.message);
      if (!placeRow) return fail("not_found", "place not found");
      place = placeRow;
    }

    const startUtc = zonedWallTimeToUtc(fields.dateIso, fields.startTime, TZ_BUDAPEST);

    const { data: lastItem, error: orderError } = await supabase
      .from("itinerary_items")
      .select("sort_order")
      .eq("day_plan_id", fields.dayPlanId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orderError) return fail("db", orderError.message);
    const nextOrder = ((lastItem?.sort_order as number | undefined) ?? 0) + 10;

    const { data: inserted, error: insertError } = await supabase
      .from("itinerary_items")
      .insert({
        day_plan_id: fields.dayPlanId,
        place_id: place?.id ?? null,
        title: place?.name ?? fields.title,
        category: fields.category,
        start_time: startUtc.toISOString(),
        address: place?.district ?? fields.address,
        est_cost_per_person: fields.estCostPerPerson,
        currency: "HUF",
        status: "planned",
        owner_id: fields.ownerId ?? user.id,
        duration_min: fields.durationMin,
        sort_order: nextOrder,
      })
      .select("id")
      .single();
    if (insertError) return fail("db", insertError.message);

    // Pipeline rule (doc 01 rule 1): scheduling a place marks it `scheduled`.
    if (place && ["idea", "under_review", "approved"].includes(place.status)) {
      const { error: placeUpdateError } = await supabase
        .from("places")
        .update({ status: "scheduled" })
        .eq("id", place.id);
      if (placeUpdateError) return fail("db", placeUpdateError.message);
    }

    return { ok: true, data: { id: inserted.id } };
  } catch (err) {
    if (isRedirect(err)) throw err;
    return fail("db", err instanceof Error ? err.message : String(err));
  }
}

const reorderInput = z.object({
  itemId: z.string().uuid(),
  direction: z.enum(["up", "down"]),
});

/** Reorder via neighbor swap (sort_order steps of 10) — no drag, touch-safe. */
export async function reorderItemAction(
  input: z.input<typeof reorderInput>,
): Promise<ActionResult<{ moved: boolean }>> {
  const parsed = reorderInput.safeParse(input);
  if (!parsed.success) return fail("validation", "invalid input");

  try {
    await requireUser();
    const supabase = await getSupabaseServerClient();

    const { data: target } = await supabase
      .from("itinerary_items")
      .select("id, day_plan_id, sort_order")
      .eq("id", parsed.data.itemId)
      .maybeSingle();
    if (!target) return fail("not_found", "item not found");

    const { data: siblings } = await supabase
      .from("itinerary_items")
      .select("id, sort_order")
      .eq("day_plan_id", target.day_plan_id)
      .order("sort_order");
    const ordered = siblings ?? [];
    const index = ordered.findIndex((row) => row.id === target.id);
    const neighborIndex = parsed.data.direction === "up" ? index - 1 : index + 1;
    const neighbor = ordered[neighborIndex];
    if (index < 0 || !neighbor) return { ok: true, data: { moved: false } };

    const a = ordered[index];
    const b = neighbor;
    if (!a || !b) return { ok: true, data: { moved: false } };

    const { error: errA } = await supabase
      .from("itinerary_items")
      .update({ sort_order: b.sort_order ?? 0 })
      .eq("id", a.id);
    const { error: errB } = await supabase
      .from("itinerary_items")
      .update({ sort_order: a.sort_order ?? 0 })
      .eq("id", b.id);
    if (errA) return fail("db", errA.message);
    if (errB) return fail("db", errB.message);
    return { ok: true, data: { moved: true } };
  } catch (err) {
    if (isRedirect(err)) throw err;
    return fail("db", err instanceof Error ? err.message : String(err));
  }
}

const setPlaceStatusInput = z.object({
  placeId: z.string().uuid(),
  status: z.enum(["idea", "under_review", "approved", "rejected"]),
  reason: z.string().trim().max(200).optional(),
});

/**
 * Places pipeline transitions (doc 01 rule 1). `rejected` requires a reason and
 * is blocked while the place is scheduled (its address snapshot would orphan).
 */
export async function setPlaceStatusAction(
  input: z.input<typeof setPlaceStatusInput>,
): Promise<ActionResult<{ status: PlaceStatus }>> {
  const parsed = setPlaceStatusInput.safeParse(input);
  if (!parsed.success) return fail("validation", "invalid input");
  const { placeId, status, reason } = parsed.data;

  try {
    await requireUser();
    const supabase = await getSupabaseServerClient();

    if (status === "rejected") {
      if (!reason) return fail("reason_required", "reason required for rejection");
      const { data: refs } = await supabase
        .from("itinerary_items")
        .select("id, day_plans(day_number)")
        .eq("place_id", placeId)
        .limit(1);
      const ref = (refs ?? [])[0];
      if (ref) {
        const dayNumber = (ref.day_plans as { day_number?: number } | null)?.day_number;
        return fail("place_scheduled", `scheduled on day ${String(dayNumber ?? "?")}`);
      }
    }

    const update: Record<string, unknown> = { status };
    if (status === "rejected" && reason) {
      // Keep the reason in the note (doc 01 scope decision) — append when one exists.
      const { data: current } = await supabase
        .from("places")
        .select("note")
        .eq("id", placeId)
        .maybeSingle();
      const existing = typeof current?.note === "string" ? current.note : "";
      update["note"] = existing ? `${existing} | ${reason}` : reason;
    }

    const { error } = await supabase.from("places").update(update).eq("id", placeId);
    if (error) return fail("db", error.message);
    return { ok: true, data: { status } };
  } catch (err) {
    if (isRedirect(err)) throw err;
    return fail("db", err instanceof Error ? err.message : String(err));
  }
}

const quickAddPlaceInput = z.object({
  rawUrl: z.string().trim().min(4).max(2000),
  name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(200).optional(),
});

/**
 * Paste-a-Maps-link quick add (doc 01 rule 2). parseMapsLink strips ALL query /
 * tracking params before anything is persisted; only cleanUrl + coords + name
 * are stored. Unparsable input → `parse_failed` (client falls back to manual).
 */
export async function quickAddPlaceAction(
  input: z.input<typeof quickAddPlaceInput>,
): Promise<ActionResult<{ id: string; parsedName: string | null }>> {
  const parsed = quickAddPlaceInput.safeParse(input);
  if (!parsed.success) return fail("validation", "invalid input");
  const { rawUrl, name, note } = parsed.data;

  try {
    const user = await requireUser();
    const supabase = await getSupabaseServerClient();

    const link = parseMapsLink(rawUrl);
    const finalName = link?.name || name;

    const { data, error } = await supabase
      .from("places")
      .insert({
        trip_id: TRIP_ID,
        name: finalName,
        google_maps_url: link?.cleanUrl ?? null,
        lat: link?.lat ?? null,
        lng: link?.lng ?? null,
        note: note ?? null,
        status: "idea",
        suggested_by: user.id,
        source: link ? "member pasted link (params stripped)" : "manual entry",
        type: "other",
      })
      .select("id")
      .single();
    if (error) return fail("db", error.message);

    return { ok: true, data: { id: data.id, parsedName: link?.name ?? null } };
  } catch (err) {
    if (isRedirect(err)) throw err;
    return fail("db", err instanceof Error ? err.message : String(err));
  }
}

const attachBackupInput = z.object({
  itemId: z.string().uuid(),
  backupItemId: z.string().uuid().nullable(),
});

/** Attach / detach a rain-backup item (doc 01 rule 9). Same-trip items only. */
export async function attachBackupAction(
  input: z.input<typeof attachBackupInput>,
): Promise<ActionResult> {
  const parsed = attachBackupInput.safeParse(input);
  if (!parsed.success) return fail("validation", "invalid input");
  const { itemId, backupItemId } = parsed.data;
  if (itemId === backupItemId) return fail("validation", "cannot self-backup");

  try {
    await requireUser();
    const supabase = await getSupabaseServerClient();

    if (backupItemId) {
      const { data: backup } = await supabase
        .from("itinerary_items")
        .select("id, day_plans!inner(trip_id)")
        .eq("id", backupItemId)
        .eq("day_plans.trip_id", TRIP_ID)
        .maybeSingle();
      if (!backup) return fail("not_found", "backup item not in trip");
    }

    const { error } = await supabase
      .from("itinerary_items")
      .update({ backup_item_id: backupItemId })
      .eq("id", itemId);
    if (error) return fail("db", error.message);
    return { ok: true, data: undefined };
  } catch (err) {
    if (isRedirect(err)) throw err;
    return fail("db", err instanceof Error ? err.message : String(err));
  }
}

const rainPlanInput = z.object({
  dayPlanId: z.string().uuid(),
  activate: z.boolean(),
  /** Client-composed feed line (i18n happens in the UI layer). */
  feedBody: z.string().trim().min(1).max(280),
});

const OUTDOOR_CATEGORIES: readonly Category[] = ["attraction", "walk", "nightlife"];

/**
 * Rain plan (doc 01 rule 9): outdoor items with a backup → skipped, backup →
 * confirmed. Revert flips them back to planned. Writes one feed entry (best
 * effort — never blocks the swap). Idempotent on double activation.
 */
export async function rainPlanAction(
  input: z.input<typeof rainPlanInput>,
): Promise<ActionResult<{ swapped: number }>> {
  const parsed = rainPlanInput.safeParse(input);
  if (!parsed.success) return fail("validation", "invalid input");
  const { dayPlanId, activate, feedBody } = parsed.data;

  try {
    await requireUser();
    const supabase = await getSupabaseServerClient();

    const { data: plan } = await supabase
      .from("day_plans")
      .select("id, trip_id")
      .eq("id", dayPlanId)
      .eq("trip_id", TRIP_ID)
      .maybeSingle();
    if (!plan) return fail("not_found", "day plan not found");

    const { data: items } = await supabase
      .from("itinerary_items")
      .select("id, category, status, backup_item_id")
      .eq("day_plan_id", dayPlanId);
    const rows = items ?? [];

    const backupIds = new Set<string>();
    for (const row of rows) {
      if (row.backup_item_id) backupIds.add(row.backup_item_id as string);
    }
    const backupRows = new Map<string, { id: string; status: string }>();
    if (backupIds.size > 0) {
      const { data: backups } = await supabase
        .from("itinerary_items")
        .select("id, status")
        .in("id", [...backupIds]);
      for (const backup of backups ?? []) {
        backupRows.set(backup.id, backup);
      }
    }

    let swapped = 0;
    for (const row of rows) {
      const backupId = row.backup_item_id;
      const backup = backupId ? backupRows.get(backupId) : null;
      if (!backupId || !backup) continue;

      if (activate) {
        const isOutdoor =
          OUTDOOR_CATEGORIES.includes(row.category as Category) &&
          row.status !== "skipped" &&
          row.status !== "cancelled";
        if (isOutdoor) {
          const { error } = await supabase
            .from("itinerary_items")
            .update({ status: "skipped" })
            .eq("id", row.id);
          if (error) return fail("db", error.message);
          const { error: backupError } = await supabase
            .from("itinerary_items")
            .update({ status: "confirmed" })
            .eq("id", backupId);
          if (backupError) return fail("db", backupError.message);
          swapped += 1;
        }
      } else {
        // Revert: this day's skipped-with-backup items return to planned.
        if (row.status === "skipped") {
          const { error } = await supabase
            .from("itinerary_items")
            .update({ status: "planned" })
            .eq("id", row.id);
          if (error) return fail("db", error.message);
          const { error: backupError } = await supabase
            .from("itinerary_items")
            .update({ status: "planned" })
            .eq("id", backupId);
          if (backupError) return fail("db", backupError.message);
          swapped += 0; // revert count not needed for messaging
        }
      }
    }

    if (swapped > 0 || !activate) {
      // Feed entry — best effort (RLS failure must not roll back the plan).
      const { data: user } = await supabase.auth.getUser();
      if (user.user) {
        await supabase.from("day_notes").insert({
          trip_id: TRIP_ID,
          day_plan_id: dayPlanId,
          author_id: user.user.id,
          body: feedBody,
          note_kind: "system",
        });
      }
    }

    return { ok: true, data: { swapped } };
  } catch (err) {
    if (isRedirect(err)) throw err;
    return fail("db", err instanceof Error ? err.message : String(err));
  }
}
