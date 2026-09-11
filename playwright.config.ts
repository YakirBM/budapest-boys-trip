import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config (docs/07 §Testing plan, docs/11 §Airplane-mode UAT).
 * Production build served via `pnpm start`; PWA checks run against Chromium.
 * Base URL/env: BASE_URL, E2E_EMAIL, E2E_CODE (a received OTP) — magic links
 * can't be auto-read, so auth tests use a storageState prepared manually.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    viewport: { width: 390, height: 844 },
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        port: 3000,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
