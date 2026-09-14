import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, CurrencyCode } from "@/components/ui/types";
import {
  fetchMembers,
  mapRawItem,
  TRIP_ID,
  type DayPlanInfo,
  type MemberInfo,
  type RawItem,
  type TripItem,
} from "@/lib/data/today";

/** Re-exported for client components (lib/data/trip is server-only by transitive import). */
export { TRIP_ID };

/**
 * Server + client shared data access for Route & Places + the Map tab
 * (docs/06-features/01-route-and-places.md). Same shape in RSC and browser
 * queryFn so offline snapshots and realtime refetches stay consistent.
 * CLIENT-SAFE: never import `lib/supabase/server` here — RSC pages pass the
 * server client in explicitly.
 */

export type PlaceStatus =
  | "idea"
  | "under_review"
  | "approved"
  | "scheduled"
  | "visited"
  | "rejected";

export interface LibraryPlace {
  id: string;
  name: string;
  type: PlaceType;
  category: Category;
  status: PlaceStatus;
  district: string | null;
  estPrice: number | null;
  priceCurrency: CurrencyCode;
  note: string | null;
  source: string | null;
  lastVerifiedAt: string | null;
  tags: string[];
  needsReservation: boolean;
  suggestedByName: string | null;
  lat: number | null;
  lng: number | null;
  googleMapsUrl: string | null;
  address: string | null;
  phone: string | null;
  imageUrl: string | null;
  openingHoursNote: string | null;
}

export interface DayCost {
  dayNumber: number;
  /** Σ item estimates (HUF): est_cost_group ?? est_cost_per_person × members. */
  estimateHuf: number;
  /** Σ confirmed/settled non-personal expenses converted to HUF base. */
  actualHuf: number;
  /** Non-HUF estimates rendered separately (no fx fabrication). */
  extras: { amount: number; currency: CurrencyCode }[];
  hasUnverified: boolean;
}

export interface RouteData {
  dayPlans: DayPlanInfo[];
  selectedDay: number;
  /** Items of ALL days (each carries dayNumber); the client filters. */
  items: TripItem[];
  dayCosts: DayCost[];
  places: LibraryPlace[];
  members: MemberInfo[];
  activeMemberCount: number;
}

export interface MapPlace {
  id: string;
  name: string;
  category: Category;
  status: PlaceStatus;
  district: string | null;
  lat: number | null;
  lng: number | null;
  googleMapsUrl: string | null;
  estPrice: number | null;
  priceCurrency: CurrencyCode;
  lastVerifiedAt: string | null;
  scheduledDay: number | null;
}

export interface AnchorStation {
  id: string;
  role: string;
  nameHe: string;
  lines: string[];
  lat: number | null;
  lng: number | null;
  verified: boolean;
  placeId: string | null;
}

export interface MapData {
  places: MapPlace[];
  anchors: AnchorStation[];
}

/* ------------------------------------------------------------------ */

export type PlaceType =
  | "restaurant"
  | "bar"
  | "cafe"
  | "attraction"
  | "viewpoint"
  | "bath"
  | "shopping"
  | "airport"
  | "transit_hub"
  | "bus_stop"
  | "emergency"
  | "meeting_point"
  | "other";

