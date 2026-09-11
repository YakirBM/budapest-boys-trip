/**
 * Shared UI types — mirror the DB enums in docs/03-data-model-and-rls.md.
 */
export type Category =
  | "food"
  | "attraction"
  | "walk"
  | "transit"
  | "rest"
  | "nightlife"
  | "flight"
  | "accommodation"
  | "other";

export type ItineraryStatus =
  | "planned"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "skipped"
  | "cancelled";

export type ExpenseStatus = "pending" | "settled" | "disputed";

export type ChipStatus = ItineraryStatus | ExpenseStatus;

export type TimeZoneName = "Europe/Budapest" | "Asia/Jerusalem";

export type CurrencyCode = "HUF" | "ILS" | "EUR" | "USD";

/** CSS token var for a status color (defined in app/globals.css). */
export function statusColorVar(status: ChipStatus): string {
  const itinerary: Record<ItineraryStatus, string> = {
    planned: "var(--color-st-planned)",
    confirmed: "var(--color-st-confirmed)",
    in_progress: "var(--color-st-in-progress)",
    completed: "var(--color-st-completed)",
    skipped: "var(--color-st-skipped)",
    cancelled: "var(--color-st-cancelled)",
  };
  const expense: Record<ExpenseStatus, string> = {
    pending: "var(--color-exp-pending)",
    settled: "var(--color-exp-settled)",
    disputed: "var(--color-exp-disputed)",
  };
  return status in itinerary
    ? itinerary[status as ItineraryStatus]
    : expense[status as ExpenseStatus];
}

/** CSS token var for a category color (defined in app/globals.css). */
export function categoryColorVar(category: Category): string {
  const map: Record<Category, string> = {
    food: "var(--color-cat-food)",
    attraction: "var(--color-cat-attraction)",
    walk: "var(--color-cat-walk)",
    transit: "var(--color-cat-transit)",
    rest: "var(--color-cat-rest)",
    nightlife: "var(--color-cat-nightlife)",
    flight: "var(--color-cat-flight)",
    accommodation: "var(--color-cat-accommodation)",
    other: "var(--color-cat-other)",
  };
  return map[category];
}
