import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, CurrencyCode, ItineraryStatus } from "@/components/ui/types";
import type { FeasibilityInput } from "@/lib/utils/feasibility";
import {
  DEPARTURE_DAY_BUFFER_MIN,
  DEFAULT_BUFFER_MIN,
  resolveNextUp,
} from "@/lib/utils/feasibility";

/**
 * Server + client shared data access for the Today dashboard
 * (docs/06-features/00-today-dashboard.md). The same fetch functions run in RSC
 * (getSupabaseServerClient) and in the browser query layer (getSupabaseBrowserClient),
 * so the client cache starts with identical server data (initialData) and realtime
 * refetches reuse the exact same shapes.
 *
 * CLIENT-SAFE: this module must never import `lib/supabase/server` (next/headers).
 * RSC pages create the server client themselves and pass it in; the fixed trip id
 * is duplicated here because `lib/data/trip` is server-only by transitive import.
 */

/** The single trip row id — mirrors lib/data/trip.ts TRIP_ID (kept in sync). */
export const TRIP_ID = "00000000-0000-4000-8000-000000000001";

export interface MemberInfo {
  id: string;
  fullName: string;
  active: boolean;
  role: "owner" | "member";
}

export interface PlaceRef {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  googleMapsUrl: string | null;
  district: string | null;
  source: string | null;
  lastVerifiedAt: string | null;
}

export interface ReservationRef {
  provider: string;
  refMasked: string | null;
  status: string;
}

export interface TripItem {
  id: string;
  dayPlanId: string;
  dayNumber: number;
  title: string;
  category: Category;
  startTime: string;
  endTime: string | null;
  durationMin: number | null;
  travelMinToNext: number | null;
  address: string | null;
  navUrl: string | null;
  estCostPerPerson: number | null;
  estCostGroup: number | null;
  currency: CurrencyCode;
  status: ItineraryStatus;
  ownerId: string | null;
  ownerName: string | null;
  isRequired: boolean;
  backupItemId: string | null;
  backupTitle: string | null;
  place: PlaceRef | null;
  reservation: ReservationRef | null;
  sortOrder: number;
}

export interface WeatherInfo {
  day: string;
  tempMin: number | null;
  tempMax: number | null;
  precipProb: number | null;
  wind: number | null;
  sunsetTime: string | null;
  source: string | null;
  fetchedAt: string | null;
}

export interface DayNoteInfo {
  id: string;
  body: string;
  noteKind: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  /** True when created locally from the offline outbox and not yet synced. */
  pending?: boolean;
}

export interface OpenPollInfo {
  id: string;
  question: string;
  votes: number;
}

export interface AccommodationInfo {
  booked: boolean;
  name: string | null;
  address: string | null;
}

export interface DayPlanInfo {
  id: string;
  dayNumber: number;
  date: string;
  title: string | null;
}

export interface TodayData {
  dayNumber: number;
  dayPlan: DayPlanInfo | null;
  items: TripItem[];
  members: MemberInfo[];
  activeMemberCount: number;
  weather: WeatherInfo | null;
  accommodation: AccommodationInfo;
  checkinDone: number;
  checkinTotal: number;
  outboundDeparture: string | null;
  nextUpId: string | null;
}

export interface TodayFeedData {
  dayNumber: number;
  notes: DayNoteInfo[];
  openPolls: OpenPollInfo[];
}

/* ------------------------------------------------------------------ */
/* Raw row shapes (PostgREST returns ISO strings for timestamptz).     */
/* ------------------------------------------------------------------ */

interface RawPlace {
  id: string;
  name: string;
  lat: number | string | null;
  lng: number | string | null;
  google_maps_url: string | null;
  district: string | null;
  source: string | null;
  last_verified_at: string | null;
}

interface RawReservation {
  provider: string;
  ref_masked: string | null;
  status: string;
}

interface RawItem {
  id: string;
  day_plan_id: string;
  title: string;
  category: Category;
  start_time: string;
  end_time: string | null;
  duration_min: number | null;
  travel_min_to_next: number | null;
  address: string | null;
  est_cost_per_person: number | string | null;
  est_cost_group: number | string | null;
  currency: string;
  status: ItineraryStatus;
  owner_id: string | null;
  is_required: boolean;
  backup_item_id: string | null;
  notes: string | null;
  sort_order: number | null;
  places: RawPlace | RawPlace[] | null;
  reservations: RawReservation[] | null;
  backup: { id: string; title: string } | { id: string; title: string }[] | null;
}

export type { RawItem };

