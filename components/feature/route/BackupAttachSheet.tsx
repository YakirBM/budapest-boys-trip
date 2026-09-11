"use client";

import { t } from "@/lib/i18n";
import type { TripItem } from "@/lib/data/today";
import { BottomSheet } from "@/components/ui/BottomSheet";

export interface BackupAttachSheetProps {
  open: boolean;
  onClose: () => void;
  /** The item receiving the backup. */
  item: TripItem | null;
  /** All trip items (candidates across days; self excluded). */
  candidates: TripItem[];
  onAttach: (backupItemId: string | null) => void;
}

/** Backup picker (doc 01 rule 9): attach / replace / detach a rain backup. */
export function BackupAttachSheet({ open, onClose, item, candidates, onAttach }: BackupAttachSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={t("route.backupPickerTitle")}>
      <div className="flex flex-col gap-2 pb-2">
        {item && (
          <p className="text-sm font-semibold text-text-primary">{item.title}</p>
        )}
        <button
          type="button"
          onClick={() => {
            onAttach(null);
            onClose();
          }}
          className="inline-flex min-h-12 w-full items-center justify-between rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text-secondary active:opacity-80"
        >
          {t("route.backupNone")}
        </button>
        {candidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            disabled={candidate.id === item?.id}
            onClick={() => {
              onAttach(candidate.id);
              onClose();
            }}
            className="inline-flex min-h-12 w-full items-center justify-between rounded-xl border border-border bg-surface px-3 text-start text-sm text-text-primary disabled:opacity-40"
          >
            <span className="min-w-0 truncate">{candidate.title}</span>
            <span className="shrink-0 text-xs text-text-muted">
              {t("route.dayTabLabel", { day: candidate.dayNumber })}
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
