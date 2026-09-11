"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Images, ListChecks, Wallet, type LucideIcon } from "lucide-react";
import { t } from "@/lib/i18n";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra paths that keep this tab highlighted (deep views inside the tab). */
  aliases: string[];
}

const items: NavItem[] = [
  { href: "/today", label: t("nav.ourDay"), icon: CalendarDays, aliases: ["/route", "/map"] },
  { href: "/checklists", label: t("nav.lists"), icon: ListChecks, aliases: [] },
  { href: "/money", label: t("nav.money"), icon: Wallet, aliases: [] },
  { href: "/media", label: t("nav.memories"), icon: Images, aliases: [] },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return item.aliases.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`));
}

/**
 * BottomNav — 64px + safe-area, 4 items (Our Day · Lists · Money ·
 * Memory Wall), active = brand color + 12px top indicator (doc 05 §6).
 * /route and /map keep resolving as deep views inside "Our Day" (docs/14 §2).
 * Icons are object/state icons (never mirrored).
 */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav aria-label={t("nav.label")} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-safe backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-md items-stretch">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onPointerEnter={() => router.prefetch(item.href)}
              onFocus={() => router.prefetch(item.href)}
              onTouchStart={() => router.prefetch(item.href)}
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
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
