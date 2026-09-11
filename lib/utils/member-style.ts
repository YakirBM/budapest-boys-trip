/**
 * Deterministic member identity colours (docs/05 §7, docs/13 Phase 6).
 *
 * One shared mapping used by MemberAvatar and every screen that renders a
 * member: a stable FNV-1a hash of the member's display name picks one of four
 * colour slots. The actual colours are CSS variables (`--c-member-N` bg +
 * `--c-member-N-ink` text) defined per theme in app/globals.css, so the same
 * member keeps the same hue everywhere while contrast stays AA in both themes.
 *
 * Seed with the display name (trimmed): it is unique within the trip and is
 * the only member field available at every call site (some screens receive
 * names without user ids).
 */

const MEMBER_COLOR_SLOTS = 4;

/** Stable 32-bit FNV-1a hash — no randomness, identical across renders/devices. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Colour slot for a member: 1..4. */
export function memberColorSlot(seed: string): number {
  return (fnv1a(seed.trim()) % MEMBER_COLOR_SLOTS) + 1;
}

export interface MemberColor {
  /** CSS var for the avatar/chip background. */
  bg: string;
  /** CSS var for text/initials drawn on that background (AA pair). */
  ink: string;
}

/** Resolved CSS variables for a member's deterministic colour pair. */
export function memberColor(seed: string): MemberColor {
  const slot = memberColorSlot(seed);
  return {
    bg: `var(--c-member-${slot})`,
    ink: `var(--c-member-${slot}-ink)`,
  };
}

/** Neutral colour pair for pending (read-only) members. */
export const PENDING_MEMBER_COLOR: MemberColor = {
  bg: "var(--c-member-pending)",
  ink: "var(--c-member-pending-ink)",
};

/** First letters of first + last word; callers isolate LTR runs when Latin. */
export function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
