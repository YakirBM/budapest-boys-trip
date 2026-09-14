/**
 * lib/utils/scrape.ts — server-side link-scrape helpers (docs/14 §3.5).
 * Lives in lib (not in app/api/*) because Next 15 route files may only
 * export HTTP handlers + static config; helpers here stay unit-testable.
 */

export interface ScrapeResult {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  openingHours: string | null;
  phone: string | null;
  priceHint: string | null;
  placeType: ScrapedPlaceType | null;
  source: string;
  fetchedAt: string;
}

export type ScrapedPlaceType =
  | "restaurant"
  | "bar"
  | "cafe"
  | "attraction"
  | "shopping"
  | "airport"
  | "transit_hub"
  | "other";

/** SSRF guard: http(s) only, no private/localhost/metadata targets. */
export function isBlockedScrapeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return true;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost")
  ) {
    return true;
  }
  // IPv4 literals: block loopback / private / link-local / reserved.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a >= 224) return true;
  }
  if (host === "::1" || host === "[::1]" || host.startsWith("fc") || host.startsWith("fd")) return true;
  if (url.username || url.password) return true;
  return false;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (whole: string, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : whole;
    })
    .trim();
}

function metaContent(html: string, attr: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${attr}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${attr}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return null;
}

function jsonLdObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdObjects);
  if (value === null || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const nested = "@graph" in record ? jsonLdObjects(record["@graph"]) : [];
  return [record, ...nested];
}

function jsonLdTypes(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function isPlaceJsonLd(candidate: Record<string, unknown>): boolean {
  const supported = [
    "Place", "LocalBusiness", "FoodEstablishment", "Restaurant", "CafeOrCoffeeShop",
    "BarOrPub", "NightClub", "TouristAttraction", "Museum", "ShoppingCenter", "Store",
    "Airport", "BusStation", "TrainStation", "SubwayStation", "LodgingBusiness",
  ];
  return jsonLdTypes(candidate["@type"]).some((type) => supported.includes(type));
}

function firstJsonLd(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const candidates = jsonLdObjects(parsed);
      const place = candidates.find(isPlaceJsonLd);
      if (place) return place;
      // Fall back to the first object block when no typed block matches.
      if (candidates[0]) return candidates[0];
    } catch {
      continue;
    }
  }
  return null;
}

function inferPlaceType(value: unknown): ScrapedPlaceType | null {
  const types = new Set(jsonLdTypes(value));
  if (types.has("Restaurant") || types.has("FoodEstablishment")) return "restaurant";
  if (types.has("CafeOrCoffeeShop")) return "cafe";
  if (types.has("BarOrPub") || types.has("NightClub")) return "bar";
  if (types.has("TouristAttraction") || types.has("Museum")) return "attraction";
  if (types.has("ShoppingCenter") || types.has("Store")) return "shopping";
  if (types.has("Airport")) return "airport";
  if (types.has("BusStation") || types.has("TrainStation") || types.has("SubwayStation")) return "transit_hub";
  if (types.has("Place") || types.has("LocalBusiness") || types.has("LodgingBusiness")) return "other";
  return null;
}

function jsonLdString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

/** Pure HTML → fields parser (no fetching; unit-testable via fixtures). */
export function parseScrapeHtml(
  html: string,
  pageUrl: string,
): Omit<ScrapeResult, "source" | "fetchedAt"> {
  const ogTitle = metaContent(html, "og:title", "title");
  const ogDescription = metaContent(html, "og:description", "description");
  const ogImage = metaContent(html, "og:image", "image");
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = ogTitle ?? (titleMatch?.[1] ? decodeEntities(titleMatch[1]) : null);
  const description = ogDescription;

  const jsonLd = firstJsonLd(html);
  let address: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  let openingHours: string | null = null;
  let phone: string | null = null;
  let priceHint: string | null = null;
  let placeType: ScrapedPlaceType | null = null;

  if (jsonLd) {
    title ??= jsonLdString(jsonLd["name"]);
    placeType = inferPlaceType(jsonLd["@type"]);
    const addr = jsonLd["address"] as unknown;
    if (typeof addr === "string") address = addr.trim() || null;
    else if (addr !== null && typeof addr === "object" && !Array.isArray(addr)) {
      const parts = ["streetAddress", "addressLocality", "postalCode", "addressCountry"]
        .map((key) => jsonLdString((addr as Record<string, unknown>)[key]))
        .filter((part): part is string => part !== null);
      if (parts.length > 0) address = parts.join(", ");
    }
    const geo = jsonLd["geo"] as unknown;
    if (geo !== null && typeof geo === "object" && !Array.isArray(geo)) {
      const geoRecord = geo as Record<string, unknown>;
      const rawLat = geoRecord["latitude"];
      const rawLng = geoRecord["longitude"];
      const parsedLat = typeof rawLat === "string" ? Number(rawLat) : (rawLat as number | null);
      const parsedLng = typeof rawLng === "string" ? Number(rawLng) : (rawLng as number | null);
      if (typeof parsedLat === "number" && Number.isFinite(parsedLat)) lat = parsedLat;
      if (typeof parsedLng === "number" && Number.isFinite(parsedLng)) lng = parsedLng;
    }
    const hours = jsonLd["openingHours"];
    if (typeof hours === "string") openingHours = hours;
    else if (Array.isArray(hours)) openingHours = hours.filter((h) => typeof h === "string").join("; ") || null;
    phone = jsonLdString(jsonLd["telephone"]);
    priceHint = jsonLdString(jsonLd["priceRange"]);
    if (!address) address = jsonLdString(jsonLd["address"]);
  }

  if (!address) {
    const addrMatch = html.match(/<address[^>]*>([\s\S]*?)<\/address>/i);
    if (addrMatch?.[1]) {
      const text = decodeEntities(addrMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
      if (text) address = text.slice(0, 200);
    }
  }

  // Google Maps URL ?q=/place/ extraction (same semantics as parseMapsLink).
  if (lat === null || lng === null) {
    try {
      const page = new URL(pageUrl);
      const q = page.searchParams.get("q") ?? page.searchParams.get("query");
      if (q) {
        const coord = q.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
        if (coord?.[1] && coord[2]) {
          lat = Number(coord[1]);
          lng = Number(coord[2]);
        }
      }
      if (lat === null) {
        const at = page.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (at?.[1] && at[2]) {
          lat = Number(at[1]);
          lng = Number(at[2]);
        }
      }
    } catch {
      // Keep nulls; the caller still returns title/image.
    }
  }

  let imageUrl: string | null = null;
  if (ogImage) {
    try {
      imageUrl = new URL(ogImage, pageUrl).toString();
    } catch {
      imageUrl = null;
    }
  }

  return { title, description, imageUrl, address, lat, lng, openingHours, phone, priceHint, placeType };
}