export function placeTypeToCategory(type: PlaceType): Category {
  switch (type) {
    case "restaurant":
    case "bar":
    case "cafe":
      return "food";
    case "attraction":
    case "viewpoint":
      return "attraction";
    case "bath":
      return "rest";
    case "airport":
    case "transit_hub":
    case "bus_stop":
      return "transit";
    default:
      return "other";
  }
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function openingHoursNote(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const note = (value as Record<string, unknown>)["note"];
  return typeof note === "string" && note.trim() ? note.trim() : null;
}

const ITEM_SELECT = `id, day_plan_id, title, category, start_time, end_time, duration_min,
  travel_min_to_next, address, est_cost_per_person, est_cost_group, currency, status,
  owner_id, is_required, backup_item_id, notes, sort_order,
  places(id, name, lat, lng, google_maps_url, district, source, last_verified_at),
  reservations(provider, ref_masked, status),
  backup:itinerary_items!backup_item_id(id, title)`;

interface RawDayPlanWithItems {
  id: string;
  day_number: number;
  date: string;
  title: string | null;
  itinerary_items: RawItem[] | null;
}

export async function fetchRouteData(
  supabase: SupabaseClient,
  dayNumber: number,
): Promise<RouteData> {
  const members = await fetchMembers(supabase);
  const memberNames = new Map(members.map((m) => [m.id, m.fullName]));
  const activeMemberCount = Math.max(1, members.filter((m) => m.active).length);

  const [plansRes, expensesRes, placesRes] = await Promise.all([
    supabase
      .from("day_plans")
      .select(`id, day_number, date, title, itinerary_items(${ITEM_SELECT})`)
      .eq("trip_id", TRIP_ID)
      .order("day_number"),
    supabase
      .from("expenses")
      .select("day_number, amount, currency, amount_base_huf, is_personal, status")
      .eq("trip_id", TRIP_ID),
    supabase
      .from("places")
      .select(
        `id, name, type, status, district, address_text, phone, image_url, opening_hours,
         est_price, price_currency, note, source, last_verified_at, tags,
         needs_reservation, suggested_by, lat, lng, google_maps_url`,
      )
      .eq("trip_id", TRIP_ID)
      .order("created_at", { ascending: false }),
  ]);

  if (plansRes.error) throw plansRes.error;
  if (expensesRes.error) throw expensesRes.error;
  if (placesRes.error) throw placesRes.error;

  const plansRaw = (plansRes.data ?? []) as unknown as RawDayPlanWithItems[];
  const dayPlans: DayPlanInfo[] = plansRaw.map((p) => ({
    id: p.id,
    dayNumber: p.day_number,
    date: p.date,
    title: p.title,
  }));

  const items: TripItem[] = [];
  for (const plan of plansRaw) {
    const rawItems = [...(plan.itinerary_items ?? [])];
    rawItems.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const raw of rawItems) {
      items.push(mapRawItem(raw, plan.day_number, memberNames));
    }
  }

  const expenses = (expensesRes.data ?? []) as {
    day_number: number | null;
    amount: number | string;
    currency: string;
    amount_base_huf: number | string | null;
    is_personal: boolean;
    status: string;
  }[];

  const dayCosts: DayCost[] = dayPlans.map((plan) => {
    const dayItems = items.filter((i) => i.dayNumber === plan.dayNumber);
    let estimateHuf = 0;
    const extras = new Map<string, number>();
    let hasUnverified = false;
    for (const item of dayItems) {
      const groupCost =
        item.estCostGroup ??
        (item.estCostPerPerson !== null ? item.estCostPerPerson * activeMemberCount : null);
      if (groupCost === null) continue;
      if (item.currency === "HUF") {
        estimateHuf += groupCost;
      } else {
        extras.set(item.currency, (extras.get(item.currency) ?? 0) + groupCost);
      }
      if (item.place?.lastVerifiedAt == null) hasUnverified = true;
    }
    let actualHuf = 0;
    for (const expense of expenses) {
      if (expense.day_number !== plan.dayNumber) continue;
      if (expense.is_personal) continue;
      if (!(expense.status === "confirmed" || expense.status === "settled")) continue;
      const base = toNumber(expense.amount_base_huf);
      if (base !== null) {
        actualHuf += base;
      } else if (expense.currency === "HUF") {
        actualHuf += toNumber(expense.amount) ?? 0;
      }
    }
    return {
      dayNumber: plan.dayNumber,
      estimateHuf,
      actualHuf,
      extras: [...extras.entries()].map(([currency, amount]) => ({
        amount,
        currency: currency as CurrencyCode,
      })),
      hasUnverified,
    };
  });

  const placesRaw = (placesRes.data ?? []) as {
    id: string;
    name: string;
    type: PlaceType;
    status: PlaceStatus;
    district: string | null;
    est_price: number | string | null;
    price_currency: string;
    note: string | null;
    source: string | null;
    last_verified_at: string | null;
    tags: string[] | null;
    needs_reservation: boolean;
    suggested_by: string | null;
    lat: number | string | null;
    lng: number | string | null;
    google_maps_url: string | null;
    address_text: string | null;
    phone: string | null;
    image_url: string | null;
    opening_hours: unknown;
  }[];

  const places: LibraryPlace[] = placesRaw.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    category: placeTypeToCategory(p.type),
    status: p.status,
    district: p.district,
    estPrice: toNumber(p.est_price),
    priceCurrency: (p.price_currency as CurrencyCode) ?? "HUF",
    note: p.note,
    source: p.source,
    lastVerifiedAt: p.last_verified_at,
    tags: p.tags ?? [],
    needsReservation: p.needs_reservation,
    suggestedByName: p.suggested_by ? (memberNames.get(p.suggested_by) ?? null) : null,
    lat: toNumber(p.lat),
    lng: toNumber(p.lng),
    googleMapsUrl: p.google_maps_url,
    address: p.address_text,
    phone: p.phone,
    imageUrl: p.image_url,
    openingHoursNote: openingHoursNote(p.opening_hours),
  }));

  return {
    dayPlans,
    selectedDay: dayNumber,
    items,
    dayCosts,
    places,
    members,
    activeMemberCount,
  };
}

