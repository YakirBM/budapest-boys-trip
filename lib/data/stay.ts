/**
 * Stay (accommodation) data access (RSC) — docs/06-features/03-accommodation.md.
 * Two modes: no booked row (Mode A — booking mission) vs a booked row (Mode B —
 * home base). Nothing here fabricates a booking: accommodations starts EMPTY.
 */
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, TRIP_ID } from "@/lib/data/trip";

export type AccommodationStatus = "candidate" | "favorite" | "booked" | "rejected";

export interface Accommodation {
  id: string;
  name: string;
  status: AccommodationStatus;
  district: string | null; // parsed out of `notes` prefix (no dedicated column — see docs/03 §13)
  beds: number | null;
  totalPrice: number | null;
  currency: string;
  url: string | null;
  platform: string | null;
  notes: string | null;
  // booked-only fields:
  address: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  bookingRefMasked: string | null;
  hostName: string | null;
  hostPhone: string | null;
  wifiSsid: string | null;
  /** Never sent to the client — revealed on demand via a logged server action. */
  doorCodeMasked: boolean;
  floorLabel: string | null;
  apartmentLabel: string | null;
  intercom: string | null;
  lateCheckinNotes: string | null;
  accessInstructions: string | null;
}

export interface FxRateInfo {
  /** ILS per 1 HUF (quote/base), or null when no rate row exists. */
  ilsPerHuf: number | null;
  fetchedAt: string | null;
  source: string | null;
}

export interface StayChecklist {
  id: string;
  title: string;
  items: { id: string; title: string; status: string; priority: string }[];
}

export interface StayData {
  viewerId: string;
  candidates: Accommodation[];
  booked: Accommodation | null;
  fx: FxRateInfo;
  memberCount: number;
  arrivalChecklist: StayChecklist | null;
  departureChecklist: StayChecklist | null;
}

interface AccommodationRow {
  id: string;
  name: string;
  status: AccommodationStatus;
  beds: number | null;
  total_price: number | null;
  currency: string;
  url: string | null;
  platform: string | null;
  notes: string | null;
  address: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  booking_ref_masked: string | null;
  host_name: string | null;
  host_phone: string | null;
  wifi_ssid: string | null;
  floor_label: string | null;
  apartment_label: string | null;
  intercom: string | null;
  late_checkin_notes: string | null;
  access_instructions: string | null;
}

function mapAccommodation(row: AccommodationRow): Accommodation {
  // District is stored as a "רובע: X" notes prefix by the add form (no dedicated
  // column in the implemented schema — docs/03 §13 reconciliation).
  const districtMatch = row.notes?.match(/^רובע:\s*([^\n]+)\n?/);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    district: districtMatch?.[1]?.trim() ?? null,
    beds: row.beds,
    totalPrice: row.total_price,
    currency: row.currency,
    url: row.url,
    platform: row.platform,
    notes: districtMatch ? row.notes?.slice(districtMatch[0].length).trim() || null : row.notes,
    address: row.address,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    bookingRefMasked: row.booking_ref_masked,
    hostName: row.host_name,
    hostPhone: row.host_phone,
    wifiSsid: row.wifi_ssid,
    doorCodeMasked: true,
    floorLabel: row.floor_label,
    apartmentLabel: row.apartment_label,
    intercom: row.intercom,
    lateCheckinNotes: row.late_checkin_notes,
    accessInstructions: row.access_instructions,
  };
}

const CHECKLIST_SELECT = "id, title, checklist_items(id, title, status, priority, sort_order)";

export async function getStayData(): Promise<StayData> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const data: StayData = {
    viewerId: user.id,
    candidates: [],
    booked: null,
    fx: { ilsPerHuf: null, fetchedAt: null, source: null },
    memberCount: 4,
    arrivalChecklist: null,
    departureChecklist: null,
  };

  try {
    const { data: rows, error } = await supabase
      .from("accommodations")
      .select("*")
      .eq("trip_id", TRIP_ID)
      .in("status", ["candidate", "favorite", "booked"])
      .order("created_at");
    if (error) throw error;
    for (const row of (rows ?? []) as unknown as AccommodationRow[]) {
      if (row.status === "booked") data.booked = mapAccommodation(row);
      else data.candidates.push(mapAccommodation(row));
    }
  } catch {
    // degrade
  }

  try {
    const { data: rates, error } = await supabase
      .from("exchange_rates")
      .select("rate, fetched_at, source")
      .eq("base", "HUF")
      .eq("quote", "ILS")
      .order("fetched_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const rate = rates?.[0];
    if (rate) {
      data.fx = { ilsPerHuf: Number(rate.rate), fetchedAt: rate.fetched_at, source: rate.source };
    }
  } catch {
    // degrade
  }

  try {
    const { data: members, error } = await supabase
      .from("trip_members")
      .select("user_id")
      .eq("trip_id", TRIP_ID)
      .eq("status", "active");
    if (error) throw error;
    if ((members?.length ?? 0) > 0) data.memberCount = members?.length ?? 4;
  } catch {
    // degrade
  }

  // Arrival ("כניסה לדירה", …0403) + departure ("יום החזרה", …0406) seeded lists —
  // matched by fixed UUIDs from the seed (docs/09).
  try {
    const { data: lists, error } = await supabase
      .from("checklists")
      .select(CHECKLIST_SELECT)
      .eq("trip_id", TRIP_ID)
      .in("id", [
        "00000000-0000-4000-8000-000000000403",
        "00000000-0000-4000-8000-000000000406",
      ]);
    if (error) throw error;
    for (const list of lists ?? []) {
      const items = (list.checklist_items ?? [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((i: { id: string; title: string; status: string; priority: string }) => ({
          id: i.id,
          title: i.title,
          status: i.status,
          priority: i.priority,
        }));
      const checklist: StayChecklist = { id: list.id, title: list.title, items };
      if (list.id === "00000000-0000-4000-8000-000000000403") data.arrivalChecklist = checklist;
      if (list.id === "00000000-0000-4000-8000-000000000406") data.departureChecklist = checklist;
    }
  } catch {
    // degrade
  }

  return data;
}
