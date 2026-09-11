import clsx from "clsx";

/**
 * DirectionalIcon — the single wrapper for icons that must MIRROR under RTL
 * (arrows, chevrons, back/forward, send, "open in" — doc 05 §2).
 * Never wrap clocks, checkmarks, logos, media controls, or phone icons.
 */
import type { LucideIcon } from "lucide-react";

export interface DirectionalIconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function DirectionalIcon({ icon: Icon, size = 20, className, strokeWidth }: DirectionalIconProps) {
  return (
    <Icon
      aria-hidden
      size={size}
      strokeWidth={strokeWidth}
      className={clsx("rtl:-scale-x-100", className)}
    />
  );
}