export async function fetchMapData(supabase: SupabaseClient): Promise<MapData> {
  const [placesRes, scheduleRes, anchorsRes] = await Promise.all([
    supabase
      .from("places")
      .select(
        `id, name, type, status, district, est_price, price_currency, last_verified_at,
         lat, lng, google_maps_url`,
      )
      .eq("trip_id", TRIP_ID)
      .order("name"),
    supabase
      .from("day_plans")
      .select("day_number, itinerary_items(place_id)")
      .eq("trip_id", TRIP_ID)
      .order("day_number"),
    supabase
      .from("transit_anchor_stations")
      .select("id, role, name_he, lines, lat, lng, verified, place_id")
      .eq("trip_id", TRIP_ID)
      .order("id"),
  ]);

  if (placesRes.error) throw placesRes.error;
  if (scheduleRes.error) throw scheduleRes.error;
  if (anchorsRes.error) throw anchorsRes.error;

  const scheduledByPlace = new Map<string, number>();
  for (const plan of (scheduleRes.data ?? []) as unknown as {
    day_number: number;
    itinerary_items: { place_id: string | null }[] | null;
  }[]) {
    for (const item of plan.itinerary_items ?? []) {
      if (item.place_id && !scheduledByPlace.has(item.place_id)) {
        scheduledByPlace.set(item.place_id, plan.day_number);
      }
    }
  }

  const places: MapPlace[] = ((placesRes.data ?? []) as {
    id: string;
    name: string;
    type: PlaceType;
    status: PlaceStatus;
    district: string | null;
    est_price: number | string | null;
    price_currency: string;
    last_verified_at: string | null;
    lat: number | string | null;
    lng: number | string | null;
    google_maps_url: string | null;
  }[]).map((p) => ({
    id: p.id,
    name: p.name,
    category: placeTypeToCategory(p.type),
    status: p.status,
    district: p.district,
    lat: toNumber(p.lat),
    lng: toNumber(p.lng),
    googleMapsUrl: p.google_maps_url,
    estPrice: toNumber(p.est_price),
    priceCurrency: (p.price_currency as CurrencyCode) ?? "HUF",
    lastVerifiedAt: p.last_verified_at,
    scheduledDay: scheduledByPlace.get(p.id) ?? null,
  }));

  const anchors: AnchorStation[] = ((anchorsRes.data ?? []) as {
    id: string;
    role: string;
    name_he: string;
    lines: string[] | null;
    lat: number | string | null;
    lng: number | string | null;
    verified: boolean;
    place_id: string | null;
  }[]).map((a) => ({
    id: a.id,
    role: a.role,
    nameHe: a.name_he,
    lines: a.lines ?? [],
    lat: toNumber(a.lat),
    lng: toNumber(a.lng),
    verified: a.verified,
    placeId: a.place_id,
  }));

  return { places, anchors };
}
