"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface FabProps {
  /** Accessible label — the FAB is icon-only (doc 05 §10). */
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  icon?: ReactNode;
  /** Renders a Link instead of a button when provided. */
  href?: string;
  className?: string;
}

/**
 * FAB — single primary action per screen. 56px circle, brand, positioned 16px
 * above the bottom nav at the END edge (visual left under RTL, doc 05 §7).
 * Hides on scroll-down, reappears on scroll-up. Pressed state scales to 0.96.
 */
export function Fab({ label, onClick, icon, href, className }: FabProps) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (y < 80) {
        setHidden(false);
      } else if (delta > 4) {
        setHidden(true);
      } else if (delta < -4) {
        setHidden(false);
      }
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const visual = icon ?? <span aria-hidden className="text-3xl leading-none">+</span>;
  const positionClasses = clsx(
    "fixed z-40 end-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-lg",
    "transition-[transform,opacity] duration-200 ease-out active:scale-95",
    hidden && "pointer-events-none translate-y-24 opacity-0",
    className,
  );
  const style = { bottom: "calc(4rem + env(safe-area-inset-bottom, 0px) + 1rem)" } as const;

  if (href) {
    return (
      <a href={href} aria-label={label} className={positionClasses} style={style}>
        {visual}
      </a>
    );
  }

  return (
    <button type="button" aria-label={label} onClick={onClick} className={positionClasses} style={style}>
      {visual}
    </button>
  );
}

export type FabIcon = LucideIcon;
