/**
 * URL builders for external apps (docs/08 §3–§6).
 * Pure functions, no fetching, no side effects, no identifying query params stored.
 */

export type TravelMode = "transit" | "walking" | "driving";

/** https://www.google.com/maps/dir/?api=1&… — destination accepts address or "lat,lng". */
export function googleMapsDir(
  destination: string,
  mode: TravelMode = "transit",
  origin?: string,
): string {
  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode: mode,
  });
  if (origin) params.set("origin", origin);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function googleMapsSearch(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function appleMapsDir(destination: string): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`;
}

export function wazeNav(lat: number, lon: number): string {
  return `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+*#]/g, "")}`;
}

/** WhatsApp share — text only, URL-encoded (docs/08 §6). */
export function whatsappShare(text: string, phone?: string): string {
  const base = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(to: string, subject: string, body?: string): string {
  const params = new URLSearchParams({ subject });
  if (body) params.set("body", body);
  return `mailto:${to}?${params.toString()}`;
}

/** Google Calendar template link (docs/08 §5). Dates = UTC ms → "YYYYMMDDTHHmmssZ". */
export function googleCalendarTemplate(opts: {
  title: string;
  startUtc: Date;
  endUtc: Date;
  details?: string;
  location?: string;
}): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${fmt(opts.startUtc)}/${fmt(opts.endUtc)}`,
  });
  if (opts.details) params.set("details", opts.details);
  if (opts.location) params.set("location", opts.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Parse a pasted Google Maps link / coordinate pair (docs/06-features/01 rule 2).
 * Returns name (when present), lat/lng, and the canonical clean URL with ALL
 * query/tracking parameters stripped. Never persists the original URL.
 */
export function parseMapsLink(
  input: string,
): { name?: string; lat?: number; lng?: number; cleanUrl: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare coordinates: "47.4979, 19.0402"
  const coordMatch = trimmed.match(/^(-?\d{1,2}\.\d{3,})[,\s]+(-?\d{1,3}\.\d{3,})$/);
  if (coordMatch?.[1] && coordMatch[2]) {
    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[2]);
    return { lat, lng, cleanUrl: googleMapsSearch(`${lat},${lng}`) };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const isGoogleMaps =
    /(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.pathname.startsWith("/maps");
  const isShortLink = url.hostname === "maps.app.goo.gl" || url.hostname === "g.co";
  if (!isGoogleMaps && !isShortLink) return null;

  // Name from /maps/place/Name/@lat,lng,… or search queries
  let name: string | undefined;
  let lat: number | undefined;
  let lng: number | undefined;

  const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/);
  if (placeMatch?.[1]) {
    name = decodeURIComponent(placeMatch[1]).replace(/\+/g, " ");
  }

  const atMatch = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch?.[1] && atMatch[2]) {
    lat = Number(atMatch[1]);
    lng = Number(atMatch[2]);
  }

  if (lat === undefined) {
    const q = url.searchParams.get("query") ?? url.searchParams.get("q");
    if (q) {
      const qCoord = q.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
      if (qCoord?.[1] && qCoord[2]) {
        lat = Number(qCoord[1]);
        lng = Number(qCoord[2]);
      } else {
        name ??= decodeURIComponent(q).replace(/\+/g, " ");
      }
    }
  }

  // Canonical clean URL: strip every query param + tracking (privacy rule, docs/04 §5.4)
  const cleanUrl = lat !== undefined && lng !== undefined
    ? googleMapsSearch(`${lat},${lng}`)
    : googleMapsSearch(name ?? trimmed);

  return { name, lat, lng, cleanUrl };
}
