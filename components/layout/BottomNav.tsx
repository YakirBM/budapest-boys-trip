"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, MoreHorizontal, Route, Wallet, type LucideIcon } from "lucide-react";
import { t } from "@/lib/i18n";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const items: NavItem[] = [
  { href: "/today", label: t("nav.today"), icon: Home },
  { href: "/route", label: t("nav.route"), icon: Route },
  { href: "/map", label: t("nav.map"), icon: Map },
  { href: "/money", label: t("nav.money"), icon: Wallet },
  { href: "/more", label: t("nav.more"), icon: MoreHorizontal },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * BottomNav — 64px + safe-area, 5 items (היום · מסלול · מפה · כספים · עוד),
 * active = brand color + 12px top indicator (doc 05 §6). Icons are object/
 * state icons (never mirrored): home, route, map, wallet, more.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav aria-label={t("nav.label")} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-safe backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-md items-stretch">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "relative flex min-w-12 flex-1 flex-col items-center justify-center gap-1 rounded-lg",
                "transition-colors duration-150",
                active ? "text-brand" : "text-text-muted active:text-text-secondary",
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 mx-auto h-1 w-8 rounded-full bg-brand"
                />
              )}
              <Icon aria-hidden size={24} strokeWidth={active ? 2.4 : 2} />
              <span className={clsx("text-[11px] leading-4", active ? "font-bold" : "font-medium")}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
