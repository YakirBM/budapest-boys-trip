"use client";

import { useState } from "react";
import { Copy, Crosshair, MessageSquareWarning, Phone, Share2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { pushToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { enqueue } from "@/lib/offline/db";
import { sendEmergencyAlert } from "@/lib/actions/safety";
import { telLink } from "@/lib/utils/deeplinks";

function PhraseLine({ langLabel, line, machineDraft }: { langLabel: string; line: string; machineDraft?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      pushToast({ message: t("errors.generic"), type: "danger" });
    }
  };
  return (
    <div className="flex items-start justify-between gap-2 rounded-xl border border-border p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] font-bold text-text-muted">{langLabel}</span>
        <span className="text-sm leading-6 text-text-primary">{line}</span>
        {machineDraft && (
          <span className="text-[11px] font-medium text-warning">({t("safety.phraseMachineDraft")})</span>
        )}
      </div>
      <button
        type="button"
        aria-label={t("common.copy")}
        onClick={() => void copy()}
        className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border ${
          copied ? "text-success" : "text-text-secondary"
        }`}
      >
        <Copy aria-hidden size={16} />
      </button>
    </div>
  );
}

export interface EmergencyNowCardProps {
  bookedAddress: { name: string; address: string } | null;
  emergencyPhone: string;
  tripId: string;
  viewerId: string;
}

/**
 * Card 1 — Emergency now (doc 08). 112 one-tap (56px, red), address + copy
 * (TBD until booked), one-shot geolocation DISPLAY ONLY, phrase block, and a
 * text-only emergency alert to the group (works offline via the outbox).
 */
export function EmergencyNowCard({ bookedAddress, emergencyPhone, tripId, viewerId }: EmergencyNowCardProps) {
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [coordsError, setCoordsError] = useState(false);
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [alertText, setAlertText] = useState("");
  const [alertBusy, setAlertBusy] = useState(false);

  const locate = () => {
    setCoordsError(false);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCoordsError(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Display only — never stored, never transmitted by the app (doc 08 hard rule).
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocating(false);
      },
      () => {
        setCoordsError(true);
        setLocating(false);
      },
      { maximumAge: 0, timeout: 8000 },
    );
  };

  const copyCoords = async () => {
    if (!coords) return;
    try {
      await navigator.clipboard.writeText(`${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`);
      pushToast({ message: t("common.copied"), type: "success" });
    } catch {
      pushToast({ message: t("errors.generic"), type: "danger" });
    }
  };

  const shareAlert = async () => {
    setAlertBusy(true);
    try {
      const text = alertText.trim();
      if (typeof navigator !== "undefined" && navigator.onLine) {
        const result = await sendEmergencyAlert({ text: text || undefined });
        if (result.ok) {
          pushToast({ message: t("safety.alertSent"), type: "success" });
          setAlertText("");
          return;
        }
        if (result.error !== "network") {
          pushToast({ message: t("errors.generic"), type: "danger" });
          return;
        }
      }
      await enqueue("app_events", "insert", {
        trip_id: tripId,
        actor_id: viewerId,
        action: "emergency_alert",
        entity: "safety",
        entity_id: null,
        meta: { text: text || null, queued_offline: true },
      });
      pushToast({ message: t("common.pendingSyncOne"), type: "info" });
      setAlertText("");
    } finally {
      setAlertBusy(false);
    }
  };

  return (
    <Card className="border-danger/40">
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-danger">{t("safety.emergencyTitle")}</h2>

        <a
          href={telLink(emergencyPhone)}
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-danger px-4 text-lg font-bold text-white"
        >
          <Phone aria-hidden size={22} />
          {t("safety.call112")}
        </a>
        <p className="text-xs leading-5 text-text-muted">{t("safety.call112Hint")}</p>
        <p className="text-xs leading-5 text-text-muted">{t("safety.simHint")}</p>

        {/* Accommodation address (offline-critical) */}
        <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
          <span className="text-xs font-bold text-text-muted">{t("safety.addressLabel")}</span>
          {bookedAddress ? (
            <>
              <span className="text-sm font-semibold leading-6 text-text-primary" dir="ltr">
                {bookedAddress.address}
              </span>
              <Button
                variant="secondary"
                icon={<Copy aria-hidden size={14} />}
                className="self-start px-3 text-xs"
                onClick={() => void navigator.clipboard.writeText(bookedAddress.address).then(
                  () => pushToast({ message: t("common.copied"), type: "success" }),
                  () => pushToast({ message: t("errors.generic"), type: "danger" }),
                )}
              >
                {t("safety.copyAddress")}
              </Button>
            </>
          ) : (
            <span className="text-sm leading-6 text-warning">{t("safety.addressTbd")}</span>
          )}
        </div>

        {/* One-shot geolocation — display only */}
        <div className="flex flex-col gap-1.5">
          <Button
            variant="secondary"
            icon={<Crosshair aria-hidden size={16} />}
            onClick={locate}
            loading={locating}
            className="self-start"
          >
            {locating ? t("safety.locating") : t("safety.showCoords")}
          </Button>
          {coords && (
            <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
              <span dir="ltr" className="ltr-iso tnum text-base font-bold text-text-primary">
                {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </span>
              <span className="text-xs text-text-muted">
                {t("safety.accuracy", { meters: Math.round(coords.accuracy) })}
              </span>
              <span className="text-[11px] leading-4 text-warning">{t("safety.coordsWarning")}</span>
              <Button
                variant="secondary"
                icon={<Copy aria-hidden size={14} />}
                className="self-start px-3 text-xs"
                onClick={() => void copyCoords()}
              >
                {t("common.copy")}
              </Button>
            </div>
          )}
          {coordsError && <p className="text-xs leading-5 text-warning">{t("safety.coordsError")}</p>}
        </div>

        {/* Text-only group alert */}
        <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
          <span className="flex items-center gap-1.5 text-xs font-bold text-text-muted">
            <Share2 aria-hidden size={12} />
            {t("safety.shareGroup")}
          </span>
          <input
            value={alertText}
            onChange={(event) => setAlertText(event.target.value)}
            placeholder={t("safety.alertOptionalText")}
            className="min-h-12 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary"
          />
          <Button
            variant="danger"
            icon={<MessageSquareWarning aria-hidden size={16} />}
            loading={alertBusy}
            onClick={() => void shareAlert()}
            className="self-start"
          >
            {t("safety.shareGroup")}
          </Button>
          <p className="text-[11px] leading-4 text-text-muted">{t("safety.shareGroupHint")}</p>
        </div>

        <Button variant="secondary" onClick={() => setPhrasesOpen(true)}>
          {t("safety.phraseTitle")}
        </Button>

        <BottomSheet open={phrasesOpen} onClose={() => setPhrasesOpen(false)} title={t("safety.phraseTitle")}>
          <div className="flex flex-col gap-2 pb-2">
            <PhraseLine langLabel={t("safety.phraseEn")} line={t("safety.phraseEn1")} />
            <PhraseLine langLabel={t("safety.phraseEn")} line={t("safety.phraseEn2")} />
            <PhraseLine langLabel={t("safety.phraseHe")} line={t("safety.phraseHe1")} />
            <PhraseLine langLabel={t("safety.phraseHe")} line={t("safety.phraseHe2")} />
            <PhraseLine langLabel={t("safety.phraseHu")} line={t("safety.phraseHu1")} machineDraft />
            <PhraseLine langLabel={t("safety.phraseHu")} line={t("safety.phraseHu2")} machineDraft />
          </div>
        </BottomSheet>
      </div>
    </Card>
  );
}
