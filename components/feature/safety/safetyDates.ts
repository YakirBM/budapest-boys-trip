/** Fixed trip constants for the safety feature (trip row is the single seed — docs/09). */
export const TRIP_END_ISO = "2026-10-08";
export const TRIP_START_ISO = "2026-10-04";

/** he-IL short date for an ISO timestamp (client-safe formatting helper). */
export function formatDateShortHe(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso),
  );
}
