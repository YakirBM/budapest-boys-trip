import { describe, expect, it } from "vitest";
import { isBlockedScrapeUrl, parseScrapeHtml } from "@/lib/utils/scrape";

/** Scrape engine gates (docs/14 §3.5): SSRF guard + OG/JSON-LD fixtures. */
describe("scrape helpers", () => {
  it("blocks SSRF targets", () => {
    expect(isBlockedScrapeUrl("http://localhost:3000/x")).toBe(true);
    expect(isBlockedScrapeUrl("http://169.254.169.254/")).toBe(true);
    expect(isBlockedScrapeUrl("http://10.0.0.1/")).toBe(true);
    expect(isBlockedScrapeUrl("file:///etc/passwd")).toBe(true);
    expect(isBlockedScrapeUrl("https://example.com/place")).toBe(false);
  });

  it("parses OG title/image + JSON-LD address/geo/phone", () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Gundel Restaurant" />
      <meta property="og:image" content="/img/gundel.jpg" />
      <script type="application/ld+json">{"@type":"Restaurant","address":{"streetAddress":"Gundel Károly út 4","addressLocality":"Budapest"},"geo":{"latitude":47.5189,"longitude":19.0778},"telephone":"+3614684040","priceRange":"$$$ "}</script>
      </head><body></body></html>`;
    const out = parseScrapeHtml(html, "https://example.com/gundel");
    expect(out.title).toBe("Gundel Restaurant");
    expect(out.imageUrl).toBe("https://example.com/img/gundel.jpg");
    expect(out.address).toContain("Budapest");
    expect(out.lat).toBeCloseTo(47.5189);
    expect(out.phone).toBe("+3614684040");
    expect(out.placeType).toBe("restaurant");
    expect(out.priceHint).toBe("$$$");
  });

  it("finds place data nested in a JSON-LD graph", () => {
    const html = `<script type="application/ld+json">{
      "@context":"https://schema.org",
      "@graph":[
        {"@type":"WebSite","name":"Example"},
        {"@type":["LocalBusiness","CafeOrCoffeeShop"],"name":"Central Café","address":"Károlyi utca 9, Budapest"}
      ]
    }</script>`;
    const out = parseScrapeHtml(html, "https://example.com/cafe");
    expect(out.title).toBe("Central Café");
    expect(out.address).toBe("Károlyi utca 9, Budapest");
    expect(out.placeType).toBe("cafe");
  });

  it("extracts coordinates from a Google Maps URL", () => {
    const out = parseScrapeHtml("<html><head><title>X</title></head></html>", "https://maps.google.com/?q=47.4979,19.0402");
    expect(out.lat).toBeCloseTo(47.4979);
    expect(out.lng).toBeCloseTo(19.0402);
  });

  it("returns nulls (never fabricated) for empty pages", () => {
    const out = parseScrapeHtml("<html><head></head><body>hi</body></html>", "https://example.com/");
    expect(out.lat).toBeNull();
    expect(out.address).toBeNull();
  });
});
