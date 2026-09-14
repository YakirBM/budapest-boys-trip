import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// API handlers perform their own authentication and must be allowed to return
// JSON 401/4xx responses. Redirecting a POST to /login preserves the method and
// turns a useful auth error into a misleading 405 from the page route.
const PUBLIC_PATHS = ["/login", "/auth/callback", "/offline", "/icons", "/manifest.webmanifest", "/sw.js", "/sw-manifest.js", "/theme-init.js", "/api/cron", "/api/scrape", "/api/geocode", "/api/trip-search"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Session refresh + /(app) gate (docs/02 §Auth flow).
 * Expects an updated session cookie on the response.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getSession —
  // the session refresh must complete first.
  // getClaims verifies the JWT locally when the project uses asymmetric keys
  // (the hosted default), avoiding a cross-region Auth request on every route.
  // It still refreshes through @supabase/ssr when the access token has expired.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const isAuthenticated = !claimsError && Boolean(claimsData?.claims?.sub);

  const { pathname } = request.nextUrl;
  const isAppRoute = !isPublic(pathname) && pathname !== "/";

  if (!isAuthenticated && isAppRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // NOTE: no redirect for authenticated users on /login — the login page's
  // client effect handles that. Redirecting here creates a redirect loop
  // whenever a transient getUser() failure alternates the two branches.

  return supabaseResponse;
}
