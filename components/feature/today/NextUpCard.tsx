"use client";

import { useState } from "react";
import { Navigation, Ticket, TimerIcon } from "lucide-react";
import { t } from "@/lib/i18n";
import { formatInTz, TZ_BUDAPEST, computeLeaveBy } from "@/lib/utils/time";
import { bufferForDay, type TripItem } from "@/lib/data/today";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { TimeBlock } from "@/components/ui/TimeBlock";
import { QuickActionBar, type QuickAction } from "@/components/ui/QuickActionBar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { MemberAvatar } from "@/components/ui/MemberAvatar";
import { useCountdown } from "@/components/ui/CountdownCard";
import { ItemCost } from "./ItemCost";

export interface NextUpCardProps {
  item: TripItem | null;
  dayNumber: number;
  onWeLeft: () => void;
  onLatePreset: (minutes: number) => void;
}

/**
 * NextUpCard — hero (doc 00): title, start + leave-by with live countdown,
 * address, reservation state, estimate cost, and the quick actions
 * (נווט / כרטיס / יצאנו / מאחר ב-X דק').
 */
export function NextUpCard({ item, dayNumber, onWeLeft, onLatePreset }: NextUpCardProps) {
  const [reservationOpen, setReservationOpen] = useState(false);
  const [lateOpen, setLateOpen] = useState(false);

  const leaveBy = item
    ? computeLeaveBy(new Date(item.startTime), item.travelMinToNext ?? 0, bufferForDay(dayNumber))
    : null;
  const countdown = useCountdown(leaveBy ?? 0, 30_000);

  if (!item) return null;

  const countdownText =
    countdown === null || countdown.totalMs <= 0
      ? null
      : countdown.days > 0
        ? t("today.daysLeft", { count: countdown.days })
        : `${String(countdown.hours).padStart(2, "0")}:${String(countdown.minutes).padStart(2, "0")}`;

  const countdownTone =
    countdown !== null && countdown.totalMs <= 5 * 60_000
      ? "text-danger"
      : countdown !== null && countdown.totalMs <= 15 * 60_000
        ? "text-warning"
        : "text-text-primary";

  const actions: QuickAction[] = [
    ...(item.navUrl
      ? [
          {
            id: "navigate",
            label: t("common.navigate"),
            icon: <Navigation aria-hidden size={16} className="rtl:-scale-x-100" />,
            onClick: () => window.open(item.navUrl as string, "_blank", "noopener,noreferrer"),
          },
        ]
      : []),
    ...(item.reservation
      ? [
          {
            id: "ticket",
            label: t("common.ticket"),
            icon: <Ticket aria-hidden size={16} />,
            onClick: () => setReservationOpen(true),
          },
        ]
      : []),
    {
      id: "we-left",
      label: t("common.weLeft"),
      onClick: onWeLeft,
    },
    {
      id: "late",
      label: t("common.runningLate", { minutes: "…" }),
      onClick: () => setLateOpen(true),
    },
  ];

  return (
    <Card className="mb-4 flex flex-col gap-3 rounded-2xl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-brand">{t("today.nextUp")}</p>
          <h2 className="truncate text-lg font-bold text-text-primary">{item.title}</h2>
        </div>
        {item.ownerName && (
          <MemberAvatar name={item.ownerName} size={32} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1 text-sm text-text-secondary">
          {t("today.startsAt")}
          <TimeBlock dateTime={item.startTime} timeZone={TZ_BUDAPEST} showTzBadge={false} />
        </span>
        {leaveBy && (
          <span className="inline-flex items-center gap-1 text-sm">
            <TimerIcon aria-hidden size={16} className="shrink-0 text-text-muted" />
            <span className="text-text-secondary">{t("today.leaveBy")}</span>
            <span dir="ltr" className={`tnum font-bold ${countdownTone}`}>
              {formatInTz(leaveBy, TZ_BUDAPEST)}
            </span>
            {countdownText && (
              <span dir="ltr" className={`tnum text-sm font-semibold ${countdownTone}`}>
                ({countdownText})
              </span>
            )}
          </span>
        )}
        <StatusChip status={item.status} size="sm" />
        {item.isRequired && (
          <span className="rounded-full bg-danger/12 px-2 py-0.5 text-[11px] font-bold text-danger">
            {t("priorities.required")}
          </span>
        )}
      </div>

      {item.address && <p className="text-sm text-text-muted">{item.address}</p>}

      <ItemCost
        perPerson={item.estCostPerPerson}
        group={item.estCostGroup}
        currency={item.currency}
        source={item.place?.source ?? null}
        lastVerifiedAt={item.place?.lastVerifiedAt ?? null}
      />

      {item.backupTitle && (
        <p className="text-xs text-text-muted">
          {t("today.backupOf", { title: item.backupTitle })}
        </p>
      )}

      <QuickActionBar itemId={`nextup-${item.id}`} actions={actions} />

      <BottomSheet
        open={reservationOpen}
        onClose={() => setReservationOpen(false)}
        title={t("today.reservationSheetTitle")}
      >
        <div className="flex flex-col gap-3 pb-2 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3">
            <span className="text-text-muted">{t("common.source")}</span>
            <span className="font-semibold text-text-primary">{item.reservation?.provider ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3">
            <span className="shrink-0 text-text-muted">ref</span>
            <span dir="ltr" className="ltr-iso tnum font-semibold text-text-primary">
              {item.reservation?.refMasked ?? "—"}
            </span>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={lateOpen} onClose={() => setLateOpen(false)} title={t("today.lateTitle")}>
        <div className="flex flex-col gap-2 pb-2">
          {[5, 10, 15, 20].map((minutes) => (
            <Button
              key={minutes}
              variant="secondary"
              block
              onClick={() => {
                setLateOpen(false);
                onLatePreset(minutes);
              }}
            >
              {t("common.runningLate", { minutes })}
            </Button>
          ))}
        </div>
      </BottomSheet>
    </Card>
  );
}
