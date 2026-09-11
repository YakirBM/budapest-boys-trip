"use client";

import clsx from "clsx";
import { t } from "@/lib/i18n";
import { memberColor, memberInitials, PENDING_MEMBER_COLOR } from "@/lib/utils/member-style";

export interface MemberAvatarProps {
  name: string;
  imageUrl?: string;
  /** 32 or 40 (doc 05 §7). */
  size?: 32 | 40;
  /** Success-colored presence dot. */
  online?: boolean;
  /** Pending members render in the neutral slot colour (docs/13 Phase 6). */
  pending?: boolean;
  className?: string;
}

/** MemberAvatar — photo with Hebrew-initials fallback (doc 05 §7). The
 * fallback circle uses the member's deterministic colour pair so the same
 * person keeps one hue across every screen (lib/utils/member-style.ts). */
export function MemberAvatar({
  name,
  imageUrl,
  size = 32,
  online = false,
  pending = false,
  className,
}: MemberAvatarProps) {
  const initials = memberInitials(name);
  const isLatin = /^[\x20-\x7E]+$/.test(initials);
  const color = pending ? PENDING_MEMBER_COLOR : memberColor(name);
  return (
    <span
      className={clsx("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={t("a11y.avatarOf", { name })}
          width={size}
          height={size}
          className="h-full w-full rounded-full border border-border object-cover"
        />
      ) : (
        <span
          role="img"
          aria-label={t("a11y.avatarOf", { name })}
          className="flex h-full w-full items-center justify-center rounded-full font-semibold"
          style={{ fontSize: Math.round(size * 0.38), background: color.bg, color: color.ink }}
        >
          <span dir={isLatin ? "ltr" : undefined} className="bidi-iso">
            {initials}
          </span>
        </span>
      )}
      {online && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-surface"
        />
      )}
    </span>
  );
}
