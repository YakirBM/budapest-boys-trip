"use server";

import { z } from "zod";
import { getActiveMembers, requireUser } from "@/lib/data/trip";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface MyProfile {
  userId: string;
  fullName: string;
  role: "owner" | "member";
  status: "active" | "pending" | "declined";
}

/**
 * Current member's own profile row for the More screen identity card
 * (docs/13 Phase 6). Reuses the cached, RLS-scoped trip/member lookups.
 * Returns only self-owned, non-sensitive fields — never the email address
 * (docs/04: emails are not rendered in shared views).
 */
export async function getMyProfileAction(): Promise<MyProfile | null> {
  const user = await requireUser();
  const members = await getActiveMembers();
  const me = members.find((m) => m.user_id === user.id);
  if (!me) return null;
  return {
    userId: me.user_id,
    fullName: me.full_name,
    role: me.role,
    status: me.status,
  };
}

const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  addressLine: z.string().trim().max(160).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  iceName: z.string().trim().max(120).optional(),
  icePhone: z.string().trim().max(32).optional(),
  avatarPath: z.string().trim().max(256).optional(),
});

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

/**
 * updateMyProfileAction — self-only full profile edit for the header menu
 * (docs/14 §1.4). Sensitive columns (address/ICE) are written to the caller's
 * own row only and are never returned to other members (docs/04).
 */
export async function updateMyProfileAction(
  input: z.infer<typeof UpdateProfileSchema>,
): Promise<UpdateProfileResult> {
  const parsed = UpdateProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.saveFailed" };
  const user = await requireUser();
  const supabase = await getSupabaseServerClient();
  const row: Record<string, string | null> = {};
  if (parsed.data.fullName !== undefined) row["full_name"] = parsed.data.fullName;
  if (parsed.data.phone !== undefined) row["phone"] = parsed.data.phone || null;
  if (parsed.data.addressLine !== undefined) row["address_line"] = parsed.data.addressLine || null;
  if (parsed.data.city !== undefined) row["city"] = parsed.data.city || null;
  if (parsed.data.country !== undefined) row["country"] = parsed.data.country || null;
  if (parsed.data.iceName !== undefined) row["ice_name"] = parsed.data.iceName || null;
  if (parsed.data.icePhone !== undefined) row["ice_phone"] = parsed.data.icePhone || null;
  if (parsed.data.avatarPath !== undefined) row["avatar_path"] = parsed.data.avatarPath || null;
  if (Object.keys(row).length === 0) return { ok: true };
  row["updated_at"] = new Date().toISOString();
  const { error } = await supabase.from("profiles").update(row).eq("id", user.id);
  if (error) {
    console.error("updateMyProfile failed", error.message);
    return { ok: false, error: "errors.saveFailed" };
  }
  return { ok: true };
}
