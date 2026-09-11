import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side data access for RSC pages (docs/02 §Data fetching).
 * Every function is RLS-scoped by the caller's session.
 */

/** The single trip row (docs/09 §Seed strategy: the whole app assumes one trip). */
export const TRIP_ID = "00000000-0000-4000-8000-000000000001";

export interface TripMember {
  user_id: string;
  role: "owner" | "member";
  status: "active" | "pending" | "declined";
  full_name: string;
}

export async function requireUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function getTrip() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("id", TRIP_ID)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getActiveMembers(): Promise<TripMember[]> {
  const supabase = await getSupabaseServerClient();
  // NOTE: profiles cannot be embedded from trip_members via PostgREST — the FK
  // goes through auth.users, which PostgREST (public schema) can't see. Two-step.
  const { data, error } = await supabase
    .from("trip_members")
    .select("user_id, role, status")
    .eq("trip_id", TRIP_ID)
    .order("sort_order");
  if (error) throw error;
  const rows = data ?? [];
  const ids = rows.map((r) => r.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
  return rows.map((row) => ({
    user_id: row.user_id,
    role: row.role,
    status: row.status,
    full_name: nameById.get(row.user_id) ?? "—",
  }));
}

export async function getDayPlans() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("day_plans")
    .select("*, itinerary_items(*)")
    .eq("trip_id", TRIP_ID)
    .order("day_number");
  if (error) throw error;
  return data ?? [];
}