interface RawWeather {
  day: string;
  temp_min: number | string | null;
  temp_max: number | string | null;
  precip_prob: number | string | null;
  wind: number | string | null;
  sunset_time: string | null;
  source: string | null;
  fetched_at: string | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function first<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function buildNavUrl(place: PlaceRef | null, address: string | null): string | null {
  if (place && place.lat !== null && place.lng !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=transit`;
  }
  if (address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=transit`;
  }
  if (place?.googleMapsUrl) return place.googleMapsUrl;
  return null;
}

export function mapRawItem(raw: RawItem, dayNumber: number, memberNames: Map<string, string>): TripItem {
  const placeRaw = first(raw.places ?? null);
  const backupRaw = first(raw.backup ?? null);
  const place: PlaceRef | null = placeRaw
    ? {
        id: placeRaw.id,
        name: placeRaw.name,
        lat: toNumber(placeRaw.lat),
        lng: toNumber(placeRaw.lng),
        googleMapsUrl: placeRaw.google_maps_url,
        district: placeRaw.district,
        source: placeRaw.source,
        lastVerifiedAt: placeRaw.last_verified_at,
      }
    : null;
  const reservationRaw = raw.reservations?.[0] ?? null;
  const address = raw.address ?? place?.district ?? null;
  return {
    id: raw.id,
    dayPlanId: raw.day_plan_id,
    dayNumber,
    title: raw.title,
    category: raw.category,
    startTime: raw.start_time,
    endTime: raw.end_time,
    durationMin: raw.duration_min,
    travelMinToNext: raw.travel_min_to_next,
    address,
    navUrl: buildNavUrl(place, address),
    estCostPerPerson: toNumber(raw.est_cost_per_person),
    estCostGroup: toNumber(raw.est_cost_group),
    currency: (raw.currency as CurrencyCode) ?? "HUF",
    status: raw.status,
    ownerId: raw.owner_id,
    ownerName: raw.owner_id ? (memberNames.get(raw.owner_id) ?? null) : null,
    isRequired: raw.is_required,
    backupItemId: raw.backup_item_id,
    backupTitle: backupRaw?.title ?? null,
    place,
    reservation: reservationRaw
      ? { provider: reservationRaw.provider, refMasked: reservationRaw.ref_masked, status: reservationRaw.status }
      : null,
    sortOrder: raw.sort_order ?? 0,
  };
}

/** Feasibility/NextUp input for one item (doc 00 rule 8). */
export function toFeasibilityInput(item: TripItem): FeasibilityInput {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    startTime: Date.parse(item.startTime),
    endTime: item.endTime ? Date.parse(item.endTime) : null,
    durationMin: item.durationMin,
    travelMinToNext: item.travelMinToNext,
    hasReservation: item.reservation !== null,
  };
}

/** Day 5 compressed morning raises the buffer floor (doc 00 edge case). */
export function bufferForDay(dayNumber: number): number {
  return dayNumber >= 5 ? DEPARTURE_DAY_BUFFER_MIN : DEFAULT_BUFFER_MIN;
}

/* ------------------------------------------------------------------ */
/* Fetchers                                                            */
/* ------------------------------------------------------------------ */

export async function fetchMembers(supabase: SupabaseClient): Promise<MemberInfo[]> {
  // Two-step fetch: profiles is not embeddable from trip_members (FK via auth.users).
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
    id: row.user_id,
    fullName: nameById.get(row.user_id) ?? "—",
    active: row.status === "active",
    role: row.role,
  }));
}

/**
 * Legal status transitions (docs/06-features/00 rule 5). `completed` is terminal;
 * skipped/cancelled → planned is owner-only (checked server-side).
 * Shared by the StatusMenu UI and the server action so UI and DB agree.
 */
export const LEGAL_TRANSITIONS: Record<ItineraryStatus, readonly ItineraryStatus[]> = {
  planned: ["confirmed", "skipped", "cancelled"],
  confirmed: ["in_progress", "skipped", "cancelled"],
  in_progress: ["completed", "skipped"],
  completed: [],
  skipped: ["planned"],
  cancelled: ["planned"],
};

const ITEM_SELECT = `id, day_plan_id, title, category, start_time, end_time, duration_min,
  travel_min_to_next, address, est_cost_per_person, est_cost_group, currency, status,
  owner_id, is_required, backup_item_id, notes, sort_order,
  places(id, name, lat, lng, google_maps_url, district, source, last_verified_at),
  reservations(provider, ref_masked, status),
  backup:itinerary_items!backup_item_id(id, title)`;

