"use server";

/**
 * Safety & medical server actions — zod-validated (docs/06-features/08).
 * Hard rules encoded here:
 * - Full policy numbers are NEVER stored (schema carries masked values only).
 * - Every reveal/open of the policy PDF logs a `policy_revealed` app_event.
 * - Every read of another member's medical profile logs `view.emergency_profile`.
 * - Emergency alerts store TEXT only — no location values ever reach the DB.
 */
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, TRIP_ID } from "@/lib/data/trip";
import { maskPolicyNumber } from "@/lib/utils/masking";
import { zonedWallTimeToUtc, TZ_BUDAPEST } from "@/lib/utils/time";

export type ActionError = "auth" | "network" | "forbidden" | "validation" | "generic";
export type ActionResult = { ok: true } | { ok: false; error: ActionError };
export type UrlResult = { ok: true; url: string } | { ok: false; error: ActionError };

export interface RevealedProfile {
  userId: string;
  fullName: string;
  allergies: string[];
  medications: string[];
  conditions: string[];
  bloodType: string | null;
  iceName: string;
  icePhone: string;
  visibility: string;
}

export type RevealProfilesResult =
  | { ok: true; profiles: RevealedProfile[] }
  | { ok: false; error: ActionError };

function toError(err: unknown): ActionError {
  const message = String((err as { message?: string })?.message ?? err ?? "");
  if (/auth/i.test(message)) return "auth";
  if (/row-level security|permission|forbidden/i.test(message)) return "forbidden";
  if (/fetch|network|timeout/i.test(message)) return "network";
  return "generic";
}

function linesToJsonb(lines: string[]): { name: string }[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((name) => ({ name }));
}

const medicalSchema = z.object({
  allergies: z.array(z.string().max(200)).max(30),
  medications: z.array(z.string().max(200)).max(30),
  conditions: z.array(z.string().max(200)).max(30),
  bloodType: z.string().trim().max(10).optional(),
  iceName: z.string().trim().min(2).max(120),
  icePhone: z.string().trim().min(5).max(30),
  visibility: z.enum(["private", "members", "emergency_only"]),
});

export type MedicalProfileInput = z.infer<typeof medicalSchema>;

