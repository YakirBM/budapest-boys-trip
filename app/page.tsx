import { redirect } from "next/navigation";

/**
 * Entry point — the app's home is the Today dashboard.
 * Resilience: Supabase email-confirmation links that fall back to the Site URL
 * arrive here as /?code=<pkce-code> — forward them to the exchange route so the
 * user still lands signed-in (redirect-allowlist fallback path).
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  redirect(code ? `/auth/callback?code=${encodeURIComponent(code)}` : "/today");
}
