"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * AddressAutocomplete — free-text address with server-assisted completion
 * (docs/14 §6.2). Suggestions come from POST /api/geocode (server-only
 * Nominatim proxy, cached + rate-limited). Selecting a suggestion stores
 * coordinates; plain text stays address-only. Nothing is persisted here —
 * the parent saves only after explicit user confirmation.
 */

export interface GeocodeSuggestion {
  label: string;
  lat: number | null;
  lng: number | null;
}

interface GeocodeResponse {
  ok: boolean;
  results?: GeocodeSuggestion[];
  error?: string;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

export function AddressAutocomplete({
  value,
  onValueChange,
  onSelect,
}: {
  value: string;
  onValueChange: (next: string) => void;
  onSelect: (selection: { address: string; lat: number | null; lng: number | null }) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function queryAddress(query: string): void {
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    const clean = query.trim();
    if (clean.length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      void fetch(`/api/geocode?q=${encodeURIComponent(clean)}`, {
        method: "POST",
        signal: controller.signal,
      })
        .then(async (res) => {
          const body = (await res.json()) as GeocodeResponse;
          if (!body.ok) {
            setError(body.error === "rate_limited" ? t("media.geocodeRateLimited") : t("media.geocodeFailed"));
            setSuggestions([]);
            setOpen(true);
            return;
          }
          setSuggestions(body.results ?? []);
          setActiveIndex(-1);
          setOpen(true);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(t("media.geocodeFailed"));
          setSuggestions([]);
          setOpen(true);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
  }

  function choose(suggestion: GeocodeSuggestion): void {
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    onSelect({ address: suggestion.label, lat: suggestion.lat, lng: suggestion.lng });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <MapPin
          aria-hidden
          size={18}
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          value={value}
          placeholder={t("media.addressPlaceholder")}
          aria-label={t("media.addressField")}
          onChange={(event) => {
            onValueChange(event.target.value);
            queryAddress(event.target.value);
          }}
          onBlur={() => {
            // Delayed so a tap on a suggestion still registers.
            window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && suggestions.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((i) => (i + 1) % suggestions.length);
            } else if (event.key === "ArrowUp" && suggestions.length > 0) {
              event.preventDefault();
              setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (event.key === "Enter" && open && activeIndex >= 0) {
              const picked = suggestions[activeIndex];
              if (picked) {
                event.preventDefault();
                choose(picked);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className="min-h-12 w-full rounded-xl border border-border bg-surface pe-3 ps-10 text-sm text-text-primary outline-none focus:border-brand"
        />
        {loading && (
          <span role="status" aria-label={t("media.addressSearching")} className="absolute end-3 top-1/2 -translate-y-1/2 text-text-muted">
            <Loader2 aria-hidden size={18} className="animate-spin" />
          </span>
        )}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("media.addressField")}
          className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-xl border border-border bg-surface-raised p-1.5"
        >
          {error !== null ? (
            <li role="option" aria-selected="false" className="px-3 py-2 text-xs text-danger">
              {error}
            </li>
          ) : suggestions.length === 0 && !loading ? (
            <li role="option" aria-selected="false" className="px-3 py-2 text-xs text-text-muted">
              {t("media.addressNoResults")}
            </li>
          ) : (
            suggestions.map((suggestion, index) => (
              <li key={`${suggestion.label}-${index}`} role="presentation">
                <button
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(suggestion)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={
                    index === activeIndex
                      ? "inline-flex min-h-12 w-full items-center gap-2 rounded-lg bg-brand-soft px-3 text-start text-sm text-text-primary"
                      : "inline-flex min-h-12 w-full items-center gap-2 rounded-lg px-3 text-start text-sm text-text-primary active:bg-surface"
                  }
                >
                  <MapPin aria-hidden size={16} className="shrink-0 text-text-muted" />
                  <span dir="auto" className="min-w-0 flex-1 truncate">
                    {suggestion.label}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      <p className="text-xs text-text-muted">{t("media.addressHint")}</p>
    </div>
  );
}
