"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { t } from "@/lib/i18n";
import type { LibraryPlace } from "@/lib/data/route";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { MemberAvatar } from "@/components/ui/MemberAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import type { Category } from "@/components/ui/types";

export type PlaceSort = "name" | "price" | "district";

export interface PlacesGridProps {
  places: LibraryPlace[];
  onOpen: (place: LibraryPlace) => void;
  onAdd: () => void;
}

const TYPE_FILTERS: Category[] = ["food", "attraction", "rest", "other"];

/**
 * PlacesGrid — colorful responsive grid (docs/14 §3.4.1).
 * 2 cols mobile, 3 cols ≥480px. Cover image top, type chip, price estimate
 * with source badge, status ribbon, suggester avatar.
 */
export function PlacesGrid({ places, onOpen, onAdd }: PlacesGridProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<Category>>(new Set());
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const [sort, setSort] = useState<PlaceSort>("name");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const place of places) map.set(place.status, (map.get(place.status) ?? 0) + 1);
    return map;
  }, [places]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = places.filter((place) => {
      if (q && !`${place.name} ${place.district ?? ""} ${place.note ?? ""}`.toLowerCase().includes(q)) return false;
      if (typeFilter.size > 0 && !typeFilter.has(place.category)) return false;
      if (unverifiedOnly && place.lastVerifiedAt !== null) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "he");
      if (sort === "district") return (a.district ?? "").localeCompare(b.district ?? "", "he");
      return (a.estPrice ?? Number.POSITIVE_INFINITY) - (b.estPrice ?? Number.POSITIVE_INFINITY);
    });
    return list;
  }, [places, search, typeFilter, unverifiedOnly, sort]);

  function toggleType(category: Category): void {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <section aria-label={t("route.discover.title")} className="flex flex-col gap-3">
      <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label={t("route.library.title")}>
        {(["idea", "under_review", "approved", "scheduled", "rejected"] as const).map((status) => (
          <span
            key={status}
            className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-surface px-3 text-xs font-bold text-text-secondary"
          >
            {t(`map.status${capitalize(status)}` as never)}
            <span dir="ltr" className="ltr-iso tnum">{counts.get(status) ?? 0}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <label htmlFor="place-search" className="sr-only">{t("route.discover.searchLabel")}</label>
          <input
            id="place-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("route.discover.searchPlaceholder")}
            className="min-h-12 w-full rounded-xl border border-border bg-surface py-2 pe-3 ps-9 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        </div>
        <Button variant="secondary" onClick={onAdd}>
          {t("route.discover.addPlace")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-text-muted">{t("route.discover.typeFilterLabel")}</span>
        {TYPE_FILTERS.map((category) => {
          const active = typeFilter.has(category);
          return (
            <button
              key={category}
              type="button"
              aria-pressed={active}
              onClick={() => toggleType(category)}
              className={clsx(
                "inline-flex min-h-12 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold",
                active ? "border-transparent bg-brand text-brand-contrast" : "border-border bg-surface text-text-secondary",
              )}
            >
              <CategoryIcon category={category} size={20} />
              {t(`categories.${category}`)}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={unverifiedOnly}
          onClick={() => setUnverifiedOnly((v) => !v)}
          className={clsx(
            "inline-flex min-h-12 items-center rounded-xl border px-3 text-xs font-bold",
            unverifiedOnly ? "border-transparent bg-warning text-white" : "border-border bg-surface text-text-secondary",
          )}
        >
          {t("route.discover.unverifiedOnly")}
        </button>
        <label className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-text-secondary">
          {t("route.discover.sortLabel")}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as PlaceSort)}
            className="bg-transparent text-xs font-bold text-text-primary focus:outline-none"
            aria-label={t("route.discover.sortLabel")}
          >
            <option value="name">{t("route.discover.sortName")}</option>
            <option value="price">{t("route.discover.sortPrice")}</option>
            <option value="district">{t("route.discover.sortDistrict")}</option>
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          illustration="box"
          title={t("route.discover.emptyTitle")}
          hint={t("route.discover.emptyHint")}
          ctaLabel={t("route.discover.addPlace")}
          onCta={onAdd}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3">
          {visible.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => onOpen(place)}
                aria-label={`${place.name} · ${t("route.discover.openDetail")}`}
                className="flex min-h-12 w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface text-start"
              >
                <span className="relative block h-24 w-full overflow-hidden bg-surface-raised">
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      backgroundImage: place.imageUrl
                        ? `linear-gradient(180deg, rgb(0 0 0 / 0.05), rgb(0 0 0 / 0.4)), url(${JSON.stringify(place.imageUrl)})`
                        : "linear-gradient(135deg, var(--color-brand-soft), var(--color-surface-raised))",
                      backgroundPosition: "center",
                      backgroundSize: "cover",
                    }}
                  />
                  <span className="absolute start-2 top-2 rounded-full bg-surface-raised/90 px-2 py-0.5 text-[11px] font-bold text-text-primary">
                    {t(`map.status${capitalize(place.status)}` as never)}
                  </span>
                  <span className="absolute end-2 top-2">
                    <CategoryIcon category={place.category} size={28} />
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
                  <span className="truncate text-sm font-bold text-text-primary">{place.name}</span>
                  {place.district && (
                    <span className="truncate text-[11px] text-text-muted">{place.district}</span>
                  )}
                  <span className="flex items-center gap-1.5">
                    {place.estPrice !== null ? (
                      <>
                        <MoneyAmount amount={place.estPrice} currency={place.priceCurrency} size="sm" />
                        {place.lastVerifiedAt === null && (
                          <span className="rounded-full bg-warning/12 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                            {t("route.discover.unverified")}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-text-muted">{t("route.library.noPrice")}</span>
                    )}
                  </span>
                  {place.suggestedByName && (
                    <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
                      <MemberAvatar name={place.suggestedByName} size={32} />
                      <span className="max-w-20 truncate">{place.suggestedByName}</span>
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function capitalize(status: string): string {
  return status
    .split("_")
    .map((part) => (part.length > 0 ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join("");
}
