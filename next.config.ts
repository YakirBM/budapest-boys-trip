import type { NextConfig } from "next";

/**
 * Security headers per docs/04-security-and-privacy.md §8.
 * CSP note: Next.js App Router requires inline bootstrap scripts; a fully
 * 'self'-only script-src breaks hydration. We ship the documented policy plus
 * 'unsafe-inline' for script-src (documented deviation — nonce-based CSP is a
 * hardening follow-up; styles keep 'unsafe-inline' per the doc itself).
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' blob: data: https://zgvpchdqudheiohlrrvm.supabase.co https://tile.openstreetmap.org",
      "connect-src 'self' https://zgvpchdqudheiohlrrvm.supabase.co wss://zgvpchdqudheiohlrrvm.supabase.co",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const dev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          ...securityHeaders.filter((h) => h.key !== "Content-Security-Policy"),
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "img-src 'self' blob: data: https://zgvpchdqudheiohlrrvm.supabase.co https://tile.openstreetmap.org",
              "connect-src 'self' https://zgvpchdqudheiohlrrvm.supabase.co wss://zgvpchdqudheiohlrrvm.supabase.co",
              "style-src 'self' 'unsafe-inline'",
              // Dev-only: React Fast Refresh and the dev overlay require eval.
              `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
