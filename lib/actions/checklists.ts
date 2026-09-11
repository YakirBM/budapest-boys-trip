"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Checklist server actions (docs/06-features/06-checklists.md).
 * Toggles happen client-side (optimistic + outbox); only item CREATION goes
 * through this action when online. Blocked-by integrity is enforced here too:
 * the server rejects done-status changes with unresolved blockers (outbox
 * replays that violate the rule fail and the client reverts — docs/07).
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const CHECKLIST_PRIORITIES = ["critical", "important", "normal"] as const;
export type ChecklistPriorityValue = (typeof CHECKLIST_PRIORITIES)[number];

const ERR = {
  invalid: "checklists.errors.invalid",
  forbidden: "checklists.errors.forbidden",
  generic: "checklists.errors.generic",
  blocked: "checklists.errors.blocked",
} as const;

export interface NewChecklistItem {
  checklistId: string;
  title: string;
  priority: ChecklistPriorityValue;
  assigneeId: string | null;
}

export type NewChecklistItemResult =
  | { ok: true; itemId: string }
  | { ok: false; error: string };

export async function addChecklistItemAction(input: NewChecklistItem): Promise<NewChecklistItemResult> {
  const parsed = z
    .object({
      checklistId: z.string().min(8),
      title: z.string().trim().min(1).max(160),
      priority: z.enum(CHECKLIST_PRIORITIES),
      assigneeId: z.string().min(8).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: ERR.invalid };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERR.forbidden };

  const inserted = await supabase
    .from("checklist_items")
    .insert({
      checklist_id: parsed.data.checklistId,
      title: parsed.data.title,
      priority: parsed.data.priority,
      assignee_id: parsed.data.assigneeId,
      status: "not_started",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (inserted.error) {
    console.error("addChecklistItem failed", inserted.error.message);
    return { ok: false, error: ERR.generic };
  }

  revalidatePath("/checklists");
  return { ok: true, itemId: String(inserted.data["id"]) };
}

/**
 * Server-side guard mirroring can_complete(item) (docs/06-features/06):
 * rejects status=done while any checklist_item_blocks row (or blocked_by_id)
 * points at an unresolved item. Used to validate outbox replays on reconnect.
 */
export async function validateToggleAction(input: {
  itemId: string;
  status: "not_started" | "done";
}): Promise<ActionResult> {
  const parsed = z
    .object({ itemId: z.string().min(8), status: z.enum(["not_started", "done"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: ERR.invalid };

  const supabase = await getSupabaseServerClient();
  if (parsed.data.status === "not_started") return { ok: true };

  const blocksRes = await supabase
    .from("checklist_item_blocks")
    .select("blocked_by_item_id")
    .eq("item_id", parsed.data.itemId);
  if (blocksRes.error) return { ok: false, error: ERR.generic };

  const itemRes = await supabase
    .from("checklist_items")
    .select("blocked_by_id")
    .eq("id", parsed.data.itemId)
    .maybeSingle();
  if (itemRes.error || !itemRes.data) return { ok: false, error: ERR.generic };

  const blockerIds: string[] = [
    ...((blocksRes.data ?? []) as { blocked_by_item_id: string }[]).map((b) => b.blocked_by_item_id),
    ...(itemRes.data["blocked_by_id"] ? [String(itemRes.data["blocked_by_id"])] : []),
  ];
  if (blockerIds.length === 0) return { ok: true };

  const states = await supabase
    .from("checklist_items")
    .select("id,status")
    .in("id", blockerIds);
  if (states.error) return { ok: false, error: ERR.generic };

  const unresolved = ((states.data ?? []) as { id: string; status: string }[]).some(
    (s) => s.status !== "done",
  );
  return unresolved ? { ok: false, error: ERR.blocked } : { ok: true };
}

/**
 * Persist a drag-and-drop reorder (docs/14 §4.2).
 * Sets both `position` (0021) and the legacy `sort_order` to the same value
 * so pre-migration ORDER BY sort_order queries keep working. RLS applies via
 * the caller's session (checklist_items_update through the parent checklist).
 */
export async function reorderChecklistItemsAction(input: {
  items: { id: string; position: number }[];
}): Promise<ActionResult> {
  const parsed = z
    .object({
      items: z
        .array(
          z.object({
            id: z.string().min(8).max(64),
            position: z.number().int().min(0).max(1_000_000),
          }),
        )
        .min(1)
        .max(200),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: ERR.invalid };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERR.forbidden };

  for (const row of parsed.data.items) {
    const { error } = await supabase
      .from("checklist_items")
      .update({ position: row.position, sort_order: row.position })
      .eq("id", row.id);
    if (error) {
      console.error("reorderChecklistItems failed", error.message);
      return { ok: false, error: ERR.generic };
    }
  }

  revalidatePath("/checklists");
  return { ok: true };
}
