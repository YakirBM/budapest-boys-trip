"use client";

import clsx from "clsx";
import {
  BedDouble,
  CarTaxiFront,
  Landmark,
  Martini,
  MoreHorizontal,
  ShoppingBag,
  TrainFront,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { t } from "@/lib/i18n";

/** Visual identity for the DB enum expense_category (docs/03 §4.4). */
export const EXPENSE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  lodging: BedDouble,
  food: Utensils,
  transit: TrainFront,
  attraction: Landmark,
  shopping: ShoppingBag,
  nightlife: Martini,
  taxi: CarTaxiFront,
  other: MoreHorizontal,
};

const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  lodging: "var(--color-cat-accommodation)",
  food: "var(--color-cat-food)",
  transit: "var(--color-cat-transit)",
  attraction: "var(--color-cat-attraction)",
  shopping: "var(--color-cat-rest)",
  nightlife: "var(--color-cat-nightlife)",
  taxi: "var(--color-cat-walk)",
  other: "var(--color-cat-other)",
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  lodging: t("money.category.lodging"),
  food: t("money.category.food"),
  transit: t("money.category.transit"),
  attraction: t("money.category.attraction"),
  shopping: t("money.category.shopping"),
  nightlife: t("money.category.nightlife"),
  taxi: t("money.category.taxi"),
  other: t("money.category.other"),
};

export function expenseCategoryLabel(category: string): string {
  return EXPENSE_CATEGORY_LABELS[category] ?? category;
}

/** Category icon in a 12%-tint square (doc 05 §7), selectable for the form chips. */
export function ExpenseCategoryIcon({
  category,
  size = 40,
  selected = false,
}: {
  category: string;
  size?: number;
  selected?: boolean;
}) {
  const Icon = EXPENSE_CATEGORY_ICONS[category] ?? MoreHorizontal;
  const color = EXPENSE_CATEGORY_COLORS[category] ?? EXPENSE_CATEGORY_COLORS["other"]!;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-lg"
      style={{
        width: size,
        height: size,
        backgroundColor: selected ? color : `color-mix(in srgb, ${color} 12%, transparent)`,
        color: selected ? "#ffffff" : color,
      }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}

const EXPENSE_STATUS_COLORS: Record<string, string> = {
  draft: "var(--color-st-planned)",
  confirmed: "var(--color-st-confirmed)",
  settled: "var(--color-exp-settled)",
  refunded: "var(--color-st-cancelled)",
  pending: "var(--color-info)",
};

const EXPENSE_STATUS_LABELS: Record<string, string> = {
  draft: t("money.status.draft"),
  confirmed: t("money.status.confirmed"),
  settled: t("money.status.settled"),
  refunded: t("money.status.refunded"),
  pending: t("money.status.pending"),
};

/** Status pill for the expense lifecycle (+ local "pending sync" state). */
export function ExpenseStatusChip({ status, className }: { status: string; className?: string }) {
  const color = EXPENSE_STATUS_COLORS[status] ?? EXPENSE_STATUS_COLORS["draft"]!;
  const label = EXPENSE_STATUS_LABELS[status] ?? status;
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold",
        className,
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
