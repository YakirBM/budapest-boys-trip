/**
 * lib/theme/logic.ts — auto-dark logic per docs/05-ui-ux-design-system.md §3.
 *
 * - Default: light.
 * - Auto-dark: `.dark` when Budapest local time >= sunset (early Oct ≈ 18:05 —
 *   ESTIMATE until the weather integration supplies the real value) OR < 06:30.
 * - prefers-color-scheme:dark is an INITIAL HINT ONLY (pre-mount, in the inline
 *   bootstrap script); after mount the auto calculation always wins.
 * - Manual override lives in localStorage["theme-override"] as
 *   {"mode":"light"|"dark","setAt":<ms>} (a bare "light"/"dark" string from older
 *   writes is also accepted). The override WINS until the next Budapest sunrise,
 *   then auto resumes. Sunrise boundary is approximated with Budapest-local
 *   calendar dates + the 06:30 minute-of-day (no full tz math needed).
 */

export const THEME_OVERRIDE_KEY = "theme-override";
export const DARK_CLASS = "dark";
export const THEME_TRANSITION_CLASS = "theme-transition";

/** Budapest sunset, minutes-of-day. ESTIMATE for early October (~18:05). */
export const SUNSET_MINUTES = 18 * 60 + 5;
/** Auto-dark lifts at 06:30 Budapest. */
export const SUNRISE_MINUTES = 6 * 60 + 30;

/** How often the provider re-evaluates the auto-dark window. */
export const AUTO_RECHECK_MS = 60_000;

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeOverride {
  mode: "light" | "dark";
  setAt: number;
}

/** Minutes-of-day for a moment, in Europe/Budapest. */
export function budapestMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const [h, m] = parts.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/** yyyymmdd stamp of the Budapest-local calendar date for a moment. */
export function budapestDateStamp(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [d, m, y] = parts.split("/");
  return (Number(y) || 0) * 10000 + (Number(m) || 0) * 100 + (Number(d) || 0);
}

/** True when it is "dark time" in Budapest: after sunset or before sunrise. */
export function isNightInBudapest(date: Date, sunsetMinutes = SUNSET_MINUTES): boolean {
  const minutes = budapestMinutes(date);
  return minutes >= sunsetMinutes || minutes < SUNRISE_MINUTES;
}

/** Parse the raw localStorage value; tolerates legacy bare strings. */
export function parseOverride(raw: string | null): ThemeOverride | null {
  if (!raw) return null;
  if (raw === "light" || raw === "dark") return { mode: raw, setAt: 0 };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "mode" in parsed &&
      ((parsed as ThemeOverride).mode === "light" || (parsed as ThemeOverride).mode === "dark")
    ) {
      return { mode: (parsed as ThemeOverride).mode, setAt: Number((parsed as ThemeOverride).setAt) || 0 };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * An override is active from the moment it is set until the next 06:30 Budapest.
 * Approximation: expired once (a) we are past 06:30 now AND (b) either the
 * Budapest calendar date has advanced since it was set, or the override was set
 * before 06:30 on the same Budapest date.
 */
export function isOverrideActive(override: ThemeOverride, now: Date): boolean {
  if (override.setAt <= 0) return true; // legacy value without timestamp — keep honoring
  const setAtDate = new Date(override.setAt);
  const nowStamp = budapestDateStamp(now);
  const setStamp = budapestDateStamp(setAtDate);
  const nowMin = budapestMinutes(now);
  if (nowMin < SUNRISE_MINUTES) return true; // night: override always holds
  if (nowStamp > setStamp) return false; // passed 06:30 on a later date
  // same Budapest date, past 06:30: expired only if it was set before 06:30
  return budapestMinutes(setAtDate) >= SUNRISE_MINUTES;
}

/** Resolve what theme should be applied right now. */
export function resolveTheme(
  preference: ThemePreference,
  override: ThemeOverride | null,
  now: Date,
): ResolvedTheme {
  if (preference !== "system" && override && isOverrideActive(override, now)) {
    return override.mode;
  }
  return isNightInBudapest(now) ? "dark" : "light";
}

/**
 * Pre-paint bootstrap script (rendered inline at the top of <body> in the root
 * layout to avoid a theme flash). Mirrors the rules above:
 * 1. If a valid override exists → apply it (light is the default, no class).
 * 2. Otherwise use prefers-color-scheme:dark as the initial HINT.
 * The ThemeProvider reconciles with the real auto-dark calculation after mount.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var k=${JSON.stringify(THEME_OVERRIDE_KEY)};
var dark=false,raw=null;
try{raw=localStorage.getItem(k);}catch(e){}
if(raw==="light"||raw==="dark"){dark=(raw==="dark");}
else if(raw){try{var o=JSON.parse(raw);dark=(o&&o.mode==="dark");}catch(e){}}
else if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches){dark=true;}
if(dark){document.documentElement.classList.add(${JSON.stringify(DARK_CLASS)});}
}catch(e){}})();`;
