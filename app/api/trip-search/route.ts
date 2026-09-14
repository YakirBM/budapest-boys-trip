import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_QUERY_CHARS = 800;
const DAILY_LIMIT = 40;
const rateCounter = new Map<string, { day: string; count: number }>();

interface Citation { title: string; url: string }

function isRateLimited(userId: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const current = rateCounter.get(userId);
  if (!current || current.day !== day) {
    rateCounter.set(userId, { day, count: 1 });
    return false;
  }
  if (current.count >= DAILY_LIMIT) return true;
  current.count += 1;
  return false;
}

function readResponse(payload: unknown): { text: string; citations: Citation[] } {
  const root = payload as { output?: unknown[]; output_text?: unknown };
  const textParts: string[] = [];
  const citationMap = new Map<string, Citation>();

  for (const item of root.output ?? []) {
    const message = item as { type?: string; content?: unknown[] };
    if (message.type !== "message") continue;
    for (const content of message.content ?? []) {
      const block = content as { type?: string; text?: unknown; annotations?: unknown[] };
      if (block.type === "output_text" && typeof block.text === "string") textParts.push(block.text);
      for (const raw of block.annotations ?? []) {
        const annotation = raw as { type?: string; url?: unknown; title?: unknown };
        if (annotation.type !== "url_citation" || typeof annotation.url !== "string") continue;
        try {
          const parsed = new URL(annotation.url);
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
          citationMap.set(parsed.toString(), {
            url: parsed.toString(),
            title: typeof annotation.title === "string" && annotation.title.trim()
              ? annotation.title.trim().slice(0, 160)
              : parsed.hostname,
          });
        } catch {
          // Ignore malformed model annotations.
        }
      }
    }
  }

  const fallback = typeof root.output_text === "string" ? root.output_text : "";
  return { text: textParts.join("\n").trim() || fallback.trim(), citations: [...citationMap.values()].slice(0, 10) };
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (isRateLimited(userId)) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  let query = "";
  try {
    const body = await request.json() as { query?: unknown };
    query = typeof body.query === "string" ? body.query.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (!query || query.length > MAX_QUERY_CHARS) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_SEARCH_MODEL || "gpt-5-mini",
        store: false,
        tools: [{
          type: "web_search",
          search_context_size: "high",
          user_location: { type: "approximate", city: "Budapest", country: "HU", timezone: "Europe/Budapest" },
        }],
        include: ["web_search_call.action.sources"],
        instructions: [
          "You are a meticulous Budapest travel concierge for four Israeli medical students on a tight budget.",
          "Search the live web step by step. Answer in the language of the user's query.",
          "Prioritize official sources and current local sources. Clearly label prices, opening hours and schedules as estimates with verification dates.",
          "For places, include the exact name, district/address, why it fits, expected price range, opening caveats, and a navigable source link.",
          "Never request or repeat passport, medical, booking-reference, home-address, or other sensitive personal data.",
          "Be concise and practical. Do not invent facts when sources disagree.",
        ].join(" "),
        input: query,
      }),
      signal: AbortSignal.timeout(35_000),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "provider_error" }, { status: 502 });
    const payload = await response.json() as unknown;
    const result = readResponse(payload);
    if (!result.text) return NextResponse.json({ ok: false, error: "empty_response" }, { status: 502 });
    return NextResponse.json({ ok: true, ...result, verifiedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, error: "provider_error" }, { status: 502 });
  }
}
