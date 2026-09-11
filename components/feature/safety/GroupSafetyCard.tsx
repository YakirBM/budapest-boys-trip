"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, MapPin, MessageCircle, Send, Users } from "lucide-react";
import { t } from "@/lib/i18n";
import { pushToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { createSoloNotice, resolveSoloNotice } from "@/lib/actions/safety";
import { googleMapsDir, whatsappShare } from "@/lib/utils/deeplinks";
import { TZ_BUDAPEST, formatInTz, todayInTz } from "@/lib/utils/time";
import type { SoloNotice } from "@/lib/data/safety";

export interface GroupSafetyCardProps {
  soloNotices: SoloNotice[];
  nightMeeting: {
    nameHe: string;
    lat: number | null;
    lng: number | null;
    placeUrl: string | null;
    isTbd: boolean;
  } | null;
  viewerName: string;
  memberPhones: { id: string; phone: string | null }[];
}

/**
 * Card 4 — Group safety: solo notices (insert + "חזרתי"), lost-button to the
 * night meeting point, taxi/night rules, and a deep-link-only location share
 * (nothing about location is ever stored — doc 08 hard rule).
 */
export function GroupSafetyCard({
  soloNotices,
  nightMeeting,
  viewerName,
  memberPhones,
}: GroupSafetyCardProps) {
  const router = useRouter();
  const [destination, setDestination] = useState("");
  const [returnTime, setReturnTime] = useState("23:30");
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const sendNotice = async () => {
    setBusy(true);
    try {
      const result = await createSoloNotice({
        destination,
        dateIso: todayInTz(TZ_BUDAPEST),
        timeHHmm: returnTime,
      });
      if (result.ok) {
        setDestination("");
        pushToast({ message: t("safety.soloSent"), type: "success" });
        router.refresh();
      } else {
        pushToast({ message: t("errors.saveFailed"), type: "danger" });
      }
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (id: string) => {
    const result = await resolveSoloNotice({ id });
    if (result.ok) router.refresh();
    else pushToast({ message: t("errors.saveFailed"), type: "danger" });
  };

  const meetingHref =
    nightMeeting && !nightMeeting.isTbd
      ? (nightMeeting.placeUrl ??
        (nightMeeting.lat !== null && nightMeeting.lng !== null
          ? googleMapsDir(`${nightMeeting.lat},${nightMeeting.lng}`, "walking")
          : null))
      : null;

  const prefill = t("safety.sharePrefill", { name: viewerName });
  const firstMemberPhone = memberPhones.find((m) => m.phone)?.phone?.replace(/\D/g, "");

  const nightRules: Parameters<typeof t>[0][] = [
    "safety.nightRule1",
    "safety.nightRule2",
    "safety.nightRule3",
    "safety.nightRule4",
  ];
  const taxiRules: Parameters<typeof t>[0][] = [
    "transit.taxiAppOnly",
    "transit.taxiUpfront",
    "transit.taxiUnmarked",
  ];

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <Users aria-hidden size={18} />
        {t("safety.groupTitle")}
      </h2>

      {/* Solo notice */}
      <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-text-secondary">
          <Compass aria-hidden size={14} />
          {t("safety.soloTitle")}
        </h3>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-xs text-text-muted">{t("safety.soloDestination")}</span>
            <input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
            />
          </label>
          <label className="flex w-32 flex-col gap-1 text-sm">
            <span className="text-xs text-text-muted">{t("safety.soloReturnTime")}</span>
            <input
              type="time"
              dir="ltr"
              value={returnTime}
              onChange={(event) => setReturnTime(event.target.value)}
              className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
            />
          </label>
        </div>
        <Button
          variant="secondary"
          icon={<Send aria-hidden size={14} />}
          loading={busy}
          disabled={destination.trim().length < 2}
          onClick={() => void sendNotice()}
          className="self-start"
        >
          {t("safety.soloSend")}
        </Button>

        {soloNotices.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {soloNotices.map((notice) => {
              const overdue =
                notice.expectedReturn !== null && new Date(notice.expectedReturn).getTime() < Date.now();
              return (
                <li
                  key={notice.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                    overdue ? "border-warning/40 bg-warning/10" : "border-border"
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold text-text-primary">
                      {t("safety.soloBy", {
                        name: notice.memberName,
                        time:
                          notice.expectedReturn !== null
                            ? formatInTz(new Date(notice.expectedReturn), TZ_BUDAPEST)
                            : "—",
                      })}
                    </span>
                    {notice.destination && (
                      <span className="truncate text-xs text-text-muted">{notice.destination}</span>
                    )}
                    {overdue && (
                      <span className="text-[11px] font-bold text-warning">{t("safety.soloOverdue")}</span>
                    )}
                  </span>
                  {notice.isMine && (
                    <Button
                      variant="secondary"
                      className="px-3 text-xs"
                      onClick={() => void resolve(notice.id)}
                    >
                      {t("safety.soloReturned")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Lost button → night meeting point */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-danger/40 bg-danger/5 p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-text-secondary">
          <MapPin aria-hidden size={14} className="text-danger" />
          {t("safety.meetingPointLabel")}
        </h3>
        {nightMeeting && !nightMeeting.isTbd ? (
          <>
            <span className="text-sm font-semibold text-text-primary">{nightMeeting.nameHe}</span>
            {meetingHref && (
              <a
                href={meetingHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-danger px-4 text-base font-bold text-white"
              >
                <MapPin aria-hidden size={18} />
                {t("safety.lostNavigate")}
              </a>
            )}
          </>
        ) : (
          <p className="text-sm leading-6 text-warning">{t("safety.meetingTbd")}</p>
        )}
      </div>

      {/* Rules */}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold text-text-secondary">{t("safety.taxiRulesTitle")}</h3>
        {taxiRules.map((key) => (
          <p key={key} className="text-sm leading-6 text-text-secondary">
            • {t(key)}
          </p>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold text-text-secondary">{t("safety.nightRulesTitle")}</h3>
        {nightRules.map((key) => (
          <p key={key} className="text-sm leading-6 text-text-secondary">
            • {t(key)}
          </p>
        ))}
      </div>

      {/* Location share — deep links only, nothing stored */}
      <Button variant="secondary" icon={<MessageCircle aria-hidden size={16} />} onClick={() => setShareOpen(true)}>
        {t("safety.shareTitle")}
      </Button>
      <BottomSheet open={shareOpen} onClose={() => setShareOpen(false)} title={t("safety.shareTitle")}>
        <div className="flex flex-col gap-2 pb-2">
          <p className="text-sm leading-6 text-text-secondary">{t("safety.shareHint")}</p>
          <a
            href={whatsappShare(prefill, firstMemberPhone)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center rounded-xl bg-brand px-3 text-sm font-semibold text-brand-contrast"
          >
            {t("safety.shareWhatsapp")}
          </a>
          <a
            href="https://www.google.com/maps/sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center rounded-xl border border-border px-3 text-sm font-semibold text-brand"
          >
            {t("safety.shareGoogle")}
          </a>
          <a
            href="findmy://"
            className="flex min-h-12 items-center justify-center rounded-xl border border-border px-3 text-sm font-semibold text-brand"
          >
            {t("safety.shareApple")}
          </a>
        </div>
      </BottomSheet>
    </Card>
  );
}