/** Upsert MY opt-in medical profile (RLS: owner-only writes). */
export async function saveMyMedicalProfile(input: MedicalProfileInput): Promise<ActionResult> {
  const parsed = medicalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation" };
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const { error } = await supabase.from("emergency_profiles").upsert(
      {
        user_id: user.id,
        allergies: linesToJsonb(parsed.data.allergies),
        medications: linesToJsonb(parsed.data.medications),
        conditions: linesToJsonb(parsed.data.conditions),
        blood_type: parsed.data.bloodType ? parsed.data.bloodType : null,
        ice_name: parsed.data.iceName,
        ice_phone: parsed.data.icePhone,
        visibility: parsed.data.visibility,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error("saveMyMedicalProfile failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

/**
 * Emergency reveal of group medical profiles (Card 1 path). Reads co-members'
 * non-private profiles THROUGH RLS and logs one app_events row per profile
 * BEFORE returning data — the read is audited even if the client drops it.
 */
export async function revealGroupMedicalProfiles(): Promise<RevealProfilesResult> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const { data, error } = await supabase
      .from("emergency_profiles")
      .select(
        "user_id, allergies, medications, conditions, blood_type, ice_name, ice_phone, visibility",
      )
      .neq("user_id", user.id);
    if (error) throw error;
    const rows = data ?? [];

    // Only 'members' profiles may surface here; 'emergency_only' surfaces via
    // the Card-1 reveal — which THIS action is. Both are logged.
    if (rows.length > 0) {
      const { error: logErr } = await supabase.from("app_events").insert(
        rows.map((row) => ({
          trip_id: TRIP_ID,
          actor_id: user.id,
          action: "view.emergency_profile",
          entity: "emergency_profiles",
          entity_id: row.user_id,
          meta: { entry: "safety_page_reveal" },
        })),
      );
      if (logErr) throw logErr;
    }

    const userIds = rows.map((row) => row.user_id);
    const names = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profiles ?? []) names.set(p.id, p.full_name);
    }

    return {
      ok: true,
      profiles: rows.map((row) => ({
        userId: row.user_id,
        fullName: names.get(row.user_id) ?? "—",
        allergies: ((row.allergies ?? []) as { name?: string }[]).map((a) => a.name ?? "").filter(Boolean),
        medications: ((row.medications ?? []) as { name?: string }[]).map((m) => m.name ?? "").filter(Boolean),
        conditions: ((row.conditions ?? []) as { name?: string }[]).map((c) => c.name ?? "").filter(Boolean),
        bloodType: row.blood_type,
        iceName: row.ice_name,
        icePhone: row.ice_phone,
        visibility: row.visibility,
      })),
    };
  } catch (err) {
    console.error("revealGroupMedicalProfiles failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

const insuranceSchema = z.object({
  insurer: z.string().trim().min(2).max(120),
  policyNumber: z.string().trim().max(60).optional().or(z.literal("")),
  emergencyPhone: z.string().trim().max(30).optional().or(z.literal("")),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});

export type InsuranceInput = z.infer<typeof insuranceSchema>;

/**
 * Save MY insurance card. The full policy number is masked SERVER-SIDE before
 * storage — the schema has no full-number column (docs/03 §4.7, docs/04 §5).
 */
export async function saveMyInsurance(input: InsuranceInput): Promise<ActionResult> {
  const parsed = insuranceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation" };
  const { insurer, policyNumber, emergencyPhone, validUntil } = parsed.data;
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const payload = {
      insurer,
      policy_no_masked: policyNumber ? maskPolicyNumber(policyNumber) : null,
      emergency_phone: emergencyPhone ? emergencyPhone : null,
      valid_until: validUntil ? validUntil : null,
      updated_at: new Date().toISOString(),
    };
    const { data: existing } = await supabase
      .from("insurance_policies")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    const id = existing?.[0]?.id;
    const { error } = id
      ? await supabase.from("insurance_policies").update(payload).eq("id", id)
      : await supabase.from("insurance_policies").insert({ ...payload, user_id: user.id });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error("saveMyInsurance failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

/** "בדקתי שהפוליסה תקפה לחו״ל" checkbox. */
export async function markInsuranceVerified(verified: boolean): Promise<ActionResult> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const { error } = await supabase
      .from("insurance_policies")
      .update({ user_verified_at: verified ? new Date().toISOString() : null })
      .eq("user_id", user.id);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error("markInsuranceVerified failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

const POLICY_MAX_BYTES = 10 * 1024 * 1024;
const POLICY_MIMES = new Set(["application/pdf", "image/jpeg", "image/png"]);

/** Upload MY policy PDF (private) + link it to my insurance row. */
export async function uploadInsurancePdf(formData: FormData): Promise<ActionResult> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "validation" };
    if (file.size <= 0 || file.size > POLICY_MAX_BYTES) return { ok: false, error: "validation" };
    if (!POLICY_MIMES.has(file.type)) return { ok: false, error: "validation" };

    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const path = `trips/${TRIP_ID}/documents/${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("trip-documents")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        trip_id: TRIP_ID,
        owner_id: user.id,
        document_type: "insurance",
        title: "פוליסת ביטוח",
        storage_path: path,
        mime: file.type,
        bytes: file.size,
        is_private: true,
      })
      .select("id")
      .single();
    if (docErr) throw docErr;

    const { data: existing } = await supabase
      .from("insurance_policies")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    const policyId = existing?.[0]?.id;
    const { error: linkErr } = policyId
      ? await supabase.from("insurance_policies").update({ document_id: doc.id }).eq("id", policyId)
      : await supabase
          .from("insurance_policies")
          .insert({ user_id: user.id, insurer: "—", document_id: doc.id });
    if (linkErr) throw linkErr;
    return { ok: true };
  } catch (err) {
    console.error("uploadInsurancePdf failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

/**
 * Reveal+open the policy document: mints a 1h signed URL and logs
 * `policy_revealed`. The URL is transient — never cached or logged.
 */
export async function openInsurancePolicy(): Promise<UrlResult> {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const { data, error } = await supabase
      .from("insurance_policies")
      .select("id, document_id")
      .eq("user_id", user.id)
      .limit(1);
    if (error) throw error;
    const policy = data?.[0];
    if (!policy?.document_id) return { ok: false, error: "validation" };

    const { data: docs, error: docErr } = await supabase
      .from("documents")
      .select("storage_path")
      .eq("id", policy.document_id)
      .eq("owner_id", user.id)
      .limit(1);
    if (docErr) throw docErr;
    const path = docs?.[0]?.storage_path;
    if (!path) return { ok: false, error: "validation" };

    const { error: logErr } = await supabase.from("app_events").insert({
      trip_id: TRIP_ID,
      actor_id: user.id,
      action: "policy_revealed",
      entity: "insurance_policies",
      entity_id: policy.id,
      meta: { entry: "safety_page" },
    });
    if (logErr) throw logErr;

    const { data: signed, error: signErr } = await supabase.storage
      .from("trip-documents")
      .createSignedUrls([path], 3600);
    if (signErr || !signed?.[0]?.signedUrl) return { ok: false, error: "generic" };
    return { ok: true, url: signed[0].signedUrl };
  } catch (err) {
    console.error("openInsurancePolicy failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

const emergencyAlertSchema = z.object({
  text: z.string().trim().max(500).optional(),
});

/** Broadcast an emergency alert — TEXT ONLY, never coordinates (doc 08 Card 1). */
export async function sendEmergencyAlert(input: z.infer<typeof emergencyAlertSchema>): Promise<ActionResult> {
  const parsed = emergencyAlertSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: "validation" };
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const { error } = await supabase.from("app_events").insert({
      trip_id: TRIP_ID,
      actor_id: user.id,
      action: "emergency_alert",
      entity: "safety",
      entity_id: null,
      meta: { text: parsed.data.text ?? null },
    });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error("sendEmergencyAlert failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

const soloNoticeSchema = z.object({
  destination: z.string().trim().min(2).max(200),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeHHmm: z.string().regex(/^\d{2}:\d{2}$/),
});

/** "יצאתי לבד" — expected return is a Budapest wall time (doc 08 Card 4). */
export async function createSoloNotice(input: z.infer<typeof soloNoticeSchema>): Promise<ActionResult> {
  const parsed = soloNoticeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation" };
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const { data: members, error: mErr } = await supabase
      .from("trip_members")
      .select("user_id")
      .eq("trip_id", TRIP_ID)
      .eq("status", "active");
    if (mErr) throw mErr;
    const { error } = await supabase.from("safety_notices").insert({
      trip_id: TRIP_ID,
      member_id: user.id,
      destination: parsed.data.destination,
      expected_return: zonedWallTimeToUtc(
        parsed.data.dateIso,
        parsed.data.timeHHmm,
        TZ_BUDAPEST,
      ).toISOString(),
      notified_member_ids: (members ?? []).map((m) => m.user_id),
      status: "active",
    });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error("createSoloNotice failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}

const resolveSchema = z.object({ id: z.string().uuid() });

/** "חזרתי" — resolves MY notice only (RLS: own-row updates). */
export async function resolveSoloNotice(input: z.infer<typeof resolveSchema>): Promise<ActionResult> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation" };
  try {
    const supabase = await getSupabaseServerClient();
    const user = await requireUser();
    const { error } = await supabase
      .from("safety_notices")
      .update({ status: "returned", resolved_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .eq("member_id", user.id);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error("resolveSoloNotice failed", err instanceof Error ? err.message : err);
    return { ok: false, error: toError(err) };
  }
}
