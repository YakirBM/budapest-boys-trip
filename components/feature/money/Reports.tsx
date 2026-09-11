"use client";

import { useMemo } from "react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { MemberAvatar } from "@/components/ui/MemberAvatar";
import { formatMoney } from "@/components/ui/MoneyAmount";
import { expenseCategoryLabel } from "./visuals";
import type { ExpenseRow } from "@/lib/data/money";
import type { TripMember } from "@/lib/data/trip";

export interface ReportsProps {
  expenses: ExpenseRow[];
  members: TripMember[];
  nameOf: Map<string, string>;
}

/** Expense category → --color-cat-* token (mirrors visuals.tsx mapping). */
const CATEGORY_COLOR: Record<string, string> = {
  lodging: "var(--color-cat-accommodation)",
  food: "var(--color-cat-food)",
  transit: "var(--color-cat-transit)",
  attraction: "var(--color-cat-attraction)",
  shopping: "var(--color-cat-rest)",
  nightlife: "var(--color-cat-nightlife)",
  taxi: "var(--color-cat-walk)",
  other: "var(--color-cat-other)",
};

function colorFor(category: string): string {
  return CATEGORY_COLOR[category] ?? CATEGORY_COLOR["other"]!;
}

interface CategorySlice {
  category: string;
  total: number;
  count: number;
  hasFx: boolean;
}

/**
 * Reports — CSS-only visuals (docs/14 §5.4): category donut via
 * conic-gradient from --color-cat-*, daily flex bars (HUF heights),
 * per-member totals. Every FX-involved figure carries the estimate label.
 * All Hebrew via t() only; amounts LTR-isolated with tnum.
 */
export function Reports({ expenses, members, nameOf }: ReportsProps) {
  const categories = useMemo<CategorySlice[]>(() => {
    const map = new Map<string, CategorySlice>();
    for (const e of expenses) {
      if (e.is_personal) continue;
      const base = e.amount_base_huf ?? e.amount;
      const prev = map.get(e.category) ?? { category: e.category, total: 0, count: 0, hasFx: false };
      prev.total += base;
      prev.count += 1;
      if (e.currency !== "HUF") prev.hasFx = true;
      map.set(e.category, prev);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [expenses]);

  const byDay = useMemo(() => {
    const map = new Map<string, { day: number | null; total: number; hasFx: boolean }>();
    for (const e of expenses) {
      if (e.is_personal) continue;
      const key = e.day_number === null ? "none" : String(e.day_number);
      const prev = map.get(key) ?? { day: e.day_number, total: 0, hasFx: false };
      prev.total += e.amount_base_huf ?? e.amount;
      if (e.currency !== "HUF") prev.hasFx = true;
      map.set(key, prev);
    }
    return [...map.values()].sort((a, b) => {
      if (a.day === null) return 1;
      if (b.day === null) return -1;
      return a.day - b.day;
    });
  }, [expenses]);

  const byMember = useMemo(() => {
    return members.map((m) => {
      let paid = 0;
      let hasFx = false;
      for (const e of expenses) {
        if (e.is_personal || e.paid_by !== m.user_id) continue;
        paid += e.amount_base_huf ?? e.amount;
        if (e.currency !== "HUF") hasFx = true;
      }
      return { userId: m.user_id, name: m.full_name, paid, hasFx };
    });
  }, [expenses, members]);

  const grandTotal = categories.reduce((acc, c) => acc + c.total, 0);
  const maxDay = Math.max(1, ...byDay.map((d) => d.total));

  const donutBackground = useMemo(() => {
    if (grandTotal <= 0 || categories.length === 0) {
      return "var(--color-border)";
    }
    let acc = 0;
    const stops = categories.map((c) => {
      const start = (acc / grandTotal) * 100;
      acc += c.total;
      const end = (acc / grandTotal) * 100;
      return `${colorFor(c.category)} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [categories, grandTotal]);

  if (expenses.filter((e) => !e.is_personal).length === 0) {
    return (
      <Card className="mb-4">
        <h2 className="text-base font-semibold text-text-primary">{t("money.reports.title")}</h2>
        <p className="mt-1 text-xs text-text-muted">{t("money.reports.empty")}</p>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text-primary">{t("money.reports.title")}</h2>
        <span className="text-xs text-text-muted">
          <span dir="ltr" className="tnum">{formatMoney(grandTotal, "HUF")}</span>
        </span>
      </div>

      {/* Category donut */}
      <h3 className="mb-2 text-sm font-bold text-text-secondary">{t("money.reports.byCategory")}</h3>
      <div className="mb-3 flex items-center gap-3">
        <div
          role="img"
          aria-label={t("money.reports.byCategory")}
          className="relative h-28 w-28 shrink-0 rounded-full"
          style={{ background: donutBackground }}
        >
          <div className="absolute inset-4 flex items-center justify-center rounded-full bg-surface">
            <span dir="ltr" className="tnum px-1 text-center text-xs font-bold text-text-primary">
              {formatMoney(grandTotal, "HUF")}
            </span>
          </div>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
          {categories.map((c) => {
            const pct = grandTotal > 0 ? Math.round((c.total / grandTotal) * 100) : 0;
            return (
              <li key={c.category} className="flex min-w-0 items-center gap-2 text-xs">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorFor(c.category) }} />
                <span className="min-w-0 flex-1 truncate font-semibold text-text-secondary">
                  {expenseCategoryLabel(c.category)} · <span dir="ltr" className="tnum">{pct}%</span>
                </span>
                <span dir="ltr" className="tnum shrink-0 font-bold text-text-primary">
                  {formatMoney(c.total, "HUF")}
                </span>
                {c.hasFx && (
                  <span className="shrink-0 rounded-full bg-warning/12 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                    {t("money.reports.estimated")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Daily bars */}
      <h3 className="mb-2 text-sm font-bold text-text-secondary">{t("money.reports.byDay")}</h3>
      <div className="mb-3 flex items-end gap-2" role="img" aria-label={t("money.reports.byDay")}>
        {byDay.map((d) => {
          const key = d.day === null ? "none" : String(d.day);
          const heightPct = Math.max(4, Math.round((d.total / maxDay) * 100));
          return (
            <div key={key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span dir="ltr" className="tnum truncate text-[10px] font-bold text-text-primary">
                {d.total >= 1000 ? `${Math.round(d.total / 1000)}k` : String(Math.round(d.total))}
              </span>
              <div className="flex h-20 w-full items-end rounded-lg bg-surface-raised p-1">
                <div
                  className="w-full rounded-md bg-brand"
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-text-muted">
                {d.day === null ? t("money.noDay") : t("money.dayGroup", { day: d.day })}
              </span>
              {d.hasFx && (
                <span className="rounded-full bg-warning/12 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                  {t("money.reports.estimated")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Per-member totals */}
      <h3 className="mb-2 text-sm font-bold text-text-secondary">{t("money.reports.byMember")}</h3>
      <ul className="flex flex-col gap-1.5">
        {byMember.map((m) => (
          <li key={m.userId} className="flex items-center gap-2 rounded-lg bg-surface-raised px-3 py-2">
            <MemberAvatar name={nameOf.get(m.userId) ?? m.name} size={28 as 32} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
              {nameOf.get(m.userId) ?? m.name}
            </span>
            {m.hasFx && (
              <span className="shrink-0 rounded-full bg-warning/12 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                {t("money.reports.estimated")}
              </span>
            )}
            <span dir="ltr" className="tnum shrink-0 text-sm font-bold text-text-primary">
              {formatMoney(m.paid, "HUF")}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
