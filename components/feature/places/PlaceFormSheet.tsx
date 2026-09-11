"use client";

import { useState } from "react";
import clsx from "clsx";
import { Link2 } from "lucide-react";
import { t } from "@/lib/i18n";
import type { LibraryPlace } from "@/lib/data/route";
import type { Category } from "@/components/ui/types";
import type { Currency } from "@/lib/utils/money";
import { CURRENCIES } from "@/lib/utils/money";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { CategoryIcon } from "@/components/ui/CategoryIcon";

export interface PlaceFormPayload {
  name: string;
  type: string;
  mapsUrl: string;
  district: string;
  address: string;
  lat: string;
  lng: string;
  tags: string[];
  price: string;
  currency: Currency;
  priceSource: string;
  hoursNote: string;
  needsReservation: boolean;
  note: string;
  cover: string;
  source: string;
}

export interface PlaceFormSheetProps {
  open: boolean;
  onClose: () => void;
  initial?: LibraryPlace | null;
  onSave: (payload: PlaceFormPayload) => Promise<void>;
  saving?: boolean;
}

const PLACE_TYPES = [
  "restaurant",
  "bar",
  "cafe",
  "attraction",
  "viewpoint",
  "bath",
  "shopping",
  "airport",
  "transit_hub",
  "bus_stop",
  "emergency",
  "meeting_point",
  "other",
] as const;

const CATEGORIES: Category[] = ["food", "attraction", "walk", "transit", "rest", "nightlife", "other"];

/**
 * PlaceFormSheet — add/edit place (docs/14 §3.4.2). Fetch-from-link fills
 * every field it can; the user confirms before save (no silent facts).
 */
