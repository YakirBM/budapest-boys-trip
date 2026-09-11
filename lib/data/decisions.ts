import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side data access for Decisions & Polls (docs/06-features/09).
 * Lazy deadline reconcile (close_expired_polls RPC) runs before the read so an
 * expired poll is always resolved by the authoritative server function.
 */

export interface PollRow {
  id: string;
  question: string;
  status: "open" | "closed";
  deadline: string;
  quorum_rule: "majority" | "unanimous";
  anonymous_until_close: boolean;
  created_by: string;
  decided_option_id: string | null;
  decision_note: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  winner_item_id: string | null;
}

export interface PollOptionRow {
  id: string;
  poll_id: string;
  label: string;
  est_cost: number | null;
  currency: string;
  travel_min: number | null;
  time_needed_min: number | null;
  availability_note: string | null;
  source: string | null;
  last_verified_at: string | null;
  sort_order: number;
}

export interface VoteRow {
  poll_id: string;
  option_id: string;
  member_id: string;
}

export interface DayPlanRow {
  id: string;
  day_number: number;
  date: string;
}

export interface DecisionBoard {
  polls: PollRow[];
  options: PollOptionRow[];
  votes: VoteRow[];
  dayPlans: DayPlanRow[];
}

/**
 * Authoritative lazy reconcile (docs/03 §13, docs/06-features/09 rule 4/5).
 * Callable by any trip member; failures never block rendering the list.
 */
export async function reconcileExpiredPolls(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("close_expired_polls");
  if (error) console.error("close_expired_polls failed", error.message);
}

export async function getDecisionBoard(tripId: string): Promise<DecisionBoard> {
  const supabase = await getSupabaseServerClient();

  const pollsRes = await supabase
    .from("polls")
    .select(
      "id,question,status,deadline,quorum_rule,anonymous_until_close,created_by,decided_option_id,decision_note,closed_at,closed_reason,winner_item_id",
    )
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (pollsRes.error) throw pollsRes.error;

  const polls = ((pollsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row["id"]),
    question: String(row["question"]),
    status: (row["status"] === "closed" ? "closed" : "open") as "open" | "closed",
    deadline: String(row["deadline"]),
    quorum_rule: (row["quorum_rule"] === "unanimous" ? "unanimous" : "majority") as
      | "majority"
      | "unanimous",
    anonymous_until_close: Boolean(row["anonymous_until_close"]),
    created_by: String(row["created_by"]),
    decided_option_id: row["decided_option_id"] === null ? null : String(row["decided_option_id"]),
    decision_note: row["decision_note"] === null ? null : String(row["decision_note"]),
    closed_at: row["closed_at"] === null ? null : String(row["closed_at"]),
    closed_reason: row["closed_reason"] === null ? null : String(row["closed_reason"]),
    winner_item_id: row["winner_item_id"] === null ? null : String(row["winner_item_id"]),
  }));

  const pollIds = polls.map((p) => p.id);
  if (pollIds.length === 0) {
    const dayRes = await supabase
      .from("day_plans")
      .select("id,day_number,date")
      .eq("trip_id", tripId)
      .order("day_number");
    if (dayRes.error) throw dayRes.error;
    return {
      polls,
      options: [],
      votes: [],
      dayPlans: ((dayRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        day_number: Number(row["day_number"]),
        date: String(row["date"]),
      })),
    };
  }

  const [optionsRes, votesRes, dayRes] = await Promise.all([
    supabase
      .from("poll_options")
      .select(
        "id,poll_id,label,est_cost,currency,travel_min,time_needed_min,availability_note,source,last_verified_at,sort_order",
      )
      .in("poll_id", pollIds)
      .order("sort_order"),
    supabase.from("votes").select("poll_id,option_id,member_id").in("poll_id", pollIds),
    supabase
      .from("day_plans")
      .select("id,day_number,date")
      .eq("trip_id", tripId)
      .order("day_number"),
  ]);
  if (optionsRes.error) throw optionsRes.error;
  if (votesRes.error) throw votesRes.error;
  if (dayRes.error) throw dayRes.error;

  return {
    polls,
    options: ((optionsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      poll_id: String(row["poll_id"]),
      label: String(row["label"]),
      est_cost: row["est_cost"] === null ? null : Number(row["est_cost"]),
      currency: String(row["currency"] ?? "HUF"),
      travel_min: row["travel_min"] === null ? null : Number(row["travel_min"]),
      time_needed_min: row["time_needed_min"] === null ? null : Number(row["time_needed_min"]),
      availability_note: row["availability_note"] === null ? null : String(row["availability_note"]),
      source: row["source"] === null ? null : String(row["source"]),
      last_verified_at: row["last_verified_at"] === null ? null : String(row["last_verified_at"]),
      sort_order: Number(row["sort_order"] ?? 0),
    })),
    votes: ((votesRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      poll_id: String(row["poll_id"]),
      option_id: String(row["option_id"]),
      member_id: String(row["member_id"]),
    })),
    dayPlans: ((dayRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      day_number: Number(row["day_number"]),
      date: String(row["date"]),
    })),
  };
}
