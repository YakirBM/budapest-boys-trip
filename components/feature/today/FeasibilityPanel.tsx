"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, ChevronDown, ShieldCheck, TriangleAlert } from "lucide-react";
import { t } from "@/lib/i18n";
import { formatInTz } from "@/lib/utils/time";
import { TZ_BUDAPEST } from "@/lib/utils/time";
import { evaluateDayFeasibility } from "@/lib/utils/feasibility";
import { bufferForDay, toFeasibilityInput, type TripItem } from "@/lib/data/today";

export interface FeasibilityPanelProps {
  items: TripItem[];
  dayNumber: number;
  /** "Running late" shift in minutes applied to every start (doc 00 rule 7). */
  lateShiftMin: number;
}

/**
 * FeasibilityPanel — "האם המסלול אפשרי?" (doc 00 rule 8): heuristic slack
 * warnings between consecutive items, buffer 15 on day 5. Collapsible; recomputes
 * on every edit and on the late-shift.
 */
export function FeasibilityPanel({ items, dayNumber, lateShiftMin }: FeasibilityPanelProps) {
  const [open, setOpen] = useState(false);

  const warnings = useMemo(() => {
    const inputs = items
      .filter((item) => item.status !== "completed")
      .map((item) => {
        const input = toFeasibilityInput(item);
        if (lateShiftMin > 0) input.startTime += lateShiftMin * 60_000;
        if (lateShiftMin > 0 && input.endTime !== null) input.endTime += lateShiftMin * 60_000;
        return input;
      });
    return evaluateDayFeasibility(inputs, bufferForDay(dayNumber));
  }, [items, dayNumber, lateShiftMin]);

  const headlineTone =
    warnings.length === 0
      ? "text-success"
      : warnings.some((w) => w.severity === "conflict")
        ? "text-danger"
        : "text-warning";

  return (
    <section
      aria-label={t("today.feasibility")}
      className={clsx(
        "mb-4 rounded-xl border bg-surface",
        warnings.length === 0 ? "border-border" : "border-warning/40",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-start"
      >
        {warnings.length === 0 ? (
          <ShieldCheck aria-hidden size={20} className="shrink-0 text-success" />
        ) : warnings.some((w) => w.severity === "conflict") ? (
          <TriangleAlert aria-hidden size={20} className={`shrink-0 ${headlineTone}`} />
        ) : (
          <AlertTriangle aria-hidden size={20} className={`shrink-0 ${headlineTone}`} />
        )}
        <span className={`flex-1 text-sm font-bold ${headlineTone}`}>{t("today.feasibility")}</span>
        {warnings.length > 0 && (
          <span dir="ltr" className="tnum text-xs font-bold text-warning">
            {warnings.length}
          </span>
        )}
        <ChevronDown
          aria-hidden
          size={18}
          className={clsx("shrink-0 text-text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <ul className="flex flex-col gap-2 px-3 pb-3">
          {warnings.length === 0 && (
            <li className="rounded-lg bg-surface-raised p-2.5 text-sm text-text-secondary">
              {t("route.feasibilityOk")}
            </li>
          )}
          {warnings.map((warning) => (
            <li
              key={`${warning.itemId}-${warning.messageKey}`}
              className={clsx(
                "rounded-lg p-2.5 text-sm leading-6",
                warning.severity === "conflict"
                  ? "bg-danger/12 text-danger"
                  : "bg-warning/12 text-warning",
              )}
            >
              <strong className="font-bold">{warning.itemTitle}</strong>{" "}
              <span dir="ltr" className="ltr-iso tnum">
                {formatInTz(new Date(warning.arrivalAt), TZ_BUDAPEST)}
              </span>{" "}
              →{" "}
              <span dir="ltr" className="ltr-iso tnum">
                {formatInTz(new Date(warning.startAt), TZ_BUDAPEST)}
              </span>{" "}
              ·{" "}
              {warning.messageKey === "hardConflict"
                ? t("today.feasibility.hardConflict")
                : t("today.feasibility.slackTight", { minutes: Math.max(0, warning.slackMin) })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
