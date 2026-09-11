/**
 * Hand-built ICS generator (docs/08 §5) — library-free by documented decision.
 * Always emits DTSTAMP/DTSTART/DTEND/UID/SUMMARY; TZID=IANA names, never floating times.
 */

export interface IcsEvent {
  uid: string;
  /** TZ-aware instants (Date) + the IANA zone to declare via TZID. */
  start: { at: Date; tzid: string };
  end: { at: Date; tzid: string };
  summary: string;
  description?: string;
  location?: string;
  stamp?: Date;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function fmtUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/** Wall-clock time of an instant in a zone, as ICS local format (YYYYMMDDTHHMMSS). */
function fmtWall(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => (parts.find((p) => p.type === type)?.value ?? "00").padStart(2, "0");
  return `${get("year")}${get("month")}${get("day")}T${get("hour") === "24" ? "00" : get("hour")}${get("minute")}${get("second")}`;
}

/** RFC 5545 §3.1: fold lines at 75 octets (safe at 75 chars for our ASCII+CJK-free content; Hebrew in DESCRIPTION is UTF-8 — we fold conservatively at 74). */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 0) {
    chunks.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return chunks.join("\r\n");
}

export function buildIcs(events: readonly IcsEvent[], prodId = "-//budapest-boys-trip//EN"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeText(event.uid)}`);
    lines.push(`DTSTAMP:${fmtUtc(event.stamp ?? new Date())}Z`);
    lines.push(`DTSTART;TZID=${event.start.tzid}:${fmtWall(event.start.at, event.start.tzid)}`);
    lines.push(`DTEND;TZID=${event.end.tzid}:${fmtWall(event.end.at, event.end.tzid)}`);
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
