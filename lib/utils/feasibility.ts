/**
 * Feasibility engine ("האם המסלול אפשרי?") — docs/06-features/00-today-dashboard.md rule 8.
 * Pure heuristic: no external APIs (cut-list decision). Shared by Today and Route.
 */

export interface FeasibilityInput {
  id: string;
  title: string;
  status: string;
  /** UTC instants. */
  startTime: number;
  endTime: number | null;
  /** User-entered dwell/visit minutes (fallback when end_time missing). */
  durationMin?: number | null;
  /** User-entered travel minutes to the NEXT item. */
  travelMinToNext?: number | null;
  /** True when the item has a hard reservation at its start time. */
  hasReservation?: boolean;
}

export interface FeasibilityWarning {
  /** Item the traveler ARRIVES TO. */
  itemId: string;
  itemTitle: string;
  /** Previous item's end (ms) + travel → arrival at this item (ms). */
  arrivalAt: number;
  startAt: number;
  slackMin: number;
  severity: "warning" | "conflict";
  messageKey: "slackTight" | "hardConflict";
}

export const DEFAULT_BUFFER_MIN = 12;
/** Day 5 compressed morning raises the buffer floor (doc 00 edge case). */
export const DEPARTURE_DAY_BUFFER_MIN = 15;

/**
 * Evaluate consecutive pairs of an ordered day.
 * arrival = prev.end + travel; slack = next.start − arrival; buffer from args.
 */
export function evaluateDayFeasibility(
  items: readonly FeasibilityInput[],
  bufferMin: number = DEFAULT_BUFFER_MIN,
): FeasibilityWarning[] {
  const active = items.filter((i) => i.status !== "skipped" && i.status !== "cancelled");
  const warnings: FeasibilityWarning[] = [];

  for (let i = 1; i < active.length; i += 1) {
    const prev = active[i - 1];
    const next = active[i];
    if (!prev || !next) continue;

    const prevEnd =
      prev.endTime ?? prev.startTime + (prev.durationMin ?? 60) * 60_000;
    const travel = prev.travelMinToNext ?? 0;
    const arrival = prevEnd + travel * 60_000;
    const slackMin = Math.round((next.startTime - arrival) / 60_000);

    const hardConflict = next.hasReservation === true && arrival > next.startTime;
    if (hardConflict) {
      warnings.push({
        itemId: next.id,
        itemTitle: next.title,
        arrivalAt: arrival,
        startAt: next.startTime,
        slackMin,
        severity: "conflict",
        messageKey: "hardConflict",
      });
    } else if (slackMin < bufferMin) {
      warnings.push({
        itemId: next.id,
        itemTitle: next.title,
        arrivalAt: arrival,
        startAt: next.startTime,
        slackMin,
        severity: "warning",
        messageKey: "slackTight",
      });
    }
  }

  return warnings;
}

/**
 * Next Up resolution (doc 00 §Data & queries): first planned/confirmed item with
 * start >= now − 15min; else the in-progress item; else undefined.
 */
export function resolveNextUp(
  items: readonly FeasibilityInput[],
  now: number,
): FeasibilityInput | undefined {
  const active = items
    .filter((i) => ["planned", "confirmed", "in_progress"].includes(i.status))
    .sort((a, b) => a.startTime - b.startTime);

  return (
    active.find((i) => i.status === "in_progress") ??
    active.find((i) => i.startTime >= now - 15 * 60_000)
  );
}
