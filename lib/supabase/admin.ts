import { createClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY. Service-role client bypasses RLS — used exclusively by the
 * /api/cron/* handlers to write cache tables (docs/08 §1–2). Never import
 * from client components; never expose the key to the browser bundle.
 */
export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("service client unavailable: missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Bearer-secret gate for cron handlers (docs/02 §Cron jobs). */
export function assertCronSecret(request: Request): boolean {
  const header = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return header === `Bearer ${secret}`;
}
