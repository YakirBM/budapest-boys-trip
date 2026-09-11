import { type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (build assets)
     * - favicon / icons / sw files (static PWA assets)
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|sw-manifest.js|manifest.webmanifest).*)",
  ],
};
