/**
 * Timezone utilities (docs/12 §10 — no naive Date math, ever).
 * Trip: Europe/Budapest (primary, UTC+2 on trip dates) / Asia/Jerusalem (secondary, UTC+3).
 */

export const TZ_BUDAPEST = "Europe/Budapest";
export const TZ_JERUSALEM = "Asia/Jerusalem";

/** ISO date (YYYY-MM-DD) of "now" in the given IANA zone. */
export function todayInTz(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function tripDayNumber(
  dateIso: string,
  tripStartIso: string,
  tripEndIso: string,
): number | null {
  const day = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / 86_400_000);
  const diff = day(dateIso) - day(tripStartIso);
  if (diff < 0) return null; // pre-trip — callers decide what to show
  if (dateIso > tripEndIso) return null; // post-trip
  return diff + 1;
}

/** Day number for a live "now", clamped: pre-trip → 1, post-trip → last day (doc 00 rule 1). */
export function currentTripDayClamped(
  now: Date,
  tripStartIso: string,
  tripEndIso: string,
): { dayNumber: number; isPreTrip: boolean; isPostTrip: boolean } {
  const today = todayInTz(TZ_BUDAPEST, now);
  const n = tripDayNumber(today, tripStartIso, tripEndIso);
  const start = Date.parse(`${tripStartIso}T00:00:00Z`);
  const cur = Date.parse(`${today}T00:00:00Z`);
  if (n === null) {
    return cur < start
      ? { dayNumber: 1, isPreTrip: true, isPostTrip: false }
      : { dayNumber: 5, isPreTrip: false, isPostTrip: true };
  }
  return { dayNumber: n, isPreTrip: false, isPostTrip: false };
}

/** Offset (minutes east of UTC) of a zone at a given instant. */
export function tzOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * Convert a wall-clock time in a zone ("2026-10-04", "16:35") to a UTC Date.
 * Ambiguous/nonexistent times resolve to the earlier/actual offset — acceptable
 * here because EU DST ends 2026-10-25, after the trip (doc 00 rule 2).
 */
export function zonedWallTimeToUtc(dateIso: string, timeHHmm: string, timeZone: string): Date {
  const [h, m] = timeHHmm.split(":").map(Number);
  const naive = Date.parse(`${dateIso}T${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}:00Z`);
  const offset = tzOffsetMinutes(timeZone, new Date(naive));
  return new Date(naive - offset * 60_000);
}

export function formatInTz(
  at: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false },
): string {
  return new Intl.DateTimeFormat("he-IL", { timeZone, ...options }).format(at);
}

export function weekdayHebrew(dateIso: string): string {
  return new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${dateIso}T12:00:00Z`),
  );
}

export function formatDateHebrew(dateIso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00Z`));
}

/** leave_by = start − (travel_min + buffer_min) (doc 00 rule 3; buffer default 12). */
export function computeLeaveBy(startUtc: Date, travelMin: number, bufferMin = 12): Date {
  return new Date(startUtc.getTime() - (travelMin + bufferMin) * 60_000);
}

export function daysUntil(dateIso: string, now: Date = new Date()): number {
  const target = Date.parse(`${dateIso}T00:00:00Z`);
  const today = Date.parse(`${todayInTz(TZ_BUDAPEST, now)}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}
