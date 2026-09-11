/**
 * Checklist life-phase groups (docs/14 §4 Tab 2).
 *
 * Pure helpers shared by the GroupTabs UI and the unit test. No React, no
 * Hebrew strings, no I/O — the SQL backfill in 0021_checklist_groups.sql
 * mirrors mapSeedTitleToGroup (see migration comments).
 */

export const CHECKLIST_GROUPS = ["preflight", "travelers", "return"] as const;
export type ChecklistGroup = (typeof CHECKLIST_GROUPS)[number];

export const CHECKLIST_GROUP_DEFAULT: ChecklistGroup = "preflight";

/** Type guard for the ?group= URL param and DB values. */
export function isChecklistGroup(value: unknown): value is ChecklistGroup {
  return (
    value === "preflight" || value === "travelers" || value === "return"
  );
}

/** Normalize unknown input (URL/DB) to a valid group, defaulting to preflight. */
export function normalizeChecklistGroup(value: unknown): ChecklistGroup {
  return isChecklistGroup(value) ? value : CHECKLIST_GROUP_DEFAULT;
}

export type ChecklistSubFilter = "mine" | "group" | "all";

export function isChecklistSubFilter(value: unknown): value is ChecklistSubFilter {
  return value === "mine" || value === "group" || value === "all";
}

export function normalizeChecklistSubFilter(value: unknown): ChecklistSubFilter {
  return isChecklistSubFilter(value) ? value : "all";
}

/**
 * Map a checklist title to its life-phase group.
 * Mirrors the 0021 migration backfill (same keyword sets, same precedence):
 * return-like first, then travelers-like, else preflight (default).
 *
 * Seed mapping (0015_seed_bulk.sql §4):
 *   'לפני הטיסה', 'יום הטיסה' -> preflight
 *   'כניסה לדירה', 'כל בוקר', 'יציאה ללילה' -> travelers
 *   'יום החזרה', 'אחרי הטיול' -> return
 */
export function mapSeedTitleToGroup(title: string): ChecklistGroup {
  const normalized = title.trim().toLowerCase();
  if (normalized === "") return CHECKLIST_GROUP_DEFAULT;

  const has = (needle: string): boolean => normalized.includes(needle);

  // Return / post-trip — checked first (see migration comment about 'יום').
  if (
    has("חזרה") ||
    has("אחרי") ||
    has("post") ||
    has("return")
  ) {
    return "return";
  }

  // During-trip / shared gear.
  if (
    has("דירה") ||
    has("בוקר") ||
    has("לילה") ||
    has("מטייל") ||
    has("shared") ||
    has("gear") ||
    has("traveler")
  ) {
    return "travelers";
  }

  // Packing / preflight-like (explicit) or default preflight.
  return "preflight";
}

export interface PositionAssignment {
  id: string;
  position: number;
}

/**
 * Rebalance 1..n ordering into evenly spaced positions (steps of `step`
 * starting at `startAt`). Matches the seed convention (10, 20, 30, …) and the
 * 0021 backfill (position seeded from sort_order).
 */
export function rebalancePositions(
  ids: readonly string[],
  opts?: { startAt?: number; step?: number },
): PositionAssignment[] {
  const startAt = opts?.startAt ?? 10;
  const step = opts?.step ?? 10;
  return ids.map((id, index) => ({ id, position: startAt + index * step }));
}

/**
 * Move `activeId` to the position of `overId` within an id ordering.
 * Pure array-move used by the dnd onDragEnd handler; returns a new array and
 * never mutates the input. Unknown ids → unchanged copy.
 */
export function moveItemIds(
  order: readonly string[],
  activeId: string,
  overId: string,
): string[] {
  if (activeId === overId) return [...order];
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from === -1 || to === -1) return [...order];
  const next = [...order];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...order];
  next.splice(to, 0, moved);
  return next;
}

export interface ProgressSummary {
  done: number;
  total: number;
  pct: number;
}

/**
 * Progress math shared by list rows and the per-group ReadinessWidget:
 * done = status === 'done'; pct = rounded %, 0/0 renders as 0% (never NaN).
 */
export function summarizeProgress(
  items: readonly { status: string }[],
): ProgressSummary {
  const total = items.length;
  const done = items.filter((item) => item.status === "done").length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}
