import { NextResponse } from "next/server";
import { assertCronSecret, getSupabaseServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TRIP_START = "2026-10-04";
const TRIP_END = "2026-10-08";

/**
 * Open-Meteo's forecast horizon is ~16 days (source: open-meteo.com docs,
 * verified 2026-09-11 — request with later start_date returns 400 out-of-range).
 * Clamp the window to what the API can serve; once the trip enters the horizon
 * the daily cron naturally fills the real trip days.
 */
function tripWindowWithinHorizon(): { startDate: string; endDate: string } | null {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const horizonIso = new Date(now.getTime() + 15 * 86_400_000).toISOString().slice(0, 10);
  const start = TRIP_START > todayIso ? TRIP_START : todayIso;
  const end = TRIP_END < horizonIso ? TRIP_END : horizonIso;
  if (start > end) return null; // trip entirely beyond the forecast horizon
  return { startDate: start, endDate: end };
}

interface OpenMeteoResponse {
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
    sunset?: string[];
  };
}

/**
 * Daily weather cache refresh (docs/08 §1). Open-Meteo → weather_cache.
 * Values carry source; stale rendering is the client's concern.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!assertCronSecret(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const window = tripWindowWithinHorizon();
  if (!window) {
    // Trip beyond the forecast horizon — nothing to cache yet (UI hides the widget).
    return NextResponse.json({ ok: true, count: 0, reason: "trip_outside_forecast_horizon" });
  }
  const { startDate, endDate } = window;

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    "?latitude=47.4979&longitude=19.0402" +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunset" +
    "&timezone=Europe%2FBudapest" +
    `&start_date=${startDate}&end_date=${endDate}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`open-meteo responded ${res.status}`);
    const data = (await res.json()) as OpenMeteoResponse;
    const daily = data.daily;
    if (!daily?.time?.length) throw new Error("empty daily payload");

    const rows = daily.time.map((day, i) => ({
      day,
      temp_min: daily.temperature_2m_min?.[i] ?? null,
      temp_max: daily.temperature_2m_max?.[i] ?? null,
      precip_prob: daily.precipitation_probability_max?.[i] ?? null,
      wind: daily.wind_speed_10m_max?.[i] ?? null,
      // Sunset arrives as Europe/Budapest local wall time — store the instant.
      sunset_time: daily.sunset?.[i]
        ? new Date(`${daily.sunset[i]}:00`).toISOString()
        : null,
      source: "open-meteo.com",
      fetched_at: new Date().toISOString(),
    }));

    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("weather_cache")
      .upsert(rows, { onConflict: "day,source" });
    if (error) throw error;

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    console.error("cron/weather failed", { error: err instanceof Error ? err.message : err });
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 502 });
  }
}
