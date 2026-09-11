import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/geocode — server-only address completion for the Memory Wall
 * (docs/14 §6.2). Reverse lookup via `{lat, lng}` body or forward search via
 * `?q=`. Nominatim is called ONLY from the server (no key, browser never
 * touches the provider); results are cached in memory and every call counts
 * against a 20/day/user limit (in-memory + app_events audit row).
 *
 * SSRF guard, by construction + validation:
 * - The fetched host is a fixed allowlist (nominatim.openstreetmap.org) —
 *   user input only ever becomes a `q`/`lat`/`lon` query value, never a URL.
 * - Bodies advertising a scheme (`file:`, `data:`, `javascript:`, …) or
 *   HTML metacharacters are rejected with 400.
 * - Coordinates must be finite and in range.
 */

export const dynamic = "force-dynamic";

const NOMINATIM_HOST = "nominatim.openstreetmap.org";
const USER_AGENT = "budapest-boys-trip/1.0 (private trip companion; contact: in-app settings)";
const TIMEOUT_MS = 8000;
const DAILY_LIMIT = 20;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

interface CachedEntry {
  results: GeocodeResult[];
  expiresAt: number;
}

interface GeocodeResult {
  label: string;
  lat: number | null;
  lng: number | null;
}

const cache = new Map<string, CachedEntry>();
const usage = new Map<string, { day: string; count: number }>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkLimit(userId: string): boolean {
  const key = `${userId}:${todayKey()}`;
  const entry = usage.get(key);
  if (!entry) {
    usage.set(key, { day: todayKey(), count: 1 });
    return true;
  }
  if (entry.count >= DAILY_LIMIT) return false;
  entry.count += 1;
  return true;
}

function readCache(key: string): GeocodeResult[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.results;
}

function writeCache(key: string, results: GeocodeResult[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
}

const SCHEME_BLOCK = /^\s*(file|data|blob|javascript|ftp|gopher|dict|ldap)\s*:/i;

function validQuery(q: unknown): q is string {
  return (
    typeof q === "string" &&
    q.trim().length >= 3 &&
    q.trim().length <= 120 &&
    !SCHEME_BLOCK.test(q) &&
    !/[<>]/.test(q)
  );
}

function validCoords(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

async function nominatim(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://${NOMINATIM_HOST}${path}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Accept-Language": "he,en",
      },
    });
    if (!res.ok) throw new Error(`nominatim responded ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function toResult(row: unknown): GeocodeResult | null {
  if (row === null || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const label = typeof record["display_name"] === "string" ? record["display_name"] : null;
  if (label === null || label.trim() === "") return null;
  const rawLat = record["lat"];
  const rawLng = record["lon"] ?? record["lng"];
  const lat = rawLat === undefined ? null : Number(rawLat);
  const lng = rawLng === undefined ? null : Number(rawLng);
  return {
    label,
    lat: lat !== null && Number.isFinite(lat) ? lat : null,
    lng: lng !== null && Number.isFinite(lng) ? lng : null,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const coords =
    body !== null && typeof body === "object"
      ? (body as { lat?: unknown; lng?: unknown })
      : null;

  const isReverse = q === null && coords !== null && coords.lat !== undefined;
  const isSearch = q !== null;

  if (isReverse && !validCoords(coords?.lat, coords?.lng)) {
    return NextResponse.json({ ok: false, error: "invalid_coords" }, { status: 400 });
  }
  if (isSearch && !validQuery(q)) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }
  if (!isReverse && !isSearch) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  if (!checkLimit(user.id)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const cacheKey = isReverse
    ? `rev:${Number(coords?.lat).toFixed(4)},${Number(coords?.lng).toFixed(4)}`
    : `search:${(q as string).trim().toLocaleLowerCase("en")}`;
  const cached = readCache(cacheKey);
  if (cached) {
    return NextResponse.json({ ok: true, results: cached, cached: true });
  }

  try {
    if (isReverse) {
      const data = await nominatim(
        `/reverse?format=jsonv2&lat=${encodeURIComponent(String(coords?.lat))}` +
          `&lon=${encodeURIComponent(String(coords?.lng))}&zoom=16&accept-language=he,en`,
      );
      const single = toResult(data);
      const results = single ? [single] : [];
      writeCache(cacheKey, results);
      void logGeocode(supabase, user.id, "reverse", null);
      return NextResponse.json({ ok: true, results });
    }
    const data = await nominatim(
      `/search?format=jsonv2&q=${encodeURIComponent((q as string).trim())}` +
        `&limit=5&addressdetails=0&accept-language=he,en`,
    );
    const results = (Array.isArray(data) ? data : [])
      .map(toResult)
      .filter((r): r is GeocodeResult => r !== null)
      .slice(0, 5);
    writeCache(cacheKey, results);
    void logGeocode(supabase, user.id, "search", (q as string).trim().slice(0, 60));
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("geocode failed", { error: err instanceof Error ? err.message : err });
    return NextResponse.json({ ok: false, error: "provider_failed" }, { status: 502 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}

/** Best-effort audit row; never fails the request (docs/14 §7.4). */
async function logGeocode(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  mode: "search" | "reverse",
  query: string | null,
): Promise<void> {
  try {
    await supabase.from("app_events").insert({
      trip_id: null,
      actor_id: userId,
      action: "geocode.query",
      entity: "geocode",
      entity_id: null,
      meta: { mode, q: query },
    });
  } catch {
    // Audit-only; the in-memory counter remains the enforcement boundary.
  }
}
