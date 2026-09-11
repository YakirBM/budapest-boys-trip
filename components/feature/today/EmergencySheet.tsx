"use client";

import { Phone } from "lucide-react";
import { t } from "@/lib/i18n";
import { telLink } from "@/lib/utils/deeplinks";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { AccommodationInfo } from "@/lib/data/today";

export interface EmergencySheetProps {
  open: boolean;
  onClose: () => void;
  accommodation: AccommodationInfo;
}

/**
 * EmergencySheet — works fully offline (doc 00 rule 11): 112 dial link, the
 * booked accommodation address, and a pointer to the viewing member's OWN
 * insurance document. Never renders other members' documents or any sensitive
 * data beyond the group-visible accommodation address.
 */
export function EmergencySheet({ open, onClose, accommodation }: EmergencySheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={t("today.emergency.title")}>
      <div className="flex flex-col gap-3 pb-2">
        <Button
          variant="danger"
          block
          icon={<Phone aria-hidden size={18} />}
          onClick={() => {
            window.location.href = telLink("112");
          }}
        >
          {t("today.emergency.call112")}
        </Button>

        <div className="rounded-xl bg-surface p-3">
          <p className="text-xs font-medium text-text-muted">{t("today.emergency.accommodationAddress")}</p>
          {accommodation.booked && accommodation.address ? (
            <p className="mt-1 text-sm font-semibold text-text-primary">{accommodation.address}</p>
          ) : (
            <p className="mt-1 text-sm text-text-muted">{t("today.emergency.noAccommodation")}</p>
          )}
        </div>

        <div className="rounded-xl bg-surface p-3">
          <p className="text-xs font-medium text-text-muted">{t("today.emergency.insurance")}</p>
        </div>

        <p className="text-center text-xs text-text-muted">{t("today.emergency.offlineNote")}</p>
      </div>
    </BottomSheet>
  );
}
