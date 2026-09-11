"use client";

import clsx from "clsx";
import { t } from "@/lib/i18n";

export interface MemberAvatarProps {
  name: string;
  imageUrl?: string;
  /** 32 or 40 (doc 05 §7). */
  size?: 32 | 40;
  /** Success-colored presence dot. */
  online?: boolean;
  className?: string;
}

/** First letters of first + last word; LTR-isolated when Latin. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** MemberAvatar — photo with Hebrew-initials fallback (doc 05 §7). */
export function MemberAvatar({ name, imageUrl, size = 32, online = false, className }: MemberAvatarProps) {
  const isLatin = /^[\x20-\x7E]+$/.test(initials(name));
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
          className="flex h-full w-full items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-strong"
          style={{ fontSize: Math.round(size * 0.38) }}
        >
          <span dir={isLatin ? "ltr" : undefined} className="bidi-iso">
            {initials(name)}
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
