/**
 * Client-safe flight time/ICS helpers (docs/06-features/02-flights.md).
 * Type-only import from the data layer — no server code reaches the bundle.
 */
import { buildIcs, type IcsEvent } from "@/lib/utils/ics";
import { TZ_BUDAPEST, TZ_JERUSALEM, zonedWallTimeToUtc } from "@/lib/utils/time";
import { t } from "@/lib/i18n";
import type { Flight, FlightDirection } from "@/lib/data/flights";

export function flightZones(direction: FlightDirection): { dep: string; arr: string } {
  return direction === "outbound"
    ? { dep: TZ_JERUSALEM, arr: TZ_BUDAPEST }
    : { dep: TZ_BUDAPEST, arr: TZ_JERUSALEM };
}

/** Wall-clock date (YYYY-MM-DD) of an instant in a zone. */
export function wallDateInTz(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Estimated arrival instant from the doc-02 verified-facts wall time (~19:50 HU /
 * ~15:05 IL). Used ONLY while arr_time is NULL — always rendered as an estimate.
 */
export function estimatedArrivalInstant(flight: Flight): Date | null {
  if (!flight.estArrivalWall) return null;
  const zones = flightZones(flight.direction);
  const depDate = wallDateInTz(new Date(flight.depTime), zones.dep);
  return zonedWallTimeToUtc(depDate, flight.estArrivalWall, zones.arr);
}

/** Per-flight calendar event — DTSTART/DTEND use the real zone TZIDs (docs/08 §5). */
export function buildFlightIcs(flight: Flight): string {
  const zones = flightZones(flight.direction);
  const arrival = flight.arrTime
    ? new Date(flight.arrTime)
    : (estimatedArrivalInstant(flight) ?? new Date(new Date(flight.depTime).getTime() + 3.5 * 3600 * 1000));
  const route = `${flight.depAirport}→${flight.arrAirport}`;
  const event: IcsEvent = {
    uid: `${flight.id}@budapest-boys-trip`,
    start: { at: new Date(flight.depTime), tzid: zones.dep },
    end: { at: arrival, tzid: zones.arr },
    summary: `${flight.airline} ${flight.flightNo} ${route}`,
    description: flight.bookingRefMasked
      ? `${t("flights.reservation")}: ${flight.bookingRefMasked} · ${t("flights.icsEstimateNote")}`
      : t("flights.icsEstimateNote"),
  };
  return buildIcs([event]);
}

/** Trigger a client-side .ics download. */
export function downloadFlightIcs(flight: Flight): void {
  const blob = new Blob([buildFlightIcs(flight)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${flight.flightNo}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
