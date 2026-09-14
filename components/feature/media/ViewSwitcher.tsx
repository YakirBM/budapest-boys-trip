"use client";

import { CalendarDays, Images, Map, MapPin, Users } from "lucide-react";
import { t } from "@/lib/i18n";
import type { MediaWallView } from "./media-views";
import { MEDIA_WALL_VIEWS } from "./media-views";

/**
 * ViewSwitcher — sticky five-mode switch over one media source
 * (docs/14 §6.3). RTL-safe horizontal strip; every tab is a 48px target.
 * Persistence (`?view=`) is owned by the parent via value/onChange so the
 * switcher stays a pure controlled component.
 */

const VIEW_ICONS: Record<MediaWallView, typeof Images> = {
  albums: Images,
  people: Users,
  places: MapPin,
  map: Map,
  days: CalendarDays,
};

const VIEW_LABELS: Record<MediaWallView, string> = {
  albums: "media.byAlbums",
  people: "media.byPeople",
  places: "media.byPlaces",
  map: "media.byMap",
  days: "media.byDays",
};

export function ViewSwitcher({
  view,
  onChange,
}: {
  view: MediaWallView;
  onChange: (next: MediaWallView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={t("media.viewLabel")}
      className="scrollbar-none sticky top-[calc(env(safe-area-inset-top,0px)+8rem)] z-20 mb-3 flex gap-1.5 overflow-x-auto rounded-2xl border border-border bg-background/95 p-1.5 backdrop-blur"
    >
      {MEDIA_WALL_VIEWS.map((mode) => {
        const Icon = VIEW_ICONS[mode];
        const active = view === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(mode)}
            className={
              active
                ? "inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-brand px-3 text-sm font-bold text-brand-contrast"
                : "inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-bold text-text-secondary transition-opacity active:opacity-80"
            }
          >
            <Icon aria-hidden size={18} />
            {t(VIEW_LABELS[mode] as "media.byAlbums")}
          </button>
        );
      })}
    </div>
  );
}
