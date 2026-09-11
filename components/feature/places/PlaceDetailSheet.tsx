"use client";

import { useState } from "react";
import { Navigation } from "lucide-react";
import { t } from "@/lib/i18n";
import type { LibraryPlace } from "@/lib/data/route";
import { googleMapsDir, googleMapsSearch } from "@/lib/utils/deeplinks";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { EstimateBadge } from "@/components/ui/EstimateBadge";
import { CommentsThread } from "@/components/feature/schedule/CommentsThread";

export interface PlaceDetailSheetProps {
  place: LibraryPlace | null;
  currentUserId: string | null;
  onClose: () => void;
  onStatusChange: (placeId: string, status: "idea" | "under_review" | "approved" | "rejected", reason?: string) => void;
  onEdit: (place: LibraryPlace) => void;
  onAddToDay: (place: LibraryPlace) => void;
}

const PIPELINE = ["idea", "under_review", "approved", "scheduled"] as const;

/**
 * PlaceDetailSheet — full info + status stepper (reject needs reason) +
 * add-to-day + place comments (docs/14 §3.4.1).
 */
export function PlaceDetailSheet({ place, currentUserId, onClose, onStatusChange, onEdit, onAddToDay }: PlaceDetailSheetProps) {
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState(false);

  if (!place) return null;

  const navUrl =
    place.lat !== null && place.lng !== null
      ? googleMapsDir(`${place.lat},${place.lng}`)
      : (place.googleMapsUrl ?? googleMapsSearch(place.name));

  const current = place;

  const currentStep = PIPELINE.indexOf(current.status as (typeof PIPELINE)[number]);

  function handleReject(): void {
    if (!rejectReason.trim()) {
      setRejectError(true);
      return;
    }
    onStatusChange(current.id, "rejected", rejectReason.trim());
  }

  return (
    <BottomSheet open onClose={onClose} title={current.name}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-center gap-2">
          <CategoryIcon category={current.category} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-text-primary">{current.name}</p>
            {current.district && <p className="truncate text-xs text-text-muted">{current.district}</p>}
          </div>
        </div>

        <ol className="flex items-center gap-1" aria-label={t("route.detail.status")}>
          {PIPELINE.map((step, index) => (
            <li key={step} className="flex flex-1 items-center gap-1">
              <span
                aria-current={index === currentStep ? "step" : undefined}
                className={`h-2 flex-1 rounded-full ${index <= currentStep ? "bg-brand" : "bg-border"}`}
              />
            </li>
          ))}
        </ol>

        {current.estPrice !== null ? (
          <div className="flex items-center gap-2">
            <MoneyAmount amount={current.estPrice} currency={current.priceCurrency} size="md" />
            {current.source && current.lastVerifiedAt ? (
              <EstimateBadge source={current.source} lastVerifiedAt={current.lastVerifiedAt} />
            ) : (
              <span className="rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-bold text-warning">
                {t("route.discover.unverified")}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-text-muted">{t("route.library.noPrice")}</p>
        )}

        {current.note && <p className="text-sm leading-6 text-text-secondary">{current.note}</p>}

        {current.source && (
          <p className="text-xs text-text-muted">
            {t("route.detail.sourceLabel")}: <span className="font-semibold">{current.source}</span>
            {current.lastVerifiedAt && (
              <>
                {" · "}
                {t("route.detail.verifiedAt")}{" "}
                <span dir="ltr" className="ltr-iso tnum">
                  {new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(new Date(current.lastVerifiedAt))}
                </span>
              </>
            )}
          </p>
        )}

        <a
          href={navUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-semibold text-brand-contrast"
        >
          <Navigation aria-hidden size={18} className="rtl:-scale-x-100" />
          {t("route.detail.mapPreview")}
        </a>

        <div className="flex flex-wrap gap-2">
          {current.status === "idea" && (
            <Button variant="secondary" onClick={() => onStatusChange(current.id, "under_review")}>
              {t("route.library.toReview")}
            </Button>
          )}
          {(current.status === "idea" || current.status === "under_review") && (
            <Button variant="primary" onClick={() => onStatusChange(current.id, "approved")}>
              {t("route.library.approve")}
            </Button>
          )}
          <Button variant="secondary" onClick={() => onEdit(current)}>
            {t("route.detail.edit")}
          </Button>
          <Button variant="primary" onClick={() => onAddToDay(current)}>
            {t("route.detail.addToSchedule")}
          </Button>
        </div>

        <div className="rounded-xl border border-border p-2.5">
          <label className="mb-1 block text-xs font-bold text-text-primary" htmlFor={`reject-${current.id}`}>
            {t("route.detail.rejectReason")}
          </label>
          <input
            id={`reject-${current.id}`}
            type="text"
            value={rejectReason}
            onChange={(e) => {
              setRejectReason(e.target.value);
              setRejectError(false);
            }}
            aria-invalid={rejectError}
            className={`min-h-12 w-full rounded-xl border bg-surface px-3 text-sm text-text-primary focus:outline-none ${
              rejectError ? "border-danger" : "border-border focus:border-brand"
            }`}
          />
          {rejectError && (
            <p className="mt-1 text-xs font-bold text-danger">{t("route.detail.rejectNeedsReason")}</p>
          )}
          <Button variant="danger" block onClick={handleReject} className="mt-2">
            {t("route.library.reject")}
          </Button>
        </div>

        {currentUserId && (
          <CommentsThread itemId={current.id} itemKind="place" authorId={currentUserId} />
        )}
      </div>
    </BottomSheet>
  );
}
