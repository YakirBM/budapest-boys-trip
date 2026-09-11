/* Visual audit (docs/05 §12 RTL pass): unauthenticated screenshots at phone/tablet/desktop. */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const browser = await chromium.launch();

const targets = [
  { name: "login-360", url: "/login", viewport: { width: 360, height: 740 } },
  { name: "login-390", url: "/login", viewport: { width: 390, height: 844 } },
  { name: "login-tablet", url: "/login", viewport: { width: 768, height: 1024 } },
  { name: "login-desktop", url: "/login", viewport: { width: 1280, height: 800 } },
  { name: "offline-360", url: "/offline", viewport: { width: 360, height: 740 } },
  { name: "gate-today-390", url: "/today", viewport: { width: 390, height: 844 } },
];

for (const t of targets) {
  const ctx = await browser.newContext({ viewport: t.viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3000${t.url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `shots/${t.name}.png` });
  console.log(t.name, "→", page.url());
  await ctx.close();
}

await browser.close();
console.log("done");
