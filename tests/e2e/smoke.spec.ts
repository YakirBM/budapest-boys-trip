import { expect, test } from "@playwright/test";

/**
 * Unauthenticated smoke: the (app) shell redirects to /login and the offline
 * fallback is registered. Complements the authenticated UAT script (doc 11).
 */
test.describe("auth gate", () => {
  test("unauthenticated visitor is redirected to login", async ({ page }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("login form requires an email and shows the send action", async ({ page }) => {
    await page.goto("/login");
    const email = page.locator("#email");
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute("type", "email");
  });
});

test.describe("PWA artifacts", () => {
  test("manifest is served and Hebrew-right-to-left", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.dir).toBe("rtl");
    expect(manifest.lang).toBe("he");
    expect(manifest.display).toBe("standalone");
  });

  test("service worker script is served with a fetch handler", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain("addEventListener(\"fetch\"");
    expect(body).toContain("outbox-flush");
  });

  test("service worker does not break protected-route redirects", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();

    await page.goto("/today");
    await expect(page).toHaveURL(/\/login/);

    const cachedToday = await page.evaluate(async () => {
      for (const cacheName of await caches.keys()) {
        const cache = await caches.open(cacheName);
        if (await cache.match("/today")) return true;
      }
      return false;
    });
    expect(cachedToday).toBe(false);
  });

  test("offline fallback page renders", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.locator("main")).toBeVisible();
  });
});
