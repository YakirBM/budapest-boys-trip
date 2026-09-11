/**
 * Header clock helpers (docs/14 §1.3) — pure, testable, no React.
 * Fixed IANA zones (DST-aware via Intl); offsets are never hardcoded.
 */

export const TZ_BUDAPEST = "Europe/Budapest";
export const TZ_JERUSALEM = "Asia/Jerusalem";

export type ClockPrimary = "HU" | "IL";

export const CLOCK_STORAGE_KEY = "clock-primary";

export function getPrimaryClock(): ClockPrimary {
  try {
    const raw = window.localStorage.getItem(CLOCK_STORAGE_KEY);
    return raw === "IL" ? "IL" : "HU";
  } catch {
    return "HU";
  }
}

export function setPrimaryClock(next: ClockPrimary): void {
  try {
    window.localStorage.setItem(CLOCK_STORAGE_KEY, next);
  } catch {
    // localStorage unavailable — clock still works, preference is session-only.
  }
}

/** Full HH:MM:SS, 24h, in the given zone. */
export function formatFullTime(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(at);
}

/** Full Hebrew date in the Budapest zone (trip-local date). */
export function formatFullDate(at: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: TZ_BUDAPEST,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);
}
