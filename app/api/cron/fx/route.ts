import { NextResponse } from "next/server";
import { assertCronSecret, getSupabaseServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Daily FX cache refresh (docs/08 §2). Frankfurter (ECB) → exchange_rates.
 * Manual override rows (is_override) are never touched here.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!assertCronSecret(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=HUF&to=ILS,EUR,USD", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`frankfurter responded ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rates = data.rates ?? {};
    const quotes = ["ILS", "EUR", "USD"] as const;
    const rows = quotes
      .map((q) => ({ quote: q, rate: rates[q] }))
      .filter((r): r is { quote: (typeof quotes)[number]; rate: number } =>
        typeof r.rate === "number" && Number.isFinite(r.rate) && r.rate > 0,
      )
      .map((r) => ({
        base: "HUF",
        quote: r.quote,
        rate: r.rate,
        rate_type: "market" as const,
        source: "frankfurter.app (ECB)",
        fetched_at: new Date().toISOString(),
      }));
    if (rows.length === 0) throw new Error("no usable rates in response");

    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("exchange_rates")
      .delete()
      .eq("base", "HUF")
      .eq("rate_type", "market")
      .in("quote", [...quotes]);
    if (error) throw error;

    const insert = await supabase.from("exchange_rates").insert(rows);
    if (insert.error) throw insert.error;

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    console.error("cron/fx failed", { error: err instanceof Error ? err.message : err });
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 502 });
  }
}
