/**
 * Transit data access (RSC) — docs/06-features/04-transportation.md.
 * Prices are never facts: price_huf is NULL unless verified (rule 5) — the UI
 * renders "—" + verify state until a human confirms them on bkk.hu.
 */
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, TRIP_ID } from "@/lib/data/trip";
import { TZ_BUDAPEST, todayInTz } from "@/lib/utils/time";

export type TicketCode = "single" | "block10" | "24h" | "72h" | "group_24h" | "100e";
export type AnchorRole = "central" | "accommodation" | "airport_100e" | "night_meeting";

export interface TransitTicket {
  id: string;
  code: TicketCode;
  nameHe: string;
  priceHuf: number | null; // NULL unless verified — never a fact
  verified: boolean;
  source: string;
  lastVerifiedAt: string | null;
  validityText: string | null;
  notes: string | null;
}

export interface AnchorStation {
  id: string;
  role: AnchorRole;
  nameHe: string;
  lines: string[];
  lat: number | null;
  lng: number | null;
  placeUrl: string | null;
  notes: string | null;
  isTbd: boolean;
}

export interface NextItineraryItem {
  id: string;
  title: string;
  startTime: string;
  address: string | null;
  placeName: string | null;
}

export interface TransitData {
  viewerId: string;
  tickets: TransitTicket[];
  anchors: AnchorStation[];
  /** Next itinerary item with a time today (Europe/Budapest); null → Deák fallback. */
  nextItem: NextItineraryItem | null;
  todayIsoBudapest: string;
}

const TICKET_ORDER: TicketCode[] = ["single", "block10", "24h", "72h", "group_24h", "100e"];
const ROLE_ORDER: AnchorRole[] = ["central", "accommodation", "airport_100e", "night_meeting"];

export async function getTransitData(): Promise<TransitData> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const data: TransitData = {
    viewerId: user.id,
    tickets: [],
    anchors: [],
    nextItem: null,
    todayIsoBudapest: todayInTz(TZ_BUDAPEST),
  };

  try {
    const { data: rows, error } = await supabase
      .from("transit_tickets")
      .select("*")
      .eq("trip_id", TRIP_ID);
    if (error) throw error;
    const mapped = new Map<string, TransitTicket>();
    for (const row of rows ?? []) {
      mapped.set(row.code as string, {
        id: row.id,
        code: row.code as TicketCode,
        nameHe: row.name_he,
        priceHuf: row.price_huf === null ? null : Number(row.price_huf),
        verified: row.verified,
        source: row.source,
        lastVerifiedAt: row.last_verified_at,
        validityText: row.validity_text,
        notes: row.notes,
      });
    }
    data.tickets = TICKET_ORDER.map((code) => mapped.get(code)).filter(
      (t): t is TransitTicket => t !== undefined,
    );
  } catch {
    // degrade
  }

  try {
    const { data: rows, error } = await supabase
      .from("transit_anchor_stations")
      .select("*, places(google_maps_url)")
      .eq("trip_id", TRIP_ID);
    if (error) throw error;
    const mapped = new Map<string, AnchorStation>();
    for (const row of rows ?? []) {
      const place = Array.isArray(row.places) ? row.places[0] : row.places;
      mapped.set(row.role as string, {
        id: row.id,
        role: row.role as AnchorRole,
        nameHe: row.name_he,
        lines: row.lines ?? [],
        lat: row.lat === null ? null : Number(row.lat),
        lng: row.lng === null ? null : Number(row.lng),
        placeUrl: place?.google_maps_url ?? null,
        notes: row.notes,
        isTbd: row.lat === null && row.place_id === null,
      });
    }
    data.anchors = ROLE_ORDER.map((role) => mapped.get(role)).filter(
      (a): a is AnchorStation => a !== undefined,
    );
  } catch {
    // degrade
  }

  // Next itinerary item: today's day_plan (Budapest wall date) → first item at/after now.
  try {
    const { data: dayPlans, error: dpErr } = await supabase
      .from("day_plans")
      .select("id")
      .eq("trip_id", TRIP_ID)
      .eq("date", data.todayIsoBudapest)
      .limit(1);
    if (dpErr) throw dpErr;
    const dayPlanId = dayPlans?.[0]?.id;
    if (dayPlanId) {
      const { data: items, error: itErr } = await supabase
        .from("itinerary_items")
        .select("id, title, start_time, address, places(name)")
        .eq("day_plan_id", dayPlanId)
        .order("start_time");
      if (itErr) throw itErr;
      const nowIso = new Date().toISOString();
      const next = (items ?? []).find((i) => i.start_time >= nowIso);
      const chosen = next ?? items?.[0] ?? null;
      if (chosen) {
        const place = Array.isArray(chosen.places) ? chosen.places[0] : chosen.places;
        data.nextItem = {
          id: chosen.id,
          title: chosen.title,
          startTime: chosen.start_time,
          address: chosen.address,
          placeName: place?.name ?? null,
        };
      }
    }
  } catch {
    // degrade
  }

  return data;
}
