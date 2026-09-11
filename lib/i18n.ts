/**
 * lib/i18n.ts — typed Hebrew dictionary accessor.
 *
 * STRUCTURE CONTRACT (for all agents):
 * - Base strings live in `messages/he.json` (app shell, common, statuses, a11y…).
 * - Feature screens own their section file `messages/he/<feature>.json`
 *   (top-level key = the section name, e.g. {"flights": {...}}) which OVERRIDES
 *   the base section via top-level merge. Agents: edit ONLY your own feature file.
 * - The UI is Hebrew (RTL); docs stay English. NEVER hardcode Hebrew in TSX.
 * - JSON has no comments — structure contract documented HERE:
 *     meta/nav/common/theme  — app shell (base)
 *     today/route/map        — planning screens
 *     flights/stay/transit/safety — bookings & wellbeing
 *     money/checklists/media/decisions — logistics screens
 *     statusLabels/priorities/categories — enum-keyed labels (base)
 *     more/settings/offline/login/errors/a11y — shell & infra (base)
 * - Extending: add keys under the right section; nested objects become dot paths.
 *   `t("section.key")` is type-checked against the merged dictionary; missing keys
 *   return the path itself (visible in dev) — never crash.
 * - Params: `t("common.pendingSync", { count: 3 })` replaces `{count}` placeholders.
 */
import base from "@/messages/he.json";
import todayMsg from "@/messages/he/today.json";
import routeMsg from "@/messages/he/route.json";
import mapMsg from "@/messages/he/map.json";
import flightsMsg from "@/messages/he/flights.json";
import stayMsg from "@/messages/he/stay.json";
import transitMsg from "@/messages/he/transit.json";
import safetyMsg from "@/messages/he/safety.json";
import moneyMsg from "@/messages/he/money.json";
import checklistsMsg from "@/messages/he/checklists.json";
import mediaMsg from "@/messages/he/media.json";
import decisionsMsg from "@/messages/he/decisions.json";

/** Feature section files override the base per top-level key (later wins). */
export const messages = {
  ...base,
  ...todayMsg,
  ...routeMsg,
  ...mapMsg,
  ...flightsMsg,
  ...stayMsg,
  ...transitMsg,
  ...safetyMsg,
  ...moneyMsg,
  ...checklistsMsg,
  ...mediaMsg,
  ...decisionsMsg,
};

/** Dot paths of every leaf in the dictionary (deep, type-safe). */
export type MessagePath = PathsOf<typeof messages>;

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : K) : never;
type PathsOf<T> = T extends object
  ? { [K in keyof T & string]: T[K] extends object ? K | Join<K, PathsOf<T[K]>> : K }[keyof T & string]
  : never;

/**
 * Look up a message by dot path, with optional {param} interpolation.
 * Returns the path itself when the key is missing (fail-soft, visible in dev).
 */
export function t(path: MessagePath, params?: Record<string, string | number>): string {
  let node: unknown = messages;
  for (const part of path.split(".")) {
    if (node !== null && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  let out = typeof node === "string" ? node : path;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      out = out.replaceAll(`{${key}}`, String(value));
    }
  }
  return out;
}