export function PlaceFormSheet({ open, onClose, initial, onSave, saving = false }: PlaceFormSheetProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<string>("other");
  const [mapsUrl, setMapsUrl] = useState(initial?.googleMapsUrl ?? "");
  const [district, setDistrict] = useState(initial?.district ?? "");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState(initial?.lat !== null && initial?.lat !== undefined ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial?.lng !== null && initial?.lng !== undefined ? String(initial.lng) : "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [price, setPrice] = useState(initial?.estPrice !== null && initial?.estPrice !== undefined ? String(initial.estPrice) : "");
  const [currency, setCurrency] = useState<Currency>(initial?.priceCurrency ?? "HUF");
  const [priceSource, setPriceSource] = useState(initial?.source ?? "");
  const [hoursNote, setHoursNote] = useState("");
  const [needsReservation, setNeedsReservation] = useState(initial?.needsReservation ?? false);
  const [note, setNote] = useState(initial?.note ?? "");
  const [cover, setCover] = useState("");
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "failed">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  const inputClass =
    "min-h-12 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none";
  const labelClass = "mb-1 block text-sm font-semibold text-text-primary";

  function toggleTag(tag: string): void {
    setTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  }

  async function handleFetch(): Promise<void> {
    if (!mapsUrl.trim()) return;
    setFetchState("loading");
    setFormError(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: mapsUrl.trim() }),
      });
      if (!res.ok) throw new Error("scrape failed");
      const data = (await res.json()) as {
        title?: string;
        description?: string;
        imageUrl?: string | null;
        address?: string | null;
        lat?: number | null;
        lng?: number | null;
        openingHours?: string | null;
        phone?: string | null;
        source?: string;
      };
      if (data.title && !name.trim()) setName(data.title.slice(0, 120));
      if (data.address && !address.trim()) setAddress(data.address);
      if (data.lat !== null && data.lat !== undefined) setLat(String(data.lat));
      if (data.lng !== null && data.lng !== undefined) setLng(String(data.lng));
      if (data.imageUrl) setCover(data.imageUrl);
      if (data.openingHours) setHoursNote(data.openingHours);
      if (data.description && !note.trim()) setNote(data.description.slice(0, 200));
      if (data.source) setPriceSource(data.source);
      setFetchState("idle");
    } catch {
      setFetchState("failed");
      setFormError(t("route.form.fetchFailed"));
    }
  }

  async function handleSave(): Promise<void> {
    if (!name.trim()) {
      setFormError(t("route.errors.titleRequired"));
      return;
    }
    if (!address.trim()) {
      setFormError(t("route.errors.addressRequired"));
      return;
    }
    await onSave({
      name: name.trim(),
      type,
      mapsUrl: mapsUrl.trim(),
      district: district.trim(),
      address: address.trim(),
      lat: lat.trim(),
      lng: lng.trim(),
      tags,
      price: price.trim(),
      currency,
      priceSource: priceSource.trim(),
      hoursNote: hoursNote.trim(),
      needsReservation,
      note: note.trim(),
      cover: cover.trim(),
      source: priceSource.trim(),
    });
  }

  if (!open) return null;

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? t("route.form.titleEdit") : t("route.form.titleNew")}>
      <div className="flex flex-col gap-4 pb-2">
        {formError && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
            {formError}
          </p>
        )}

        <div>
          <label className={labelClass} htmlFor="place-name">{t("route.form.fieldName")}</label>
          <input id="place-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="place-type">{t("route.form.fieldType")}</label>
          <select id="place-type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            {PLACE_TYPES.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATEGORIES.map((category) => (
              <span key={category} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1 text-[11px] text-text-muted">
                <CategoryIcon category={category} size={16} />
                {t(`categories.${category}`)}
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="place-url">{t("route.form.fieldMapsUrl")}</label>
          <input
            id="place-url"
            type="url"
            dir="ltr"
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
            className={`${inputClass} ltr-iso tnum`}
          />
          <Button variant="secondary" block onClick={() => void handleFetch()} loading={fetchState === "loading"} className="mt-2" icon={<Link2 aria-hidden size={16} />}>
            {t("route.form.fetchFromLink")}
          </Button>
          <p className="mt-1 text-xs text-text-muted">{t("route.form.confirmHint")}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelClass}>{t("route.form.fieldDistrict")}</span>
            <input type="text" value={district} onChange={(e) => setDistrict(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>{t("route.form.fieldAddress")}</span>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelClass}>{t("route.form.fieldLat")}</span>
            <input type="text" dir="ltr" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} className={`${inputClass} ltr-iso tnum`} />
          </label>
          <label className="block">
            <span className={labelClass}>{t("route.form.fieldLng")}</span>
            <input type="text" dir="ltr" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} className={`${inputClass} ltr-iso tnum`} />
          </label>
        </div>

        <div>
          <span className={labelClass}>{t("route.form.fieldTags")}</span>
          <div className="flex flex-wrap gap-2">
            {["kosher", "outdoor", "rain-backup", "verify-hours"].map((tag) => {
              const active = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTag(tag)}
                  className={clsx(
                    "inline-flex min-h-12 items-center rounded-xl border px-3 text-xs font-bold",
                    active ? "border-transparent bg-brand text-brand-contrast" : "border-border bg-surface text-text-secondary",
                  )}
                >
                  {tag === "kosher" ? t("route.form.tagKosher") : tag}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className={labelClass}>{t("route.form.fieldPrice")}</span>
          <div className="flex items-end gap-2">
            <AmountInput value={price} currency={currency} onChange={setPrice} className="flex-1" />
            <label className="flex shrink-0 flex-col gap-1 text-xs text-text-muted">
              {t("route.form.fieldCurrency")}
              <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="h-12 rounded-xl border border-border bg-surface px-2 text-sm text-text-primary">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-2 block">
            <span className={labelClass}>{t("route.form.fieldPriceSource")}</span>
            <input type="text" value={priceSource} onChange={(e) => setPriceSource(e.target.value)} className={inputClass} />
          </label>
        </div>

        <div>
          <label className={labelClass} htmlFor="place-hours">{t("route.form.fieldHours")}</label>
          <textarea id="place-hours" value={hoursNote} onChange={(e) => setHoursNote(e.target.value)} rows={2} className={`${inputClass} min-h-20 resize-y`} />
        </div>

        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3">
          <span className="text-sm font-semibold text-text-primary">{t("route.form.fieldReservation")}</span>
          <input
            type="checkbox"
            checked={needsReservation}
            onChange={(e) => setNeedsReservation(e.target.checked)}
            className="h-6 w-6 accent-[var(--color-brand)]"
          />
        </label>

        <div>
          <label className={labelClass} htmlFor="place-note">{t("route.form.fieldNote")}</label>
          <textarea id="place-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputClass} min-h-20 resize-y`} />
        </div>

        <div>
          <label className={labelClass} htmlFor="place-cover">{t("route.form.fieldCover")}</label>
          <input
            id="place-cover"
            type="url"
            dir="ltr"
            value={cover}
            onChange={(e) => setCover(e.target.value)}
            className={`${inputClass} ltr-iso tnum`}
          />
        </div>

        <Button block loading={saving} onClick={() => void handleSave()}>
          {t("route.form.save")}
        </Button>
      </div>
    </BottomSheet>
  );
}
