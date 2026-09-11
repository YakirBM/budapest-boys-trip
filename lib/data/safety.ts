/**
 * Safety & medical data access (RSC) — docs/06-features/08-medical-safety.md.
 * Hard privacy boundaries enforced here + by RLS:
 * - Insurance rows are owner-only (RLS) and carry MASKED policy numbers only.
 * - Medical profiles of others are never fetched here — they go exclusively
 *   through the logged reveal server action (lib/actions/safety.ts).
 * - Location is never read or stored by this module.
 */
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, TRIP_ID } from "@/lib/data/trip";

export type ProfileVisibility = "private" | "members" | "emergency_only";

export interface EmergencyContact {
  id: string;
  label: string;
  phone: string;
  kind: "emergency" | "airline" | "consular" | "other";
  source: string | null;
  lastVerifiedAt: string | null;
}

export interface MyInsurance {
  id: string;
  insurer: string;
  policyNoMasked: string | null;
  emergencyPhone: string | null;
  validUntil: string | null;
  userVerifiedAt: string | null;
  document: { id: string; title: string; mime: string | null } | null;
}

export interface MyMedicalProfile {
  allergies: string[];
  medications: string[];
  conditions: string[];
  bloodType: string | null;
  iceName: string;
  icePhone: string;
  visibility: ProfileVisibility;
  updatedAt: string | null;
}

export interface SoloNotice {
  id: string;
  memberId: string;
  memberName: string;
  destination: string | null;
  expectedReturn: string | null;
  isMine: boolean;
}

export interface AccessLogEntry {
  id: string;
  actorName: string;
  createdAt: string;
}

export interface SafetyData {
  viewerId: string;
  viewerName: string;
  contacts: EmergencyContact[];
  bookedAddress: { name: string; address: string } | null;
  nightMeeting: { nameHe: string; lat: number | null; lng: number | null; placeUrl: string | null; isTbd: boolean } | null;
  insurance: MyInsurance | null;
  medicalProfile: MyMedicalProfile | null;
  soloNotices: SoloNotice[];
  accessLog: AccessLogEntry[];
  /** Active members' phones (group-visible basics per RLS) — for wa.me deep links. */
  memberPhones: { id: string; phone: string | null }[];
}

