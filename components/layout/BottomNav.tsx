"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, Images, ListChecks, LoaderCircle, Wallet, type LucideIcon } from "lucide-react";
import { t } from "@/lib/i18n";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra paths that keep this tab highlighted (deep views inside the tab). */
  aliases: string[];
}

const items: NavItem[] = [
  { href: "/today", label: t("nav.ourDay"), icon: CalendarDays, aliases: ["/route", "/map", "/travel", "/flights", "/stay"] },
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
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    const prefetch = () => items.forEach((item) => router.prefetch(item.href));
    const id = globalThis.setTimeout(prefetch, 500);
    return () => globalThis.clearTimeout(id);
  }, [router]);

  return (
    <nav aria-label={t("nav.label")} className="fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(.5rem,env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto flex h-[4.25rem] w-full max-w-[27rem] items-stretch rounded-[1.4rem] border border-white/50 bg-surface/90 p-1 shadow-[0_16px_45px_-18px_rgb(15_23_42/.45)] backdrop-blur-xl dark:border-white/10">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item);
          const pending = pendingHref === item.href && !active;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (!active) setPendingHref(item.href);
              }}
              onPointerEnter={() => router.prefetch(item.href)}
              onFocus={() => router.prefetch(item.href)}
              onTouchStart={() => router.prefetch(item.href)}
              className={clsx(
                "relative flex min-w-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1rem]",
                "transition-colors duration-150",
                active || pending ? "bg-brand-soft text-brand-strong" : "text-text-muted active:bg-surface-raised active:text-text-secondary",
              )}
            >
              {(active || pending) && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 -top-1 mx-auto h-1 w-8 rounded-full bg-accent-paprika"
                />
              )}
              {pending ? <LoaderCircle aria-hidden size={24} className="animate-spin" /> : <Icon aria-hidden size={24} strokeWidth={active ? 2.4 : 2} />}
              <span className={clsx("text-[11px] leading-4", active || pending ? "font-bold" : "font-medium")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
