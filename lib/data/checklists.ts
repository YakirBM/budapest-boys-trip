import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side data access for Checklists (docs/06-features/06-checklists.md).
 * Lists + items + the multi-blocker graph in one bundle so the client can
 * compute per-list progress, "my items" and blocked state offline.
 */

export type ChecklistScope = "personal" | "group" | "assigned";
export type ChecklistItemStatus = "not_started" | "in_progress" | "done" | "blocked";
export type ChecklistPriority = "critical" | "important" | "normal";

export interface ChecklistListRow {
  id: string;
  title: string;
  scope: ChecklistScope;
  sort_order: number;
}

export interface ChecklistItemRow {
  id: string;
  checklist_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_at: string | null;
  priority: ChecklistPriority;
  status: ChecklistItemStatus;
  blocked_by_id: string | null;
  link: string | null;
  sort_order: number;
  done_by: string | null;
  done_at: string | null;
}

export interface ChecklistBlockRow {
  item_id: string;
  blocked_by_item_id: string;
}

export interface ChecklistBoard {
  lists: ChecklistListRow[];
  items: ChecklistItemRow[];
  blocks: ChecklistBlockRow[];
}

export async function getChecklistBoard(tripId: string): Promise<ChecklistBoard> {
  const supabase = await getSupabaseServerClient();

  const listsRes = await supabase
    .from("checklists")
    .select("id,title,scope,sort_order")
    .eq("trip_id", tripId)
    .order("sort_order");
  if (listsRes.error) throw listsRes.error;

  const lists = ((listsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row["id"]),
    title: String(row["title"]),
    scope: String(row["scope"] ?? "group") as ChecklistScope,
    sort_order: Number(row["sort_order"] ?? 0),
  }));

  const listIds = lists.map((l) => l.id);
  if (listIds.length === 0) return { lists, items: [], blocks: [] };

  const [itemsRes, blocksRes] = await Promise.all([
    supabase
      .from("checklist_items")
      .select(
        "id,checklist_id,title,description,assignee_id,due_at,priority,status,blocked_by_id,link,sort_order,done_by,done_at",
      )
      .in("checklist_id", listIds)
      .order("sort_order"),
    supabase
      .from("checklist_item_blocks")
      .select("item_id,blocked_by_item_id")
      .in("item_id", listIds.length > 0 ? await getBlockScope(supabase, listIds) : []),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (blocksRes.error) throw blocksRes.error;

  return {
    lists,
    items: ((itemsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      checklist_id: String(row["checklist_id"]),
      title: String(row["title"]),
      description: row["description"] === null ? null : String(row["description"]),
      assignee_id: row["assignee_id"] === null ? null : String(row["assignee_id"]),
      due_at: row["due_at"] === null ? null : String(row["due_at"]),
      priority: String(row["priority"] ?? "normal") as ChecklistPriority,
      status: String(row["status"] ?? "not_started") as ChecklistItemStatus,
      blocked_by_id: row["blocked_by_id"] === null ? null : String(row["blocked_by_id"]),
      link: row["link"] === null ? null : String(row["link"]),
      sort_order: Number(row["sort_order"] ?? 0),
      done_by: row["done_by"] === null ? null : String(row["done_by"]),
      done_at: row["done_at"] === null ? null : String(row["done_at"]),
    })),
    blocks: ((blocksRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      item_id: String(row["item_id"]),
      blocked_by_item_id: String(row["blocked_by_item_id"]),
    })),
  };
}

/** checklist_item_blocks has no trip_id — scope by the items of this trip's lists. */
async function getBlockScope(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  listIds: string[],
): Promise<string[]> {
  const res = await supabase.from("checklist_items").select("id").in("checklist_id", listIds);
  if (res.error) throw res.error;
  return ((res.data ?? []) as { id: string }[]).map((r) => r.id);
}
