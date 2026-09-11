"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, KeyRound, MessageCircle, Navigation, Phone, Wifi } from "lucide-react";
import { t } from "@/lib/i18n";
import { pushToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TimeBlock } from "@/components/ui/TimeBlock";
import { revealStaySecret } from "@/lib/actions/stay";
import { appleMapsDir, googleMapsDir, telLink, whatsappShare } from "@/lib/utils/deeplinks";
import { TZ_BUDAPEST } from "@/lib/utils/time";
import type { Accommodation, StayChecklist } from "@/lib/data/stay";

function ChecklistCard({ title, checklist }: { title: string; checklist: StayChecklist | null }) {
  if (!checklist || checklist.items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
      <h3 className="text-sm font-bold text-text-secondary">{title}</h3>
      <ul className="flex flex-col gap-1">
        {checklist.items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-sm leading-6 text-text-secondary">
            <span
              aria-hidden
              className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                item.status === "done" ? "border-success bg-success/15 text-success" : "border-border"
              }`}
            >
              {item.status === "done" ? "✓" : ""}
            </span>
            {item.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BookedCardProps {
  booked: Accommodation;
  arrivalChecklist: StayChecklist | null;
  departureChecklist: StayChecklist | null;
}

/**
 * Mode B — the booked apartment as home base (doc 03-feature §Once booked).
 * Door code / Wi-Fi password are masked-until-tap; every reveal is logged.
 */
export function BookedCard({ booked, arrivalChecklist, departureChecklist }: BookedCardProps) {
  const router = useRouter();
  const [doorRevealed, setDoorRevealed] = useState<string | null>(null);
  const [wifiRevealed, setWifiRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      pushToast({ message, type: "success" });
    } catch {
      pushToast({ message: t("errors.generic"), type: "danger" });
    }
  };

  const reveal = async (field: "door_code" | "wifi_password") => {
    setBusy(true);
    try {
      const result = await revealStaySecret({ accommodationId: booked.id, field });
      if (result.ok) {
        if (field === "door_code") setDoorRevealed(result.value);
        else setWifiRevealed(result.value);
        pushToast({ message: t("stay.revealLogged"), type: "info" });
        router.refresh();
      } else {
        pushToast({ message: t("errors.forbidden"), type: "danger" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-text-primary">{t("stay.modeBTitle")}</h2>
      {booked.platform && (
        <p className="text-xs text-text-muted" dir="ltr">
          {booked.platform}
        </p>
      )}

      {booked.address && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
          <span className="text-xs text-text-muted">{t("stay.address")}</span>
          <span className="text-sm font-semibold leading-6 text-text-primary" dir="ltr">
            {booked.address}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="secondary"
              icon={<Copy aria-hidden size={14} />}
              className="px-3 text-xs"
              onClick={() => void copy(booked.address ?? "", t("common.copied"))}
            >
              {t("common.copy")}
            </Button>
            <a
              href={googleMapsDir(booked.address, "transit")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-brand px-3 text-xs font-semibold text-brand-contrast"
            >
              <Navigation aria-hidden size={14} />
              {t("stay.navigateAddress")}
            </a>
            <a
              href={appleMapsDir(booked.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center rounded-xl border border-border px-3 text-xs font-semibold text-brand"
            >
              Apple Maps
            </a>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {booked.checkInAt && (
          <span className="flex items-center gap-2 text-sm text-text-secondary">
            {t("stay.checkin")}
            <TimeBlock dateTime={booked.checkInAt} timeZone={TZ_BUDAPEST} />
          </span>
        )}
        {booked.checkOutAt && (
          <span className="flex items-center gap-2 text-sm text-text-secondary">
            {t("stay.checkout")}
            <TimeBlock dateTime={booked.checkOutAt} timeZone={TZ_BUDAPEST} />
          </span>
        )}
      </div>

      {/* Access — masked until tap, reveal logged */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
        <h3 className="text-sm font-bold text-text-secondary">{t("stay.accessTitle")}</h3>
        <div className="flex min-h-12 items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm text-text-secondary">
            <KeyRound aria-hidden size={14} />
            {t("stay.doorCode")}
          </span>
          {doorRevealed ? (
            <button
              type="button"
              dir="ltr"
              onClick={() => void copy(doorRevealed, t("common.copied"))}
              className="ltr-iso tnum min-h-12 rounded-xl bg-brand-soft px-3 font-bold text-brand-strong"
            >
              {doorRevealed}
            </button>
          ) : (
            <Button
              variant="secondary"
              icon={<Eye aria-hidden size={14} />}
              disabled={busy}
              className="px-3 text-xs"
              onClick={() => void reveal("door_code")}
            >
              {t("stay.show")}
            </Button>
          )}
        </div>
        {booked.floorLabel && (
          <p className="text-xs text-text-secondary">
            {t("stay.floorLabel")}: {booked.floorLabel}
          </p>
        )}
        {booked.apartmentLabel && (
          <p className="text-xs text-text-secondary">
            {t("stay.apartmentLabel")}: {booked.apartmentLabel}
          </p>
        )}
        {booked.intercom && (
          <p className="text-xs text-text-secondary">
            {t("stay.intercomLabel")}: {booked.intercom}
          </p>
        )}
        {booked.accessInstructions && (
          <p className="text-xs leading-5 text-text-secondary">{booked.accessInstructions}</p>
        )}
        {booked.lateCheckinNotes && (
          <p className="text-xs leading-5 text-warning">{booked.lateCheckinNotes}</p>
        )}
      </div>

      {booked.wifiSsid && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-text-secondary">
            <Wifi aria-hidden size={14} />
            {t("stay.wifi")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="secondary"
              icon={<Copy aria-hidden size={14} />}
              className="px-3 text-xs"
              onClick={() => void copy(booked.wifiSsid ?? "", t("common.copied"))}
            >
              {booked.wifiSsid}
            </Button>
            {wifiRevealed ? (
              <Button
                variant="secondary"
                icon={<Copy aria-hidden size={14} />}
                className="px-3 text-xs"
                onClick={() => void copy(wifiRevealed, t("common.copied"))}
              >
                {t("stay.wifiPassword")}: {wifiRevealed}
              </Button>
            ) : (
              <Button
                variant="ghost"
                icon={<Eye aria-hidden size={14} />}
                disabled={busy}
                className="px-3 text-xs"
                onClick={() => void reveal("wifi_password")}
              >
                {t("stay.show")} · {t("stay.wifiPassword")}
              </Button>
            )}
          </div>
        </div>
      )}

      {booked.hostName && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
          <h3 className="text-sm font-bold text-text-secondary">{t("stay.host")}</h3>
          <span className="text-sm font-semibold text-text-primary">{booked.hostName}</span>
          <div className="flex flex-wrap gap-1.5">
            {booked.hostPhone && (
              <>
                <a
                  href={telLink(booked.hostPhone)}
                  className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-brand px-3 text-xs font-semibold text-brand-contrast"
                >
                  <Phone aria-hidden size={14} />
                  {t("stay.callHost")}
                </a>
                <a
                  href={whatsappShare(
                    `${booked.hostName ?? ""} ${booked.address ?? ""}`.trim(),
                    booked.hostPhone.replace(/\D/g, ""),
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-brand"
                >
                  <MessageCircle aria-hidden size={14} />
                  {t("stay.whatsappHost")}
                </a>
              </>
            )}
          </div>
        </div>
      )}

      <ChecklistCard title={t("stay.arrivalChecklistTitle")} checklist={arrivalChecklist} />
      <ChecklistCard title={t("stay.departureChecklistTitle")} checklist={departureChecklist} />

      <p className="text-xs leading-5 text-success">{t("stay.offlineCritical")}</p>
    </Card>
  );
}
