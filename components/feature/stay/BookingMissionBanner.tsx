"use client";

import { t } from "@/lib/i18n";
import { TriangleAlert } from "lucide-react";
import { daysUntil } from "@/lib/utils/time";
import { formatDateHebrew } from "@/lib/utils/time";

const BOOKING_DEADLINE = "2026-09-20";

/**
 * Booking-mission banner (Mode A). Days remaining are computed at render —
 * never hardcoded (doc 03-feature). Red when ≤ 3 days or overdue.
 */
export function BookingMissionBanner() {
  const days = daysUntil(BOOKING_DEADLINE);
  const overdue = days < 0;
  const red = overdue || days <= 3;

  return (
    <div
      role="alert"
      className={`rounded-2xl border p-4 ${
        red ? "border-danger/40 bg-danger/10" : "border-warning/40 bg-warning/10"
      }`}
    >
      <div className="flex items-start gap-2">
        <TriangleAlert
          aria-hidden
          size={20}
          className={`mt-0.5 shrink-0 ${red ? "text-danger" : "text-warning"}`}
        />
        <div className="flex flex-col gap-1">
          <p className={`text-base font-bold ${red ? "text-danger" : "text-warning"}`}>
            {t("stay.bannerNotBooked")}
          </p>
          <p className="text-sm font-semibold text-text-primary">
            {overdue
              ? t("stay.bannerOverdue")
              : days === 1
                ? t("stay.bannerDaysLeftOne")
                : t("stay.bannerDaysLeft", { days })}
          </p>
          <p className="text-xs text-text-secondary">
            {t("stay.deadline")} ({formatDateHebrew(BOOKING_DEADLINE)})
          </p>
          <p className="text-xs text-text-secondary">{t("stay.bannerHint")}</p>
        </div>
      </div>
    </div>
  );
}
