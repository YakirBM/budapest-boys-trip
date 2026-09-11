"use client";

import clsx from "clsx";
import { useState } from "react";
import { Info } from "lucide-react";
import { t } from "@/lib/i18n";
import { BottomSheet } from "./BottomSheet";

export interface EstimateBadgeProps {
  /** Where the number came from (e.g. "bkk.hu", "ארקיע", "הערכת המארגן"). */
  source: string;
  lastVerifiedAt: string | number | Date;
  className?: string;
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * EstimateBadge — small warning-tinted chip "הערכה"; tap opens a bottom sheet
 * with the source + last-verified timestamp (doc 05 §7). Mandatory on any
 * non-verified price/schedule (hard rule 5 in AGENTS.md).
 */
export function EstimateBadge({ source, lastVerifiedAt, className }: EstimateBadgeProps) {
  const [open, setOpen] = useState(false);
  const date = new Date(lastVerifiedAt);
  const valid = !Number.isNaN(date.getTime());

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t("common.estimateDetails")}: ${source}`}
        className={clsx(
          "inline-flex min-h-6 items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-bold text-warning",
          "transition-opacity duration-150 active:opacity-80",
          className,
        )}
      >
        <Info aria-hidden size={12} className="shrink-0" />
        {t("common.estimate")}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("common.estimateDetails")}>
        <dl className="flex flex-col gap-3 pb-2 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3">
            <dt className="text-text-muted">{t("common.source")}</dt>
            <dd className="font-semibold text-text-primary">{source}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3">
            <dt className="shrink-0 text-text-muted">{t("common.lastVerifiedAt")}</dt>
            <dd dir="ltr" className="ltr-iso tnum text-start font-semibold text-text-primary">
              {valid ? dateFormatter.format(date) : "—"}
            </dd>
          </div>
        </dl>
      </BottomSheet>
    </>
  );
}
