import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side data access for the Money page (docs/06-features/05-finance.md).
 * Every read is RLS-scoped: personal expenses of other members never reach the
 * client. Balances/settlement come from the canonical view + RPC (docs/03 §8).
 */

export interface ExpenseRow {
  id: string;
  trip_id: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  amount_base_huf: number | null;
  fx_rate_used: number | null;
  spent_at: string;
  paid_by: string;
  is_personal: boolean;
  tip: number | null;
  fee: number | null;
  note: string | null;
  status: string;
  day_number: number | null;
}

export interface ExpenseSplitRow {
  expense_id: string;
  member_id: string;
  method: string;
  computed_amount: number;
}

export interface BalanceRow {
  user_id: string;
  net_base_huf: number;
}

export interface SettlementRow {
  from_user: string;
  to_user: string;
  amount_base_huf: number;
}

export interface FxRateRow {
  base: string;
  quote: string;
  rate: number;
  rate_type: string;
  is_override: boolean;
  fetched_at: string;
  source: string;
}

export interface MoneyBoard {
  expenses: ExpenseRow[];
  splits: ExpenseSplitRow[];
  balances: BalanceRow[];
  settlements: SettlementRow[];
  rates: FxRateRow[];
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** One round-trip bundle for the first paint; the client re-fetches via TanStack. */
export async function getMoneyBoard(tripId: string): Promise<MoneyBoard> {
  const supabase = await getSupabaseServerClient();

  const [expensesRes, splitsRes, balancesRes, settlementsRes, ratesRes] = await Promise.all([
    supabase
      .from("expenses")
      .select(
        "id,trip_id,title,category,amount,currency,amount_base_huf,fx_rate_used,spent_at,paid_by,is_personal,tip,fee,note,status,day_number",
      )
      .eq("trip_id", tripId)
      .order("spent_at", { ascending: false })
      .limit(500),
    supabase
      .from("expense_splits")
      .select("expense_id,member_id,method,computed_amount")
      .limit(2000),
    supabase.from("v_member_balances").select("user_id,net_base_huf").eq("trip_id", tripId),
    supabase.rpc("suggest_settlements", { p_trip: tripId }),
    supabase
      .from("exchange_rates")
      .select("base,quote,rate,rate_type,is_override,fetched_at,source")
      .order("fetched_at", { ascending: false })
      .limit(12),
  ]);

  if (expensesRes.error) throw expensesRes.error;
  if (splitsRes.error) throw splitsRes.error;
  if (balancesRes.error) throw balancesRes.error;
  if (settlementsRes.error) throw settlementsRes.error;
  if (ratesRes.error) throw ratesRes.error;

  return {
    expenses: ((expensesRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      trip_id: String(row["trip_id"]),
      title: String(row["title"]),
      category: String(row["category"] ?? "other"),
      amount: num(row["amount"]),
      currency: String(row["currency"] ?? "HUF"),
      amount_base_huf: row["amount_base_huf"] === null ? null : num(row["amount_base_huf"]),
      fx_rate_used: row["fx_rate_used"] === null ? null : num(row["fx_rate_used"]),
      spent_at: String(row["spent_at"]),
      paid_by: String(row["paid_by"]),
      is_personal: Boolean(row["is_personal"]),
      tip: row["tip"] === null ? null : num(row["tip"]),
      fee: row["fee"] === null ? null : num(row["fee"]),
      note: row["note"] === null ? null : String(row["note"]),
      status: String(row["status"] ?? "confirmed"),
      day_number: row["day_number"] === null ? null : Number(row["day_number"]),
    })),
    splits: ((splitsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      expense_id: String(row["expense_id"]),
      member_id: String(row["member_id"]),
      method: String(row["method"] ?? "equal"),
      computed_amount: num(row["computed_amount"]),
    })),
    balances: ((balancesRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      user_id: String(row["user_id"]),
      net_base_huf: num(row["net_base_huf"]),
    })),
    settlements: ((settlementsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      from_user: String(row["from_user"]),
      to_user: String(row["to_user"]),
      amount_base_huf: num(row["amount_base_huf"]),
    })),
    rates: ((ratesRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      base: String(row["base"]),
      quote: String(row["quote"]),
      rate: num(row["rate"]),
      rate_type: String(row["rate_type"] ?? "market"),
      is_override: Boolean(row["is_override"]),
      fetched_at: String(row["fetched_at"]),
      source: String(row["source"]),
    })),
  };
}
