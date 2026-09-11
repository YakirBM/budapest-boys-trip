"use client";

import { t } from "@/lib/i18n";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";

export interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger styling on the confirm button (default true — destructive confirm). */
  danger?: boolean;
  loading?: boolean;
}

/**
 * ConfirmSheet — destructive confirmation wrapper over BottomSheet
 * (doc 05 §8: every destructive action confirms here — never window.confirm).
 * Destructive sheets require an explicit button press (no swipe dismiss).
 */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = true,
  loading = false,
}: ConfirmSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      destructive
      className="max-w-md"
    >
      {description && <p className="pb-4 text-sm leading-6 text-text-secondary">{description}</p>}
      <div className="flex flex-col gap-2 pb-2">
        <Button variant={danger ? "danger" : "primary"} block onClick={onConfirm} loading={loading}>
          {confirmLabel ?? t("common.confirm")}
        </Button>
        <Button variant="secondary" block onClick={onClose} disabled={loading}>
          {cancelLabel ?? t("common.cancel")}
        </Button>
      </div>
    </BottomSheet>
  );
}
