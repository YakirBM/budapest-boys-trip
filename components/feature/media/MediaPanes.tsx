"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Lock } from "lucide-react";
import { t } from "@/lib/i18n";
import type { MapPlace } from "@/lib/data/route";
import {
  groupItemsByAlbum,
  groupItemsByDay,
  groupItemsByPlace,
  hasLocation,
  peopleOf,
  type WallAlbum,
  type WallViewItem,
} from "./media-views";

/**
 * Memory Wall panes (docs/14 §6.3) — five views over one filtered source.
 * Cover/chip grids navigate by setting the shared filter state owned by
 * MediaView (albumFilter / personFilter / placeFilter), so detail rendering
 * reuses the same grid + viewer. All targets ≥ 48px, logical RTL props only.
 */

export interface MemberChip {
  user_id: string;
  full_name: string;
}

export interface PlaceChip {
  id: string;
  name: string;
}

function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-text-secondary transition-opacity active:opacity-80"
    >
      <span aria-hidden className="rtl:rotate-180">→</span>
      {label}
    </button>
  );
}

function TileGrid({
  items,
  renderTile,
}: {
  items: WallViewItem[];
  renderTile: (item: WallViewItem) => ReactNode;
}) {
  return (
    <div className="columns-2 gap-2 min-[430px]:columns-3">
      {items.map((item) => (
        <div key={item.id} className="break-inside-avoid">
          {renderTile(item)}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Albums                                                              */
/* ------------------------------------------------------------------ */

export function AlbumsPane({
  items,
  albums,
  activeAlbumId,
  onSelectAlbum,
  renderTile,
}: {
  items: WallViewItem[];
  albums: WallAlbum[];
  /** null = cover grid; "none" = no-album detail; id = album detail. */
  activeAlbumId: string | "none" | null;
  onSelectAlbum: (id: string | "none" | null) => void;
  renderTile: (item: WallViewItem) => ReactNode;
}) {
  const byId = useMemo(() => new Map(albums.map((a) => [a.id, a])), [albums]);
  const groups = useMemo(() => groupItemsByAlbum(items), [items]);
  const sortedAlbums = useMemo(
    () =>
      [...groups]
        .filter((g) => g.albumId !== null)
        .sort((a, b) =>
          (byId.get(a.albumId as string)?.name ?? "").localeCompare(
            byId.get(b.albumId as string)?.name ?? "",
            "he",
          ),
        ),
    [groups, byId],
  );
  const unknownGroup = groups.find((g) => g.albumId === null) ?? null;

  if (activeAlbumId !== null) {
    const detail =
      activeAlbumId === "none"
        ? unknownGroup
        : groups.find((g) => g.albumId === activeAlbumId) ?? null;
    return (
      <div className="flex flex-col gap-3">
        <div>
          <BackButton label={t("media.albumsBack")} onBack={() => onSelectAlbum(null)} />
        </div>
        {detail && detail.items.length > 0 ? (
          <TileGrid items={detail.items} renderTile={renderTile} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {sortedAlbums.map((group) => {
        const album = byId.get(group.albumId as string);
        const isPrivate = album?.visibility === "private";
        return (
          <button
            key={group.albumId as string}
            type="button"
            onClick={() => onSelectAlbum(group.albumId as string)}
            className="flex min-h-12 flex-col items-start gap-1 rounded-xl border border-border bg-surface-raised p-3 text-start transition-opacity active:opacity-80"
          >
            <span className="flex w-full items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-text-primary">
                {album?.name ?? t("media.unknownAlbum")}
              </span>
              {isPrivate ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">
                  <Lock aria-hidden size={11} />
                  {t("media.visibilityPrivate")}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand-strong">
                  {t("media.visibilityShared")}
                </span>
              )}
            </span>
            <span className="text-xs text-text-muted">
              {t("media.albumCount", { count: group.items.length })}
            </span>
          </button>
        );
      })}
      {unknownGroup && (
        <button
          type="button"
          onClick={() => onSelectAlbum("none")}
          className="flex min-h-12 flex-col items-start gap-1 rounded-xl border border-dashed border-border bg-surface p-3 text-start transition-opacity active:opacity-80"
        >
          <span className="truncate text-sm font-bold text-text-secondary">{t("media.unknownAlbum")}</span>
          <span className="text-xs text-text-muted">
            {t("media.albumCount", { count: unknownGroup.items.length })}
          </span>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export function PeoplePane({
  items,
  members,
  activePerson,
  onSelectPerson,
  renderTile,
}: {
  items: WallViewItem[];
  members: MemberChip[];
  /** "" = chip grid; "none" = untagged detail; userId = person detail. */
  activePerson: string;
  onSelectPerson: (id: string) => void;
  renderTile: (item: WallViewItem) => ReactNode;
}) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    let untagged = 0;
    for (const item of items) {
      const people = peopleOf(item);
      if (people.length === 0) untagged += 1;
      for (const id of people) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return { map, untagged };
  }, [items]);
  const nameOf = useMemo(() => new Map(members.map((m) => [m.user_id, m.full_name])), [members]);
  const orderedIds = useMemo(
    () =>
      [...counts.map.entries()].sort(
        ([aId, aCount], [bId, bCount]) =>
          bCount - aCount ||
          (nameOf.get(aId) ?? "").localeCompare(nameOf.get(bId) ?? "", "he"),
      ),
    [counts, nameOf],
  );

  if (activePerson !== "") {
    const detail =
      activePerson === "none"
        ? items.filter((i) => peopleOf(i).length === 0)
        : items.filter((i) => peopleOf(i).includes(activePerson));
    return (
      <div className="flex flex-col gap-3">
        <div>
          <BackButton label={t("media.peopleBack")} onBack={() => onSelectPerson("")} />
        </div>
        <TileGrid items={detail} renderTile={renderTile} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {orderedIds.map(([personId, count]) => (
        <button
          key={personId}
          type="button"
          onClick={() => onSelectPerson(personId)}
          className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface-raised p-2 text-start transition-opacity active:opacity-80"
        >
          <span
            aria-hidden
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-base font-bold text-brand-strong"
          >
            {(nameOf.get(personId) ?? "?").trim().charAt(0) || "?"}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-bold text-text-primary">
              {nameOf.get(personId) ?? t("media.unknownPerson")}
            </span>
            <span className="text-xs text-text-muted">
              {t("media.personCount", { count })}
            </span>
          </span>
        </button>
      ))}
      {counts.untagged > 0 && (
        <button
          type="button"
          onClick={() => onSelectPerson("none")}
          className="flex min-h-12 items-center gap-2 rounded-xl border border-dashed border-border bg-surface p-2 text-start transition-opacity active:opacity-80"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-bold text-text-secondary">{t("media.unknownPerson")}</span>
            <span className="text-xs text-text-muted">
              {t("media.personCount", { count: counts.untagged })}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Places                                                              */
/* ------------------------------------------------------------------ */

export function PlacesPane({
  items,
  places,
  activePlace,
  onSelectPlace,
  renderTile,
}: {
  items: WallViewItem[];
  places: PlaceChip[];
  /** "" = chip grid; "none" = unknown detail; id = place detail. */
  activePlace: string;
  onSelectPlace: (id: string) => void;
  renderTile: (item: WallViewItem) => ReactNode;
}) {
  const groups = useMemo(() => groupItemsByPlace(items), [items]);
  const nameOf = useMemo(() => new Map(places.map((p) => [p.id, p.name])), [places]);
  const known = groups.filter((g) => g.placeId !== null);
  const unknown = groups.find((g) => g.placeId === null) ?? null;

  if (activePlace !== "") {
    const detail =
      activePlace === "none"
        ? (unknown?.items ?? [])
        : (groups.find((g) => g.placeId === activePlace)?.items ?? []);
    return (
      <div className="flex flex-col gap-3">
        <div>
          <BackButton label={t("media.placesBack")} onBack={() => onSelectPlace("")} />
        </div>
        <TileGrid items={detail} renderTile={renderTile} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {known.map((group) => (
        <button
          key={group.placeId as string}
          type="button"
          onClick={() => onSelectPlace(group.placeId as string)}
          className="flex min-h-12 flex-col items-start gap-1 rounded-xl border border-border bg-surface-raised p-3 text-start transition-opacity active:opacity-80"
        >
          <span className="truncate text-sm font-bold text-text-primary">
            {nameOf.get(group.placeId as string) ??
              group.items[0]?.address_text ??
              t("media.unknownPlace")}
          </span>
          <span className="text-xs text-text-muted">
            {t("media.placeCount", { count: group.items.length })}
          </span>
        </button>
      ))}
      {unknown && (
        <button
          type="button"
          onClick={() => onSelectPlace("none")}
          className="flex min-h-12 flex-col items-start gap-1 rounded-xl border border-dashed border-border bg-surface p-3 text-start transition-opacity active:opacity-80"
        >
          <span className="truncate text-sm font-bold text-text-secondary">{t("media.unknownPlace")}</span>
          <span className="text-xs text-text-muted">
            {t("media.placeCount", { count: unknown.items.length })}
          </span>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

export function DaysPane({
  items,
  renderTile,
}: {
  items: WallViewItem[];
  renderTile: (item: WallViewItem) => ReactNode;
}) {
  const groups = useMemo(() => groupItemsByDay(items), [items]);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.day === null ? "none" : `day-${group.day}`} aria-label={group.day === null ? t("media.dayNone") : t("media.filterDay", { day: group.day })}>
          <h2 className="mb-2 text-sm font-bold text-text-primary">
            {group.day === null ? t("media.dayNone") : t("media.filterDay", { day: group.day })}
            <span className="ms-2 text-xs font-semibold text-text-muted">
              {t("media.albumCount", { count: group.items.length })}
            </span>
          </h2>
          <TileGrid items={group.items} renderTile={renderTile} />
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Map — photo pins over the shared InteractiveMap + no-location tray. */
/* ------------------------------------------------------------------ */

const InteractiveMap = dynamic(() => import("@/components/feature/map/InteractiveMap"), {
  ssr: false,
  loading: () => <div className="h-[54dvh] min-h-80 w-full animate-pulse bg-surface-raised" />,
});

function photoTitle(item: WallViewItem): string {
  return item.title ?? item.caption ?? item.address_text ?? item.id.slice(0, 8);
}

export function MapPane({
  items,
  onOpenItem,
}: {
  items: WallViewItem[];
  onOpenItem: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined") setIsOffline(!navigator.onLine);
  }, []);

  const located = useMemo(() => items.filter(hasLocation), [items]);
  const unlocated = useMemo(() => items.filter((i) => !hasLocation(i)), [items]);

  const mapPlaces: MapPlace[] = useMemo(
    () =>
      located.map((item) => ({
        id: item.id,
        name: photoTitle(item),
        category: "other" as const,
        status: "approved" as const,
        district: null,
        lat: item.lat,
        lng: item.lng,
        googleMapsUrl: null,
        estPrice: null,
        priceCurrency: "HUF" as const,
        lastVerifiedAt: null,
        scheduledDay: item.day_number,
      })),
    [located],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
        {isOffline ? (
          <p className="grid min-h-80 place-items-center p-6 text-center text-sm text-text-secondary">
            {t("media.mapOfflineHint")}
          </p>
        ) : (
          <InteractiveMap
            places={mapPlaces}
            anchors={[]}
            showPlaces
            showAnchors={false}
            selectedPlaceId={selectedId}
            userLocation={null}
            userLocationLabel=""
            clusterAriaLabel={(count) => t("media.mapClusterLabel", { count })}
            onSelectPlace={(id) => {
              setSelectedId(id);
              onOpenItem(id);
            }}
            onTileError={() => setTileError(true)}
          />
        )}
      </div>
      {tileError && !isOffline && (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-semibold text-danger" role="alert">
          {t("media.mapTileError")}
        </p>
      )}

      {/* No-location tray (same pattern as MapView's no-location list). */}
      {unlocated.length > 0 && (
        <div className="rounded-xl bg-surface p-3">
          <p className="text-xs font-bold text-text-muted">
            {t("media.noLocationTitle")} · {t("media.noLocationCount", { count: unlocated.length })}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">{t("media.noLocationHint")}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {unlocated.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpenItem(item.id)}
                  className="inline-flex min-h-12 w-full items-center gap-2 rounded-lg px-1 text-start text-sm text-text-primary active:opacity-80"
                >
                  <span className="min-w-0 flex-1 truncate">{photoTitle(item)}</span>
                  {item.day_number !== null && (
                    <span className="shrink-0 text-xs text-text-muted">
                      {t("media.filterDay", { day: item.day_number })}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