export async function getSafetyData(): Promise<SafetyData> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser();

  const data: SafetyData = {
    viewerId: user.id,
    viewerName: "—",
    contacts: [],
    bookedAddress: null,
    nightMeeting: null,
    insurance: null,
    medicalProfile: null,
    soloNotices: [],
    accessLog: [],
    memberPhones: [],
  };

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    data.viewerName = profile?.full_name ?? "—";
  } catch {
    // degrade
  }

  try {
    const { data: rows, error } = await supabase
      .from("emergency_contacts")
      .select("*")
      .eq("trip_id", TRIP_ID)
      .order("sort_order");
    if (error) throw error;
    data.contacts = (rows ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      phone: row.phone,
      kind: row.kind,
      source: row.source,
      lastVerifiedAt: row.last_verified_at,
    }));
  } catch {
    // degrade
  }

  try {
    const { data: rows, error } = await supabase
      .from("accommodations")
      .select("name, address")
      .eq("trip_id", TRIP_ID)
      .eq("status", "booked")
      .limit(1);
    if (error) throw error;
    const row = rows?.[0];
    if (row?.address) data.bookedAddress = { name: row.name, address: row.address };
  } catch {
    // degrade
  }

  try {
    const { data: rows, error } = await supabase
      .from("transit_anchor_stations")
      .select("name_he, lat, lng, place_id, places(google_maps_url)")
      .eq("trip_id", TRIP_ID)
      .eq("role", "night_meeting")
      .limit(1);
    if (error) throw error;
    const row = rows?.[0];
    if (row) {
      const place = Array.isArray(row.places) ? row.places[0] : row.places;
      data.nightMeeting = {
        nameHe: row.name_he,
        lat: row.lat === null ? null : Number(row.lat),
        lng: row.lng === null ? null : Number(row.lng),
        placeUrl: place?.google_maps_url ?? null,
        isTbd: row.lat === null && row.place_id === null,
      };
    }
  } catch {
    // degrade
  }

  try {
    const { data: rows, error } = await supabase
      .from("insurance_policies")
      .select(
        "id, insurer, policy_no_masked, emergency_phone, valid_until, user_verified_at, documents(id, title, mime)",
      )
      .eq("user_id", user.id)
      .limit(1);
    if (error) throw error;
    const row = rows?.[0];
    if (row) {
      const doc = Array.isArray(row.documents) ? row.documents[0] : row.documents;
      data.insurance = {
        id: row.id,
        insurer: row.insurer,
        policyNoMasked: row.policy_no_masked,
        emergencyPhone: row.emergency_phone,
        validUntil: row.valid_until,
        userVerifiedAt: row.user_verified_at,
        document: doc ? { id: doc.id, title: doc.title, mime: doc.mime } : null,
      };
    }
  } catch {
    // degrade
  }

  try {
    const { data: row, error } = await supabase
      .from("emergency_profiles")
      .select("allergies, medications, conditions, blood_type, ice_name, ice_phone, visibility, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (row) {
      data.medicalProfile = {
        allergies: listNames(row.allergies),
        medications: listNames(row.medications),
        conditions: listNames(row.conditions),
        bloodType: row.blood_type,
        iceName: row.ice_name,
        icePhone: row.ice_phone,
        visibility: row.visibility as ProfileVisibility,
        updatedAt: row.updated_at,
      };
    }
  } catch {
    // degrade
  }

  try {
    const { data: notices, error } = await supabase
      .from("safety_notices")
      .select("id, member_id, destination, expected_return, created_at")
      .eq("trip_id", TRIP_ID)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const memberIds = [...new Set((notices ?? []).map((n) => n.member_id))];
    const names = new Map<string, string>();
    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", memberIds);
      for (const p of profiles ?? []) names.set(p.id, p.full_name);
    }
    data.soloNotices = (notices ?? []).map((n) => ({
      id: n.id,
      memberId: n.member_id,
      memberName: names.get(n.member_id) ?? "—",
      destination: n.destination,
      expectedReturn: n.expected_return,
      isMine: n.member_id === user.id,
    }));
  } catch {
    // degrade
  }

  // Group member phones (group-visible profile basics) for wa.me deep links.
  try {
    const { data: members, error: mErr } = await supabase
      .from("trip_members")
      .select("user_id")
      .eq("trip_id", TRIP_ID)
      .eq("status", "active");
    if (mErr) throw mErr;
    const ids = (members ?? []).map((m) => m.user_id);
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, phone")
        .in("id", ids);
      data.memberPhones = (profiles ?? []).map((p) => ({ id: p.id, phone: p.phone }));
    }
  } catch {
    // degrade
  }

  // Who viewed MY profile (app_events). RLS lets me read events I acted on and,
  // for the trip owner, all trip events — a regular member sees viewers only if
  // policy allows; empty list otherwise (documented limitation).
  try {
    const { data: events, error } = await supabase
      .from("app_events")
      .select("id, actor_id, created_at")
      .eq("action", "view.emergency_profile")
      .eq("entity", "emergency_profiles")
      .eq("entity_id", user.id)
      .neq("actor_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    const actorIds = [...new Set((events ?? []).map((e) => e.actor_id))];
    const names = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      for (const p of profiles ?? []) names.set(p.id, p.full_name);
    }
    data.accessLog = (events ?? []).map((e) => ({
      id: e.id,
      actorName: names.get(e.actor_id) ?? "—",
      createdAt: e.created_at,
    }));
  } catch {
    // degrade
  }

  return data;
}

/** emergency_profiles jsonb columns are arrays of {name, ...} entries. */
function listNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      typeof entry === "string" ? entry : typeof (entry as { name?: unknown })?.name === "string" ? ((entry as { name: string }).name) : null,
    )
    .filter((v): v is string => typeof v === "string" && v.trim() !== "");
}
