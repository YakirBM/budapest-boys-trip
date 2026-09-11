"use client";

import { useState } from "react";
import clsx from "clsx";
import { t } from "@/lib/i18n";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { MapPin, MapPinKind } from "./PinsLayer";
import { isMapPinWithinBounds } from "./PinsLayer";

export interface PinSheetProps {
  open: boolean;
  onClose: () => void;
  initial?: MapPin | null;
  draftCoords: { lat: number; lng: number } | null;
  onSave: (input: { label: string; note: string | null; kind: MapPinKind }) => Promise<void>;
  saving?: boolean;
}

const KINDS: MapPinKind[] = ["custom", "meeting", "food", "warning"];

function kindLabel(kind: MapPinKind): string {
  switch (kind) {
    case "custom":
      return t("map.pins.kindCustom");
    case "meeting":
      return t("map.pins.kindMeeting");
    case "food":
      return t("map.pins.kindFood");
    case "warning":
      return t("map.pins.kindWarning");
  }
}

/**
 * PinSheet — long-press add / edit (docs/14 §3.3.3). Label* + note + kind.
 * Bounds validated before save (47.2–47.7 / 18.8–19.4).
 */
export function PinSheet({ open, onClose, initial, draftCoords, onSave, saving = false }: PinSheetProps) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [kind, setKind] = useState<MapPinKind>(initial?.kind ?? "custom");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const coords = initial ? { lat: initial.lat, lng: initial.lng } : draftCoords;
  const outOfBounds = coords !== null && !isMapPinWithinBounds(coords.lat, coords.lng);

  async function handleSave(): Promise<void> {
    setError(null);
    if (!label.trim()) {
      setError(t("map.pins.labelRequired"));
      return;
    }
    if (!coords || outOfBounds) {
      setError(t("map.pins.outOfBounds"));
      return;
    }
    if (note.trim().length > 280) {
      setError(t("today.comments.tooLong"));
      return;
    }
    await onSave({ label: label.trim(), note: note.trim() || null, kind });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? t("map.pins.editTitle") : t("map.pins.title")}>
      <div className="flex flex-col gap-3 pb-2">
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        {coords && (
          <p className="text-xs text-text-muted">
            <span dir="ltr" className="ltr-iso tnum">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
          </p>
        )}
        <div>
          <label className="mb-1 block text-sm font-semibold text-text-primary" htmlFor="pin-label">
            {t("map.pins.fieldLabel")}
          </label>
          <input
            id="pin-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-brand focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-text-primary" htmlFor="pin-note">
            {t("map.pins.fieldNote")}
          </label>
          <textarea
            id="pin-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            rows={2}
            className="min-h-12 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-brand focus:outline-none"
          />
        </div>
        <div>
          <span className="mb-1 block text-sm font-semibold text-text-primary">{t("map.pins.fieldKind")}</span>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
                className={clsx(
                  "inline-flex min-h-12 items-center justify-center rounded-xl border px-3 text-sm font-bold",
                  kind === option
                    ? "border-transparent bg-brand text-brand-contrast"
                    : "border-border bg-surface text-text-secondary",
                )}
              >
                {kindLabel(option)}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-text-muted">{t("map.pins.sharedHint")}</p>
        <Button block loading={saving} onClick={() => void handleSave()}>
          {t("map.pins.save")}
        </Button>
      </div>
    </BottomSheet>
  );
}