async function fetchDayPlan(
  supabase: SupabaseClient,
  dayNumber: number,
): Promise<{ plan: DayPlanInfo; rawItems: RawItem[] } | null> {
  const { data, error } = await supabase
    .from("day_plans")
    .select(`id, day_number, date, title, itinerary_items(${ITEM_SELECT})`)
    .eq("trip_id", TRIP_ID)
    .eq("day_number", dayNumber)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const raw = data as unknown as {
    id: string;
    day_number: number;
    date: string;
    title: string | null;
    itinerary_items: RawItem[] | null;
  };
  const items = [...(raw.itinerary_items ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  return {
    plan: { id: raw.id, dayNumber: raw.day_number, date: raw.date, title: raw.title },
    rawItems: items,
  };
}

export async function fetchTodayData(
  supabase: SupabaseClient,
  dayNumber: number,
): Promise<TodayData> {
  const members = await fetchMembers(supabase);
  const memberNames = new Map(members.map((m) => [m.id, m.fullName]));
  const day = await fetchDayPlan(supabase, dayNumber);

  const items: TripItem[] = day
    ? day.rawItems.map((raw) => mapRawItem(raw, dayNumber, memberNames))
    : [];

  // Parallel reads for the strip (weather, accommodation, check-in, flight).
  const dayDate = day?.plan.date ?? null;
  const [weatherRes, accommodationRes, flightRes] = await Promise.all([
    dayDate
      ? supabase
          .from("weather_cache")
          .select("day, temp_min, temp_max, precip_prob, wind, sunset_time, source, fetched_at")
          .eq("day", dayDate)
          .order("fetched_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("accommodations")
      .select("name, address, status")
      .eq("trip_id", TRIP_ID)
      .eq("status", "booked")
      .limit(1),
    supabase
      .from("flights")
      .select("dep_time, flight_passengers(checked_in)")
      .eq("trip_id", TRIP_ID)
      .eq("direction", "outbound")
      .maybeSingle(),
  ]);

  const weatherRaw = (weatherRes.data as RawWeather[] | null)?.[0] ?? null;
  const accommodationRaw = (accommodationRes.data as { name: string; address: string; status: string }[] | null)?.[0] ?? null;
  const flightRaw = flightRes.data as
    | { dep_time: string | null; flight_passengers: { checked_in: boolean }[] | null }
    | null;

  const itemsFeasibility = items.map(toFeasibilityInput);
  const nextUp = resolveNextUp(itemsFeasibility, Date.now());

  return {
    dayNumber,
    dayPlan: day?.plan ?? null,
    items,
    members,
    activeMemberCount: Math.max(1, members.filter((m) => m.active).length),
    weather: weatherRaw
      ? {
          day: weatherRaw.day,
          tempMin: toNumber(weatherRaw.temp_min ?? null),
          tempMax: toNumber(weatherRaw.temp_max ?? null),
          precipProb: toNumber(weatherRaw.precip_prob ?? null),
          wind: toNumber(weatherRaw.wind ?? null),
          sunsetTime: weatherRaw.sunset_time ?? null,
          source: weatherRaw.source ?? null,
          fetchedAt: weatherRaw.fetched_at ?? null,
        }
      : null,
    accommodation: accommodationRaw
      ? { booked: true, name: accommodationRaw.name, address: accommodationRaw.address }
      : { booked: false, name: null, address: null },
    checkinDone: (flightRaw?.flight_passengers ?? []).filter((p) => p.checked_in).length,
    checkinTotal: (flightRaw?.flight_passengers ?? []).length,
    outboundDeparture: flightRaw?.dep_time ?? null,
    nextUpId: nextUp?.id ?? null,
  };
}

export async function fetchTodayFeed(
  supabase: SupabaseClient,
  dayNumber: number,
): Promise<TodayFeedData> {
  const members = await fetchMembers(supabase);
  const memberNames = new Map(members.map((m) => [m.id, m.fullName]));

  const planRes = await supabase
    .from("day_plans")
    .select("id")
    .eq("trip_id", TRIP_ID)
    .eq("day_number", dayNumber)
    .maybeSingle();
  const planId = (planRes.data as { id: string } | null)?.id ?? null;

  if (!planId) return { dayNumber, notes: [], openPolls: [] };

  const [notesRes, pollsRes] = await Promise.all([
    supabase
      .from("day_notes")
      .select("id, body, note_kind, author_id, created_at")
      .eq("day_plan_id", planId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("polls")
      .select("id, question, votes(poll_id)")
      .eq("trip_id", TRIP_ID)
      .eq("status", "open")
      .order("deadline")
      .limit(5),
  ]);

  const notesRaw = (notesRes.data ?? []) as {
    id: string;
    body: string;
    note_kind: string;
    author_id: string;
    created_at: string;
  }[];

  return {
    dayNumber,
    notes: notesRaw.map((n) => ({
      id: n.id,
      body: n.body,
      noteKind: n.note_kind,
      authorId: n.author_id,
      authorName: memberNames.get(n.author_id) ?? null,
      createdAt: n.created_at,
    })),
    openPolls: ((pollsRes.data ?? []) as { id: string; question: string; votes: unknown[] }[]).map(
      (p) => ({ id: p.id, question: p.question, votes: p.votes.length }),
    ),
  };
}
