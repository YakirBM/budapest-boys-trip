"use client";

import clsx from "clsx";
import { t } from "@/lib/i18n";

export type MapLayerId = "essentials" | "metro" | "kosher" | "malls";

export interface LayersChipsProps {
  value: Set<MapLayerId>;
  onChange: (next: Set<MapLayerId>) => void;
}

const LAYERS: MapLayerId[] = ["essentials", "metro", "kosher", "malls"];

function layerLabel(id: MapLayerId): string {
  switch (id) {
    case "essentials":
      return t("map.layers.essentials");
    case "metro":
      return t("map.layers.metro");
    case "kosher":
      return t("map.layers.kosher");
    case "malls":
      return t("map.layers.malls");
  }
}

/**
 * LayersChips — multi-select icon chips above the map (docs/14 §3.3.1).
 * Persisted in the URL (?layers=...) by the parent.
 */
export function LayersChips({ value, onChange }: LayersChipsProps) {
  function toggle(id: MapLayerId): void {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("map.layers.label")}>
      {LAYERS.map((id) => {
        const active = value.has(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(id)}
            className={clsx(
              "inline-flex min-h-12 items-center rounded-xl border px-3 text-sm font-bold",
              active
                ? "border-transparent bg-brand text-brand-contrast"
                : "border-border bg-surface text-text-secondary",
            )}
          >
            {layerLabel(id)}
          </button>
        );
      })}
    </div>
  );
}
