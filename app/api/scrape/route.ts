import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { TRIP_ID } from "@/lib/data/trip";
import {
  isBlockedScrapeUrl,
  parseScrapeHtml,
  type ScrapeResult,
} from "@/lib/utils/scrape";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const DAILY_LIMIT = 20;

/** In-memory per-user daily counter (single-instance; DB log is authoritative). */
const rateCounter = new Map<string, { day: string; count: number }>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isRateLimited(userId: string): boolean {
  const key = todayKey();
  const entry = rateCounter.get(userId);
  if (!entry || entry.day !== key) {
    rateCounter.set(userId, { day: key, count: 1 });
    return false;
  }
  if (entry.count >= DAILY_LIMIT) return true;
  entry.count += 1;
  return false;
}

async function fetchWithCaps(url: string): Promise<{ html: string; finalUrl: string }> {
  let current = url;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "BudapestTripCompanion/1.0 (+https://medbadboys.vercel.app)",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location || redirect === MAX_REDIRECTS) throw new Error("too_many_redirects");
        const next = new URL(location, current).toString();
        if (isBlockedScrapeUrl(next)) throw new Error("blocked_url");
        current = next;
        continue;
      }
      if (!res.ok) throw new Error(`upstream_${res.status}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        throw new Error("not_html");
      }
      const reader = res.body?.getReader();
      if (!reader) {
        const text = await res.text();
        if (text.length > MAX_BYTES) throw new Error("too_large");
        return { html: text, finalUrl: current };
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_BYTES) throw new Error("too_large");
          chunks.push(value);
        }
      }
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { html: new TextDecoder("utf-8").decode(merged), finalUrl: current };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("too_many_redirects");
}

/**
 * POST /api/scrape — server-only link scraper (docs/14 §3.5).
 * OG + JSON-LD + Maps parse, 8s timeout, 2MB cap, SSRF guard, 20/day limit.
 * Returns source + fetchedAt so callers stamp provenance (rule 5).
 */
export async function POST(request: Request): Promise<NextResponse> {
  let rawUrl = "";
  try {
    const body = (await request.json()) as { url?: unknown };
    rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (!rawUrl || rawUrl.length > 2000) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (isBlockedScrapeUrl(rawUrl)) {
    return NextResponse.json({ ok: false, error: "blocked_url" }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id ?? null;
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (isRateLimited(userId)) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const { html, finalUrl } = await fetchWithCaps(rawUrl);
    const parsed = parseScrapeHtml(html, finalUrl);
    const source = new URL(finalUrl).hostname;
    const fetchedAt = new Date().toISOString();
    const result: ScrapeResult = { ...parsed, source, fetchedAt };

    // Abuse log (best effort; never blocks the response).
    void supabase.from("app_events").insert({
      trip_id: TRIP_ID,
      actor_id: userId,
      action: "place.scraped",
      entity: "places",
      meta: { host: source },
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("abort") || message.includes("Timeout")) {
      return NextResponse.json({ ok: false, error: "timeout" }, { status: 504 });
    }
    if (message === "too_large") {
      return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
    }
    if (message === "blocked_url") {
      return NextResponse.json({ ok: false, error: "blocked_url" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 502 });
  }
}
