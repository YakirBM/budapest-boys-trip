/**
 * Masking utilities (docs/04 §5.1, docs/06-features/02-flights.md §Masking).
 * The ONLY sanctioned way to render sensitive identifiers — never ad-hoc slicing.
 * The database stores masked values only (docs/03 §1).
 */

const BULLET = "•";

/**
 * "42103929206" → "4210•••••06" (e-ticket serials; length-preserving, first 4 + last 2).
 */
export function maskIdentifier(value: string): string {
  const v = value.trim();
  if (v.length <= 6) return BULLET.repeat(v.length);
  return `${v.slice(0, 4)}${BULLET.repeat(v.length - 6)}${v.slice(-2)}`;
}

/**
 * Booking refs render in the doc-mandated format "1385•••93" (docs/04 §5.1)
 * — first 4 + three bullets + last 2, regardless of source length.
 */
export function maskReservation(value: string): string {
  const v = value.trim();
  if (v.length <= 6) return BULLET.repeat(v.length);
  return `${v.slice(0, 4)}${BULLET.repeat(3)}${v.slice(-2)}`;
}

/** Policy number: last 4 visible — "•••• 4821" (docs/06-features/08 Card 2). */
export function maskPolicyNumber(value: string): string {
  const v = value.trim().replace(/\s/g, "");
  if (v.length <= 4) return BULLET.repeat(v.length);
  return `${BULLET.repeat(4)} ${v.slice(-4)}`;
}

/** True when the value contains no full-length leak (test helper). */
export function isMasked(masked: string, original: string): boolean {
  return !masked.includes(original) && masked.includes(BULLET);
}
