import clsx from "clsx";
import {
  Armchair,
  BedDouble,
  Footprints,
  Landmark,
  MapPin,
  Martini,
  Plane,
  TrainFront,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { categoryColorVar, type Category } from "./types";

export interface CategoryIconProps {
  category: Category;
  /** Pixel size of the rounded square (default 24). */
  size?: number;
  /** Solid category color with white icon (selected state). */
  selected?: boolean;
  className?: string;
}

const categoryIcons: Record<Category, LucideIcon> = {
  food: Utensils,
  attraction: Landmark,
  walk: Footprints,
  transit: TrainFront,
  rest: Armchair,
  nightlife: Martini,
  flight: Plane,
  accommodation: BedDouble,
  other: MapPin,
};

/**
 * CategoryIcon — category-colored icon inside a 12%-tint rounded square with
 * 8px radius (doc 05 §7). `selected` flips to solid fill + white icon.
 */
export function CategoryIcon({ category, size = 24, selected = false, className }: CategoryIconProps) {
  const Icon = categoryIcons[category];
  const color = categoryColorVar(category);
  const iconBox = Math.max(12, Math.round(size * 0.55));
  return (
    <span
      aria-hidden
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-lg", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: selected ? color : `color-mix(in srgb, ${color} 12%, transparent)`,
        color: selected ? "#ffffff" : color,
      }}
    >
      <Icon size={iconBox} strokeWidth={2} />
    </span>
  );
}

/** Hebrew label for a category (from categories.*). */
export function categoryLabel(category: Category): string {
  return t(`categories.${category}`);
}
