"use client";

import { useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import {
  BedDouble,
  ChevronLeft,
  ClipboardList,
  Gavel,
  Images,
  Plane,
  Settings,
  ShieldAlert,
  TrainFront,
  type LucideIcon,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { useTheme, type ThemePreference } from "@/lib/theme/ThemeProvider";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { PendingSyncBadge } from "@/components/ui/PendingSyncBadge";
import { useOutboxSync } from "@/lib/offline/useOutboxSync";

interface MoreLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

const links: MoreLink[] = [
  { href: "/flights", label: t("more.flights"), icon: Plane },
  { href: "/stay", label: t("more.stay"), icon: BedDouble },
  { href: "/transit", label: t("more.transit"), icon: TrainFront },
  { href: "/checklists", label: t("more.checklists"), icon: ClipboardList },
  { href: "/media", label: t("more.media"), icon: Images },
  { href: "/safety", label: t("more.safety"), icon: ShieldAlert },
  { href: "/decisions", label: t("more.decisions"), icon: Gavel },
];

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "light", label: t("theme.light") },
  { value: "dark", label: t("theme.dark") },
  { value: "system", label: t("theme.system") },
];

/**
 * More — the "עוד" hub: links to every secondary screen, and an inline settings
 * placeholder (theme control per doc 05 §3) with the total pending-sync count
 * from the outbox (docs/07 §background sync: total count lives in /more).
 */
export default function MorePage() {
  const { preference, setTheme } = useTheme();
  const [pending, setPending] = useState(0);
  useOutboxSync(setPending);

  return (
    <>
      <Header title={t("more.title")} subtitle={t("more.subtitle")} />

      <section aria-label={t("more.linksSection")} className="flex flex-col gap-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-opacity active:opacity-80"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
              <Icon aria-hidden size={18} />
            </span>
            <span className="min-w-0 flex-1 truncate text-base font-medium text-text-primary">
              {label}
            </span>
            {/* Forward affordance under RTL — points left, must not mirror */}
            <ChevronLeft aria-hidden size={20} className="shrink-0 text-text-muted" />
          </Link>
        ))}
      </section>

      <section aria-label={t("more.settingsSection")} className="mt-6 flex flex-col gap-2">
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-text-primary">{t("settings.theme")}</h2>
            <span className="inline-flex items-center gap-2">
              <PendingSyncBadge count={pending} />
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-muted"
                aria-hidden
              >
                <Settings size={18} />
              </span>
            </span>
          </div>
          <div
            role="radiogroup"
            aria-label={t("settings.theme")}
            className="grid grid-cols-3 gap-1 rounded-xl bg-surface-raised p-1"
          >
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={preference === option.value}
                onClick={() => setTheme(option.value)}
                className={clsx(
                  "min-h-12 rounded-lg px-2 text-sm font-semibold transition-[background-color,color] duration-150",
                  preference === option.value
                    ? "bg-brand text-brand-contrast"
                    : "text-text-secondary active:opacity-80",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs leading-5 text-text-muted">
            {preference === "system" ? t("theme.systemHint") : t("theme.overrideHint")}
          </p>
        </Card>
      </section>
    </>
  );
}
