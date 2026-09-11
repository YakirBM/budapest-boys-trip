"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { t } from "@/lib/i18n";
import { LEGAL_TRANSITIONS } from "@/lib/data/today";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StatusChip } from "@/components/ui/StatusChip";
import type { ItineraryStatus } from "@/components/ui/types";

/** Targets that are destructive and therefore need an in-sheet confirm step. */
const DESTRUCTIVE_TARGETS: readonly ItineraryStatus[] = ["skipped", "cancelled"];

export interface StatusMenuSheetProps {
  itemTitle: string;
  status: ItineraryStatus;
  /** True when the viewing user is the trip owner (unlocks the revert). */
  isOwner: boolean;
  open: boolean;
  onClose: () => void;
  onTransition: (next: ItineraryStatus) => void | Promise<void>;
}

/**
 * StatusMenuSheet — offers ONLY the legal transitions for the current status
 * (doc 00 rule 5, same machine the server action enforces). Destructive targets
 * (skip/cancel/revert) require an explicit two-step confirm inside the sheet.
 */
export function StatusMenuSheet({
  itemTitle,
  status,
  isOwner,
  open,
  onClose,
  onTransition,
}: StatusMenuSheetProps) {
  const [confirming, setConfirming] = useState<ItineraryStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const legal = LEGAL_TRANSITIONS[status].filter(
    (next) => (next !== "planned" || isOwner) && !(next === "planned" && status !== "skipped" && status !== "cancelled"),
  );

  const choose = async (next: ItineraryStatus) => {
    if (DESTRUCTIVE_TARGETS.includes(next) || next === "planned") {
      setConfirming(next);
      return;
    }
    setBusy(true);
    try {
      await onTransition(next);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await onTransition(confirming);
      setConfirming(null);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={() => { setConfirming(null); onClose(); }} title={t("today.statusTitle")}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-center justify-between gap-2 rounded-xl bg-surface p-3">
          <span className="min-w-0 truncate text-sm font-semibold text-text-primary">{itemTitle}</span>
          <StatusChip status={status} size="sm" />
        </div>

        {confirming === null ? (
          <>
            {legal.length === 0 && (
              <p className="py-2 text-sm text-text-muted">{t("statusLabels.completed")}</p>
            )}
            {legal.map((next) => (
              <Button
                key={next}
                variant={DESTRUCTIVE_TARGETS.includes(next) ? "danger" : "secondary"}
                block
                loading={busy}
                onClick={() => void choose(next)}
              >
                {t(`statusLabels.${next}`)}
              </Button>
            ))}
            {(status === "skipped" || status === "cancelled") && (
              <p className="text-xs text-text-muted">
                {isOwner ? t("today.statusRevertHint") : t("today.errors.ownerOnly")}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm leading-6 text-text-secondary">
              {t("common.confirm")} — {t(`statusLabels.${confirming}`)}?
            </p>
            <Button variant="danger" block loading={busy} onClick={() => void confirm()}>
              {t(`statusLabels.${confirming}`)}
            </Button>
            <Button variant="secondary" block disabled={busy} onClick={() => setConfirming(null)}>
              {t("common.cancel")}
            </Button>
          </>
        )}

        <span aria-hidden className="flex justify-center pb-1 text-text-muted">
          <ChevronDown size={16} />
        </span>
      </div>
    </BottomSheet>
  );
}
