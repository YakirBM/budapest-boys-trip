"use client";

import { useEffect, useState } from "react";
import { LifeBuoy, Share2, WifiOff } from "lucide-react";
import { t } from "@/lib/i18n";
import { TZ_BUDAPEST, TZ_JERUSALEM, formatDateHebrew, weekdayHebrew } from "@/lib/utils/time";
import { whatsappShare } from "@/lib/utils/deeplinks";
import { EstimateBadge } from "@/components/ui/EstimateBadge";
import type { WeatherInfo } from "@/lib/data/today";

export interface StatusStripProps {
  dayNumber: number;
  dateIso: string;
  dayTitle: string | null;
  weather: WeatherInfo | null;
  checkinDone: number;
  checkinTotal: number;
  onEmergency: () => void;
}

const STALE_MS = 3 * 60 * 60 * 1000;

/** Clock pair — rendered after mount so SSR and hydration agree. */
function TzClocks() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const fmt = (tz: string) =>
    now
      ? new Intl.DateTimeFormat("he-IL", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(now)
      : "--:--";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
      <span dir="ltr" className="ltr-iso tnum rounded-md bg-surface-raised px-1.5 py-0.5 font-semibold">
        {fmt(TZ_BUDAPEST)}
      </span>
      <span>{t("today.tzHungary")}</span>
      <span aria-hidden>·</span>
      <span dir="ltr" className="ltr-iso tnum rounded-md bg-surface-raised px-1.5 py-0.5">
        {fmt(TZ_JERUSALEM)}
      </span>
      <span>{t("today.tzIsrael")}</span>
    </span>
  );
}

function WeatherPill({ weather }: { weather: WeatherInfo }) {
  const fetchedAt = weather.fetchedAt ? Date.parse(weather.fetchedAt) : null;
  const stale = fetchedAt === null || Date.now() - fetchedAt > STALE_MS;
  const sunset = weather.sunsetTime
    ? new Intl.DateTimeFormat("he-IL", {
        timeZone: TZ_BUDAPEST,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(weather.sunsetTime))
    : null;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
      {weather.tempMin !== null && weather.tempMax !== null && (
        <span dir="ltr" className="ltr-iso tnum font-semibold">
          {weather.tempMin}°–{weather.tempMax}°
        </span>
      )}
      {weather.precipProb !== null && (
        <span>{t("today.weather.rainPct", { pct: weather.precipProb })}</span>
      )}
      {weather.wind !== null && <span>{t("today.weather.wind", { wind: weather.wind })}</span>}
      {sunset && <span>{t("today.weather.sunset", { time: sunset })}</span>}
      {stale && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/12 px-1.5 py-0.5 font-bold text-warning">
          <WifiOff aria-hidden size={11} className="shrink-0" />
          {t("today.weather.stale")}
        </span>
      )}
      {weather.source && weather.fetchedAt && (
        <EstimateBadge source={weather.source} lastVerifiedAt={weather.fetchedAt} />
      )}
    </span>
  );
}

/**
 * StatusStrip — sticky day header (doc 00): day X/5 + Hebrew date, dual tz
 * clocks, weather (weather_cache only — hidden when the cache is empty, never
 * fabricated), check-in counter, share-location deep-link-out and emergency.
 */
export function StatusStrip({
  dayNumber,
  dateIso,
  dayTitle,
  weather,
  checkinDone,
  checkinTotal,
  onEmergency,
}: StatusStripProps) {
  const share = () => {
    const text = t("today.share.text");
    if (typeof navigator !== "undefined" && navigator.share) {
      void navigator.share({ text }).catch(() => undefined);
    } else {
      window.open(whatsappShare(text), "_blank", "noopener,noreferrer");
    }
  };

  return (
    <section
      aria-label={t("today.dayXof5", { day: dayNumber })}
      className="sticky top-14 z-20 -mx-4 mb-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-base font-bold text-text-primary">
            {t("today.dayXof5", { day: dayNumber })}
            <span className="ms-2 text-sm font-medium text-text-muted">
              {weekdayHebrew(dateIso)} {formatDateHebrew(dateIso)}
            </span>
          </h2>
          {dayTitle && <p className="truncate text-xs text-text-muted">{dayTitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={share}
            aria-label={t("a11y.shareLocation")}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-text-secondary transition-opacity active:opacity-80"
          >
            <Share2 aria-hidden size={20} />
          </button>
          <button
            type="button"
            onClick={onEmergency}
            aria-label={t("a11y.emergency")}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-danger/12 text-danger transition-opacity active:opacity-80"
          >
            <LifeBuoy aria-hidden size={20} />
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex flex-col gap-1">
        <TzClocks />
        {weather && <WeatherPill weather={weather} />}
        {checkinTotal > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            {t("today.checkin")}
            <span dir="ltr" className="tnum font-semibold">
              {checkinDone}/{checkinTotal}
            </span>
          </span>
        )}
      </div>
    </section>
  );
}
