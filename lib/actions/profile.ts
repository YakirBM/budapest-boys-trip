"use server";

import { getActiveMembers, requireUser } from "@/lib/data/trip";

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
