import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { GET } from "@/app/(auth)/auth/callback/route";

describe("auth callback", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    createServerClient.mockReset();
  });

  it("returns PKCE session cookies on the redirect response", async () => {
    createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        exchangeCodeForSession: async () => {
          options.cookies.setAll([
            {
              name: "sb-test-auth-token",
              value: "session-value",
              options: { httpOnly: true, sameSite: "lax", path: "/" },
            },
          ]);
          return { error: null };
        },
      },
    }));

    const response = await GET(
      new NextRequest("https://medbadboys.vercel.app/auth/callback?code=pkce-code"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://medbadboys.vercel.app/today");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("session-value");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rejects a protocol-relative next destination", async () => {
    createServerClient.mockImplementation(() => ({
      auth: { exchangeCodeForSession: async () => ({ error: null }) },
    }));

    const response = await GET(
      new NextRequest(
        "https://medbadboys.vercel.app/auth/callback?code=pkce-code&next=//evil.example",
      ),
    );

    expect(response.headers.get("location")).toBe("https://medbadboys.vercel.app/today");
  });
});
