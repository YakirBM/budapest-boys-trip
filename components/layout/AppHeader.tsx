"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { Moon, Siren, Sun } from "lucide-react";
import { t } from "@/lib/i18n";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { TZ_BUDAPEST, TZ_JERUSALEM } from "@/lib/utils/time";
import { EmergencySheet } from "@/components/feature/today/EmergencySheet";
import type { AccommodationInfo } from "@/lib/data/today";
import { ProfileMenu } from "./ProfileMenu";
import {
  CLOCK_STORAGE_KEY,
  formatFullDate,
  formatFullTime,
  type ClockPrimary,
} from "@/lib/utils/header-clock";

interface ShellWeather {
  tempMin: number | null;
  tempMax: number | null;
  precipProb: number | null;
  fetchedAt: string | null;
  source: string | null;
}

/**
 * AppHeader — global live shell header (docs/14 §1): trip identity + full
 * Hebrew date, theme switch, emergency + profile at the end edge, and a
 * compact live strip (flag-switch HU/IL clocks with seconds + weather pill).
 * Clocks tick locally; weather reads weather_cache only (never fabricated).
 */
export function AppHeader() {
  const { preference, resolvedTheme, setTheme } = useTheme();
  const [now, setNow] = useState(() => new Date());
  const [primary, setPrimary] = useState<ClockPrimary>("HU");
  const [weather, setWeather] = useState<ShellWeather | null>(null);
  const [accommodation, setAccommodation] = useState<AccommodationInfo>({
    booked: false,
    name: null,
    address: null,
  });
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLOCK_STORAGE_KEY);
      setPrimary(raw === "IL" ? "IL" : "HU");
    } catch {
      // session-only default HU
    }
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const [wx, acc] = await Promise.all([
          supabase
            .from("weather_cache")
            .select("temp_min,temp_max,precip_prob,source,fetched_at")
            .order("fetched_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from("accommodations").select("name,address").eq("status", "booked").limit(1),
        ]);
        if (cancelled) return;
        if (wx.data) {
          setWeather({
            tempMin: (wx.data["temp_min"] as number | null) ?? null,
            tempMax: (wx.data["temp_max"] as number | null) ?? null,
            precipProb: (wx.data["precip_prob"] as number | null) ?? null,
            fetchedAt: (wx.data["fetched_at"] as string | null) ?? null,
            source: (wx.data["source"] as string | null) ?? null,
          });
        }
        const row = acc.data?.[0] as { name?: unknown; address?: unknown } | undefined;
        if (row && typeof row["address"] === "string" && row["address"]) {
          setAccommodation({
            booked: true,
            name: typeof row["name"] === "string" ? row["name"] : null,
            address: row["address"],
          });
        }
      } catch {
        // Offline or RLS denial — header stays functional with clocks only.
      }
    };
    void load();
    const id = window.setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const swap = (next: ClockPrimary) => {
    setPrimary(next);
    try {
      window.localStorage.setItem(CLOCK_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const cycleTheme = () => {
    setTheme(preference === "system" ? "light" : preference === "light" ? "dark" : "system");
  };

  const hu = formatFullTime(TZ_BUDAPEST, now);
  const il = formatFullTime(TZ_JERUSALEM, now);
  const first = primary === "HU"
    ? { flag: "🇭🇺", label: t("header.budapest"), time: hu }
    : { flag: "🇮🇱", label: t("header.israel"), time: il };
  const second = primary === "HU"
    ? { flag: "🇮🇱", label: t("header.israel"), time: il }
    : { flag: "🇭🇺", label: t("header.budapest"), time: hu };

  return (
    <>
      <header className="sticky top-0 z-40 -mx-4 border-b border-border bg-background/90 px-4 pt-safe backdrop-blur">
        <div className="flex min-h-14 items-center gap-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-text-primary">
              ✈️ {t("meta.shortTitle")} 2026
            </p>
            <p className="truncate text-xs text-text-muted">{formatFullDate(now)}</p>
          </div>
          <button
            type="button"
            onClick={cycleTheme}
            aria-label={t("a11y.themeToggle")}
            title={t("theme.title")}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-text-secondary transition-opacity active:opacity-80"
          >
            {resolvedTheme === "dark" ? <Moon aria-hidden size={22} /> : <Sun aria-hidden size={22} />}
          </button>
          <button
            type="button"
            onClick={() => setEmergencyOpen(true)}
            aria-label={t("a11y.emergency")}
            className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-danger px-3 text-sm font-bold text-white transition-opacity active:opacity-80"
          >
            <Siren aria-hidden size={20} />
            {t("safety.emergencyTitle")}
          </button>
          <ProfileMenu />
        </div>

        <div className="scrollbar-none -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-2">
          <div
            role="group"
            aria-label={t("header.swapClocks")}
            className="flex shrink-0 items-center gap-1 rounded-xl bg-surface-raised p-1"
          >
            <button
              type="button"
              onClick={() => swap(primary === "HU" ? "IL" : "HU")}
              aria-label={t("header.swapClocks")}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
            >
              <span aria-hidden className="text-base leading-none">{first.flag}</span>
              <span className="text-xs font-bold text-text-primary">{first.label}</span>
              <span dir="ltr" className="tnum text-sm font-extrabold text-text-primary">
                {first.time}
              </span>
            </button>
            <span aria-hidden className={clsx("h-5 w-px bg-border")} />
            <button
              type="button"
              onClick={() => swap(primary === "HU" ? "IL" : "HU")}
              aria-label={t("header.swapClocks")}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 opacity-75"
            >
              <span aria-hidden className="text-sm leading-none">{second.flag}</span>
              <span className="text-[11px] font-medium text-text-muted">{second.label}</span>
              <span dir="ltr" className="tnum text-xs font-semibold text-text-secondary">
                {second.time}
              </span>
            </button>
          </div>

          {weather && weather.tempMin !== null && weather.tempMax !== null && (
            <span
              title={t("header.weatherTitle")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-raised px-2.5 py-2 text-xs text-text-secondary"
            >
              <span aria-hidden>🌤</span>
              <span dir="ltr" className="tnum font-bold">
                {weather.tempMin}°–{weather.tempMax}°
              </span>
              {weather.precipProb !== null && <span>☔ {weather.precipProb}%</span>}
            </span>
          )}
        </div>
      </header>

      <EmergencySheet
        open={emergencyOpen}
        onClose={() => setEmergencyOpen(false)}
        accommodation={accommodation}
      />
    </>
  );
}
