"use client";

import { useEffect, useState } from "react";
import { CloudSun, MapPin, Moon, Palette, Siren, Sun, Umbrella } from "lucide-react";
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
  // Keep the server HTML and the browser's first render identical. The live
  // value starts after hydration; otherwise a one-second boundary causes React
  // to discard and rebuild the entire application shell.
  const [now, setNow] = useState<Date | null>(null);
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
    setNow(new Date());
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

  const hu = now ? formatFullTime(TZ_BUDAPEST, now) : "--:--:--";
  const il = now ? formatFullTime(TZ_JERUSALEM, now) : "--:--:--";
  const clockCards = [
    { id: "HU" as const, flag: "🇭🇺", label: t("header.budapest"), time: hu },
    { id: "IL" as const, flag: "🇮🇱", label: t("header.israel"), time: il },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/88 px-3 pb-2 pt-safe shadow-[0_12px_35px_-30px_rgb(15_23_42/.7)] backdrop-blur-2xl">
        <div className="flex min-h-[4.25rem] items-center gap-1.5 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-night text-lg text-white shadow-md">B</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[15px] font-extrabold tracking-tight text-text-primary">{t("meta.shortTitle")} 2026</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-extrabold tracking-widest text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />{t("header.live")}</span>
              </div>
              <p className="truncate text-[11px] font-medium text-text-muted">{now ? formatFullDate(now) : "\u00a0"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={cycleTheme}
            aria-label={t("a11y.themeToggle")}
            title={t("theme.title")}
            className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-raised text-text-secondary shadow-sm transition-transform active:scale-95"
          >
            <Palette aria-hidden size={20} />
            <span aria-hidden className="absolute bottom-1 end-1 grid h-4 w-4 place-items-center rounded-full bg-brand text-brand-contrast">{resolvedTheme === "dark" ? <Moon size={10} /> : <Sun size={10} />}</span>
          </button>
          <button
            type="button"
            onClick={() => setEmergencyOpen(true)}
            aria-label={t("a11y.emergency")}
            className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-danger px-2.5 text-xs font-extrabold text-white shadow-[0_8px_20px_-10px_var(--c-danger)] transition-transform active:scale-95"
          >
            <Siren aria-hidden size={20} />
            {t("safety.emergencyTitle")}
          </button>
          <ProfileMenu />
        </div>

        <div className="grid grid-cols-[1fr_1fr_1.05fr] gap-1.5" role="group" aria-label={t("header.swapClocks")}>
          {clockCards.map((clock) => (
            <button key={clock.id} type="button" onClick={() => swap(clock.id)} aria-pressed={primary === clock.id} aria-label={`${t("header.swapClocks")}: ${clock.label}`} className={`min-w-0 rounded-2xl border px-2 py-2 text-start transition-all active:scale-[.98] ${primary === clock.id ? "border-brand/40 bg-brand-soft shadow-sm" : "border-transparent bg-surface-raised/85"}`}>
              <span className="flex items-center gap-1 text-[10px] font-bold text-text-muted"><span aria-hidden>{clock.flag}</span><span className="truncate">{clock.label}</span></span>
              <span dir="ltr" className="tnum mt-0.5 block text-[13px] font-extrabold tracking-tight text-text-primary">{clock.time}</span>
            </button>
          ))}
          <div title={t("header.weatherTitle")} className="min-w-0 rounded-2xl bg-night px-2 py-2 text-white shadow-sm">
            <span className="flex items-center gap-1 text-[10px] font-bold text-white/65"><MapPin aria-hidden size={11} />{t("header.budapest")}</span>
            {weather && weather.tempMin !== null && weather.tempMax !== null ? <span className="mt-0.5 flex items-center gap-1.5"><CloudSun aria-hidden size={15} className="text-[#f4ba53]" /><span dir="ltr" className="tnum text-[12px] font-extrabold">{weather.tempMin}°–{weather.tempMax}°</span>{weather.precipProb !== null && <span className="flex items-center gap-0.5 text-[10px] text-white/70"><Umbrella aria-hidden size={10} />{weather.precipProb}%</span>}</span> : <span className="mt-0.5 block truncate text-[10px] text-white/60">{t("header.weatherUnavailable")}</span>}
          </div>
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
