import type { ItineraryStatus } from "@/components/ui/types";

/**
 * Pure schedule helpers (docs/14 §3.2). Client-safe and unit-tested in
 * tests/unit/schedule-tiles.test.ts. No Hebrew, no I/O, no Supabase imports.
 */

export interface SortableScheduleItem {
  id: string;
  /** ISO timestamptz or null (null sorts last). */
  startTime: string | null;
  sortOrder: number;
}

/** Sort-merge: start_time ascending (null last), then sort_order ascending. */
export function sortScheduleItems<T extends SortableScheduleItem>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.startTime ? Date.parse(a.startTime) : Number.POSITIVE_INFINITY;
    const bTime = b.startTime ? Date.parse(b.startTime) : Number.POSITIVE_INFINITY;
    const aSafe = Number.isFinite(aTime) ? aTime : Number.POSITIVE_INFINITY;
    const bSafe = Number.isFinite(bTime) ? bTime : Number.POSITIVE_INFINITY;
    if (aSafe !== bSafe) return aSafe - bSafe;
    return a.sortOrder - b.sortOrder;
  });
}

/** Rebalance to steps of 10 (same server arithmetic as route reorder). */
export function rebalanceSortOrders(count: number, step = 10, base = 10): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(base + i * step);
  return out;
}

/** Move an id within an ordered id list (dnd-kit commit helper). */
export function reorderIds(ids: readonly string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= ids.length || toIndex >= ids.length) {
    return [...ids];
  }
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return [...ids];
  next.splice(toIndex, 0, moved);
  return next;
}

/* ------------------------------------------------------------------ */
/* Day-5 anchor warning (IZ292 dep 10:25 HU; no activity after 06:00).  */
/* ------------------------------------------------------------------ */

export const DAY5_ANCHOR_CUTOFF_HHMM = "06:00";

/** HH:MM comparison (lexicographic works for zero-padded 24h times). */
export function isDay5AnchorConflictHHMM(dayNumber: number, hhmm: string | null): boolean {
  if (dayNumber !== 5 || !hhmm) return false;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return false;
  return hhmm > DAY5_ANCHOR_CUTOFF_HHMM;
}

/** Extract HH:MM in Europe/Budapest from an ISO instant (null-safe). */
export function hhmmInBudapest(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Budapest",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

/** Anchor predicate for real rows (ISO timestamptz + day number). */
export function isDay5AnchorConflict(dayNumber: number, startTimeIso: string | null): boolean {
  return isDay5AnchorConflictHHMM(dayNumber, hhmmInBudapest(startTimeIso));
}

/* ------------------------------------------------------------------ */
/* Legal status transitions (mirrors lib/data/today.ts).               */
/* ------------------------------------------------------------------ */

export const SCHEDULE_LEGAL_TRANSITIONS: Record<ItineraryStatus, readonly ItineraryStatus[]> = {
  planned: ["confirmed", "skipped", "cancelled"],
  confirmed: ["in_progress", "skipped", "cancelled"],
  in_progress: ["completed", "skipped"],
  completed: [],
  skipped: ["planned"],
  cancelled: ["planned"],
};

export function isLegalStatusTransition(from: ItineraryStatus, to: ItineraryStatus): boolean {
  return SCHEDULE_LEGAL_TRANSITIONS[from].includes(to);
}

/* ------------------------------------------------------------------ */
/* Cost breakdown sum (AmountInput rows → HUF-base-agnostic total).     */
/* ------------------------------------------------------------------ */

export interface ScheduleCostLine {
  label: string;
  /** Integer minor units (per lib/utils/money.ts). */
  amountMinor: number;
  currency: "HUF" | "ILS" | "EUR" | "USD";
}

export function sumCostLines(costs: readonly ScheduleCostLine[]): number {
  return costs.reduce((acc, line) => acc + (Number.isFinite(line.amountMinor) ? line.amountMinor : 0), 0);
}

/** Sum of group-item estimates in HUF (est_cost_group ?? est_cost_per_person × members). */
export function sumDayEstimateHuf(
  items: readonly { estCostGroup: number | null; estCostPerPerson: number | null; currency: string }[],
  activeMemberCount: number,
): number {
  let total = 0;
  for (const item of items) {
    if (item.currency !== "HUF") continue;
    const group =
      item.estCostGroup ?? (item.estCostPerPerson !== null ? item.estCostPerPerson * activeMemberCount : null);
    if (group !== null) total += group;
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* Shared-pin bounds (docs/14 §3.3.3: lat 47.2–47.7 / lng 18.8–19.4).  */
/* ------------------------------------------------------------------ */

export const MAP_PIN_BOUNDS = {
  minLat: 47.2,
  maxLat: 47.7,
  minLng: 18.8,
  maxLng: 19.4,
} as const;

export function isMapPinWithinBounds(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= MAP_PIN_BOUNDS.minLat &&
    lat <= MAP_PIN_BOUNDS.maxLat &&
    lng >= MAP_PIN_BOUNDS.minLng &&
    lng <= MAP_PIN_BOUNDS.maxLng
  );
}
