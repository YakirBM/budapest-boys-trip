import { getSupabaseServerClient } from "@/lib/supabase/server";
import { TRIP_ID } from "@/lib/data/trip";
import { TZ_BUDAPEST } from "@/lib/utils/time";
import type { FxRateRow } from "@/lib/data/money";

/**
 * GET /money/export — CSV of every expense visible to the caller (RLS-scoped;
 * personal expenses of others never appear). BOM + CRLF so Excel/Sheets open
 * it cleanly (docs/06-features/05 §CSV export). No signed URLs, no sensitive
 * columns — receipts are not part of the export.
 */

export const dynamic = "force-dynamic";

const CSV_COLUMNS = [
  "id",
  "date",
  "timezone",
  "title",
  "category",
  "amount",
  "currency",
  "amount_huf",
  "rate",
  "rate_type",
  "rate_source",
  "rate_verified_at",
  "quoted_ils",
  "settled_ils",
  "payer",
  "participants",
  "split_method",
  "status",
  "is_personal",
  "created_at",
] as const;

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function budapestDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ_BUDAPEST }).format(new Date(iso));
}

export async function GET(): Promise<Response> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("unauthorized", { status: 401 });
  }

  const [expensesRes, splitsRes, membersRes, ratesRes] = await Promise.all([
    supabase
      .from("expenses")
      .select(
        "id,title,category,amount,currency,amount_base_huf,fx_rate_used,spent_at,paid_by,is_personal,status,settled_amount,settled_currency,created_at",
      )
      .eq("trip_id", TRIP_ID)
      .order("spent_at", { ascending: false })
      .limit(5000),
    supabase.from("expense_splits").select("expense_id,member_id,method,computed_amount").limit(20000),
    supabase
      .from("trip_members")
      .select("user_id,profiles(full_name)")
      .eq("trip_id", TRIP_ID),
    supabase
      .from("exchange_rates")
      .select("base,quote,rate,rate_type,fetched_at,source")
      .order("fetched_at", { ascending: false })
      .limit(20),
  ]);

  if (expensesRes.error || splitsRes.error || membersRes.error || ratesRes.error) {
    return new Response("query failed", { status: 500 });
  }

  const expenses = (expensesRes.data ?? []) as Record<string, unknown>[];
  const splits = (splitsRes.data ?? []) as Record<string, unknown>[];
  const members = (membersRes.data ?? []) as { user_id: string; profiles: { full_name: string }[] | null }[];
  const rates = (ratesRes.data ?? []) as unknown as FxRateRow[];

  const nameOf = new Map<string, string>(
    members.map((m) => [m.user_id, m.profiles?.[0]?.full_name ?? m.user_id]),
  );
  const latestRateFor = (quote: string): FxRateRow | undefined =>
    rates.find((r) => r.base === "HUF" && r.quote === quote);
  const splitsOf = (expenseId: string) => splits.filter((s) => s["expense_id"] === expenseId);

  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const e of expenses) {
    const currency = String(e["currency"] ?? "HUF");
    const baseHuf = Number(e["amount_base_huf"] ?? e["amount"] ?? 0);
    const fxRate = e["fx_rate_used"] === null ? null : Number(e["fx_rate_used"]);
    const rateRow = latestRateFor(currency);
    // rate_source/rate_verified_at are filled only when the recorded rate still
    // matches the latest snapshot for that currency — never invented (rule 5).
    const rateMatches =
      fxRate !== null && rateRow !== undefined && Math.abs(1 / rateRow.rate - fxRate) < 1e-9;
    const ilsRate = latestRateFor("ILS")?.rate;

    const row = [
      String(e["id"]),
      budapestDate(String(e["spent_at"])),
      TZ_BUDAPEST,
      String(e["title"]),
      String(e["category"] ?? "other"),
      Number(e["amount"] ?? 0),
      currency,
      baseHuf,
      fxRate ?? "",
      e["fx_rate_used"] === null ? "" : rateMatches ? (rateRow?.rate_type ?? "") : "",
      rateMatches ? (rateRow?.source ?? "") : "",
      rateMatches ? String(rateRow?.fetched_at ?? "") : "",
      ilsRate && baseHuf ? baseHuf * ilsRate : "",
      e["settled_currency"] === "ILS" && e["settled_amount"] !== null ? Number(e["settled_amount"]) : "",
      nameOf.get(String(e["paid_by"])) ?? String(e["paid_by"]),
      splitsOf(String(e["id"]))
        .map((s) => nameOf.get(String(s["member_id"])) ?? String(s["member_id"]))
        .join("; "),
      splitsOf(String(e["id"]))[0] ? String(splitsOf(String(e["id"]))[0]!["method"]) : "",
      String(e["status"] ?? ""),
      e["is_personal"] ? "true" : "false",
      String(e["created_at"] ?? ""),
    ];

    lines.push(row.map(csvCell).join(","));
  }

  // BOM + CRLF: RTL-safe in Excel/Sheets (docs/06-features/05 acceptance).
  const body = `\uFEFF${lines.join("\r\n")}\r\n`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="budapest-expenses.csv"',
      "Cache-Control": "no-store",
    },
  });
}
