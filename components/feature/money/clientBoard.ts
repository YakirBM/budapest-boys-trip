"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cacheSnapshot, readSnapshot } from "@/lib/offline/db";
import type {
  BalanceRow,
  ExpenseRow,
  ExpenseSplitRow,
  FxRateRow,
  SettlementRow,
} from "@/lib/data/money";

/**
 * Client-side re-fetch of the Money board (RLS-scoped, publishable key).
 * Mirrors the server normalizers; on failure serves the IndexedDB snapshot
 * with `stale: true` so the page renders offline (docs/07 §offline reads).
 * Signed URLs / secrets are never part of these payloads.
 */

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function mapExpense(row: Record<string, unknown>): ExpenseRow {
  return {
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
  };
}

export interface ExpensesPayload {
  expenses: ExpenseRow[];
  splits: ExpenseSplitRow[];
  rates: FxRateRow[];
  stale: boolean;
}

export interface BalancesPayload {
  balances: BalanceRow[];
  settlements: SettlementRow[];
  stale: boolean;
}

const EXPENSES_CACHE_KEY = "money-expenses";
const BALANCES_CACHE_KEY = "money-balances";

export async function fetchExpensesPayload(): Promise<ExpensesPayload> {
  const supabase = getSupabaseBrowserClient();
  try {
    const [expensesRes, splitsRes, ratesRes] = await Promise.all([
      supabase
        .from("expenses")
        .select(
          "id,trip_id,title,category,amount,currency,amount_base_huf,fx_rate_used,spent_at,paid_by,is_personal,tip,fee,note,status,day_number",
        )
        .order("spent_at", { ascending: false })
        .limit(500),
      supabase.from("expense_splits").select("expense_id,member_id,method,computed_amount").limit(2000),
      supabase
        .from("exchange_rates")
        .select("base,quote,rate,rate_type,is_override,fetched_at,source")
        .order("fetched_at", { ascending: false })
        .limit(12),
    ]);
    if (expensesRes.error) throw expensesRes.error;
    if (splitsRes.error) throw splitsRes.error;
    if (ratesRes.error) throw ratesRes.error;

    const payload: ExpensesPayload = {
      expenses: ((expensesRes.data ?? []) as unknown as Record<string, unknown>[]).map(mapExpense),
      splits: ((splitsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        expense_id: String(row["expense_id"]),
        member_id: String(row["member_id"]),
        method: String(row["method"] ?? "equal"),
        computed_amount: num(row["computed_amount"]),
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
      stale: false,
    };
    await cacheSnapshot(EXPENSES_CACHE_KEY, payload);
    return payload;
  } catch (err) {
    const snap = await readSnapshot<ExpensesPayload>(EXPENSES_CACHE_KEY);
    if (snap) return { ...snap.data, stale: true };
    throw err;
  }
}

export async function fetchBalancesPayload(tripId: string): Promise<BalancesPayload> {
  const supabase = getSupabaseBrowserClient();
  try {
    const [balancesRes, settlementsRes] = await Promise.all([
      supabase.from("v_member_balances").select("user_id,net_base_huf").eq("trip_id", tripId),
      supabase.rpc("suggest_settlements", { p_trip: tripId }),
    ]);
    if (balancesRes.error) throw balancesRes.error;
    if (settlementsRes.error) throw settlementsRes.error;

    const payload: BalancesPayload = {
      balances: ((balancesRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        user_id: String(row["user_id"]),
        net_base_huf: num(row["net_base_huf"]),
      })),
      settlements: ((settlementsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        from_user: String(row["from_user"]),
        to_user: String(row["to_user"]),
        amount_base_huf: num(row["amount_base_huf"]),
      })),
      stale: false,
    };
    await cacheSnapshot(BALANCES_CACHE_KEY, payload);
    return payload;
  } catch (err) {
    const snap = await readSnapshot<BalancesPayload>(BALANCES_CACHE_KEY);
    if (snap) return { ...snap.data, stale: true };
    throw err;
  }
}
