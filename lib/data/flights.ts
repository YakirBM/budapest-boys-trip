/**
 * Flights data access (RSC) — docs/06-features/02-flights.md.
 * Every query is RLS-scoped by the caller's session. Per-query failures degrade
 * to null (page renders the offline snapshot instead) — requireUser's redirect
 * is NEVER swallowed.
 */
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, TRIP_ID } from "@/lib/data/trip";

export type FlightDirection = "outbound" | "return";
export type FlightStatus = "scheduled" | "boarding" | "departed" | "landed" | "cancelled";

export interface Flight {
  id: string;
  direction: FlightDirection;
  airline: string;
  flightNo: string;
  depAirport: string;
  depTerminal: string | null;
  arrAirport: string;
  depTime: string; // ISO instant
  /** NULL until verified from Arkia — never invent (hard rule 5). */
  arrTime: string | null;
  arrTimeVerified: boolean;
  /** Doc-mandated estimated arrival wall time (doc 02 verified facts table) — rendered only as an estimate. */
  estArrivalWall: string | null;
  bookingRefMasked: string | null;
  status: FlightStatus;
  notes: string | null;
  source: string | null;
  lastVerifiedAt: string | null;
}

export interface Passenger {
  id: string;
  flightId: string;
  memberId: string;
  fullName: string;
  eticketSerialMasked: string | null;
  seat: string | null;
  checkedIn: boolean;
  checkinDoneAt: string | null;
}

export interface EticketDoc {
  id: string;
  title: string;
  mime: string | null;
  bytes: number | null;
  createdAt: string;
}

export interface FlightsData {
  viewerId: string;
  flights: Flight[];
  passengers: Passenger[];
  /** Flights the viewer already cross-checked on Arkia (app_events verify.arrival). */
  arrivalCheckedAt: Record<string, string>;
  eticketDoc: EticketDoc | null;
}

/** Doc 02 verified-facts table: estimated arrivals while arr_time is unverified. */
const EST_ARRIVAL_WALL: Record<FlightDirection, string> = {
  outbound: "19:50", // Europe/Budapest
  return: "15:05", // Asia/Jerusalem
};

export async function getFlightsData(): Promise<FlightsData> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const flights: Flight[] = [];
  const passengers: Passenger[] = [];
  const arrivalCheckedAt: Record<string, string> = {};
  let eticketDoc: EticketDoc | null = null;

  try {
    const { data, error } = await supabase
      .from("flights")
      .select("*")
      .eq("trip_id", TRIP_ID)
      .order("dep_time");
    if (error) throw error;
    for (const row of data ?? []) {
      const direction = row.direction as FlightDirection;
      flights.push({
        id: row.id,
        direction,
        airline: row.airline,
        flightNo: row.flight_no,
        depAirport: row.dep_airport,
        depTerminal: row.dep_terminal,
        arrAirport: row.arr_airport,
        depTime: row.dep_time,
        arrTime: row.arr_time,
        arrTimeVerified: row.arr_time_verified,
        estArrivalWall: row.arr_time ? null : EST_ARRIVAL_WALL[direction],
        bookingRefMasked: row.booking_ref_masked,
        status: row.status as FlightStatus,
        notes: row.notes,
        source: row.source,
        lastVerifiedAt: row.last_verified_at,
      });
    }
  } catch {
    // degrade — offline snapshot path
  }

  const flightIds = flights.map((f) => f.id);

  if (flightIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from("flight_passengers")
        .select(
          "id, flight_id, member_id, eticket_serial_masked, seat, checked_in, checkin_done_at",
        )
        .in("flight_id", flightIds)
        .order("created_at");
      if (error) throw error;
      const memberIds = [...new Set((data ?? []).map((p) => p.member_id))];
      const names = new Map<string, string>();
      if (memberIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", memberIds);
        for (const p of profiles ?? []) names.set(p.id, p.full_name);
      }
      for (const row of data ?? []) {
        passengers.push({
          id: row.id,
          flightId: row.flight_id,
          memberId: row.member_id,
          fullName: names.get(row.member_id) ?? "—",
          eticketSerialMasked: row.eticket_serial_masked,
          seat: row.seat,
          checkedIn: row.checked_in,
          checkinDoneAt: row.checkin_done_at,
        });
      }
    } catch {
      // degrade
    }
  }

  try {
    const { data, error } = await supabase
      .from("app_events")
      .select("entity_id, created_at")
      .eq("actor_id", user.id)
      .eq("action", "verify.arrival")
      .eq("entity", "flights")
      .order("created_at", { ascending: false });
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.entity_id && !(row.entity_id in arrivalCheckedAt)) {
        arrivalCheckedAt[row.entity_id] = row.created_at;
      }
    }
  } catch {
    // degrade
  }

  try {
    const { data, error } = await supabase
      .from("documents")
      .select("id, title, mime, bytes, created_at")
      .eq("trip_id", TRIP_ID)
      .eq("owner_id", user.id)
      .eq("document_type", "eticket")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = data?.[0];
    if (row) {
      eticketDoc = {
        id: row.id,
        title: row.title,
        mime: row.mime,
        bytes: row.bytes,
        createdAt: row.created_at,
      };
    }
  } catch {
    // degrade
  }

  return { viewerId: user.id, flights, passengers, arrivalCheckedAt, eticketDoc };
}

/** Seeded Arkia support numbers (emergency_contacts, kind='airline') — never invented. */
export async function getAirlineContacts(): Promise<{ intl: string; local: string }> {
  const supabase = await getSupabaseServerClient();
  try {
    const { data, error } = await supabase
      .from("emergency_contacts")
      .select("phone")
      .eq("trip_id", TRIP_ID)
      .eq("kind", "airline")
      .order("sort_order");
    if (error) throw error;
    const intl = data?.find((row) => row.phone.startsWith("+"))?.phone ?? "+972-3-6903712";
    const local = data?.find((row) => !row.phone.startsWith("+"))?.phone ?? "*5758";
    return { intl, local };
  } catch {
    return { intl: "+972-3-6903712", local: "*5758" };
  }
}
