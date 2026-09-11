"use client";

import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { t, type MessagePath } from "@/lib/i18n";
import { parseMapsLink } from "@/lib/utils/deeplinks";
import type { LibraryPlace, PlaceStatus } from "@/lib/data/route";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { MoneyAmount } from "@/components/ui/MoneyAmount";

export interface PlacesInboxProps {
  places: LibraryPlace[];
  /** Pipeline transitions offered by the UI (scheduled/visited are system-set). */
  onTransition: (placeId: string, status: "idea" | "under_review" | "approved" | "rejected", reason?: string) => void;
  onSchedule: (place: LibraryPlace) => void;
  onQuickAdd: (input: { rawUrl: string; name: string; note?: string }) => Promise<void>;
}

type PipelineTab = "idea" | "under_review" | "approved" | "scheduled" | "rejected";

const TAB_ORDER: readonly PipelineTab[] = [
  "idea",
  "under_review",
  "approved",
  "scheduled",
  "rejected",
];

const STATUS_LABEL_KEYS: Record<PlaceStatus, MessagePath> = {
  idea: "map.statusIdea",
  under_review: "map.statusUnderReview",
  approved: "map.statusApproved",
  scheduled: "map.statusScheduled",
  visited: "map.statusVisited",
  rejected: "map.statusRejected",
};

function placeMatchesTab(place: LibraryPlace, tab: PipelineTab): boolean {
  if (tab === "scheduled") return place.status === "scheduled" || place.status === "visited";
  return place.status === tab;
}

/**
 * PlacesInbox — the suggestion pipeline (doc 01): idea → under_review → approved
 * → scheduled, reject-with-reason from any pre-scheduled state. 12 seeded ideas
 * arrive unverified — hours/price render "לא אומת", never as fact.
 */
export function PlacesInbox({ places, onTransition, onSchedule, onQuickAdd }: PlacesInboxProps) {
  const [tab, setTab] = useState<PipelineTab>("idea");
  const [addOpen, setAddOpen] = useState(false);
  const [rejectPlace, setRejectPlace] = useState<LibraryPlace | null>(null);

  const counts = useMemo(() => {
    const map = new Map<PipelineTab, number>();
    for (const key of TAB_ORDER) {
      map.set(key, places.filter((place) => placeMatchesTab(place, key)).length);
    }
    return map;
  }, [places]);

  const visible = places.filter((place) => placeMatchesTab(place, tab));

  const tabLabel = (key: PipelineTab): string => {
    switch (key) {
      case "idea":
        return t("route.library.tabIdea");
      case "under_review":
        return t("route.library.tabUnderReview");
      case "approved":
        return t("route.library.tabApproved");
      case "scheduled":
        return t("route.library.tabScheduled");
      case "rejected":
        return t("route.library.tabRejected");
    }
  };

  return (
    <section aria-label={t("route.library.title")} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-text-primary">{t("route.library.title")}</h2>
        <Button variant="secondary" icon={<Link2 aria-hidden size={16} />} onClick={() => setAddOpen(true)}>
          {t("route.library.quickAdd")}
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TAB_ORDER.map((key) => {
          const active = key === tab;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={active}
              className={`inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                active ? "border-transparent bg-brand text-brand-contrast" : "border-border bg-surface text-text-secondary"
              }`}
            >
              {tabLabel(key)}
              <span dir="ltr" className="tnum opacity-80">
                {counts.get(key) ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState illustration="box" title={t("route.library.empty")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((place) => (
            <li key={place.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <CategoryIcon category={place.category} size={32} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-text-primary">{place.name}</h3>
                    <p className="truncate text-xs text-text-muted">
                      {place.district ?? place.note?.split("|")[0]?.trim() ?? ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-bold text-text-secondary">
                    {t(STATUS_LABEL_KEYS[place.status])}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                  {place.estPrice !== null ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MoneyAmount amount={place.estPrice} currency={place.priceCurrency} size="sm" />
                      {place.lastVerifiedAt === null && (
                        <span className="rounded-full bg-warning/12 px-2 py-0.5 font-bold text-warning">
                          {t("common.unverified")}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span>{t("route.library.noPrice")}</span>
                  )}
                  {place.tags.includes("verify-hours") && place.lastVerifiedAt === null && (
                    <span>{t("route.library.verifyHours")}</span>
                  )}
                  {place.suggestedByName && (
                    <span>{t("route.library.suggester", { name: place.suggestedByName })}</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {place.status === "idea" && (
                    <Button variant="secondary" onClick={() => onTransition(place.id, "under_review")}>
                      {t("route.library.toReview")}
                    </Button>
                  )}
                  {(place.status === "idea" || place.status === "under_review") && (
                    <Button variant="primary" onClick={() => onTransition(place.id, "approved")}>
                      {t("route.library.approve")}
                    </Button>
                  )}
                  {["idea", "under_review", "approved"].includes(place.status) && (
                    <>
                      <Button variant="secondary" onClick={() => onSchedule(place)}>
                        {t("route.library.schedule")}
                      </Button>
                      <Button variant="danger" onClick={() => setRejectPlace(place)}>
                        {t("route.library.reject")}
                      </Button>
                    </>
                  )}
                  {place.status === "rejected" && (
                    <Button variant="secondary" onClick={() => onTransition(place.id, "idea")}>
                      {t("route.library.tabIdea")}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <QuickAddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (input) => {
          await onQuickAdd(input);
          setAddOpen(false);
          setTab("idea");
        }}
      />

      {rejectPlace && (
        <RejectSheet
          place={rejectPlace}
          onClose={() => setRejectPlace(null)}
          onConfirm={(reason) => {
            onTransition(rejectPlace.id, "rejected", reason);
            setRejectPlace(null);
          }}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function QuickAddSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { rawUrl: string; name: string; note?: string }) => Promise<void>;
}) {
  const [rawUrl, setRawUrl] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const preview = rawUrl.trim() ? parseMapsLink(rawUrl) : null;

  const inputClass =
    "h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none";
  const labelClass = "mb-1 block text-xs font-medium text-text-muted";

  return (
    <BottomSheet open={open} onClose={onClose} title={t("route.library.quickAddTitle")}>
      <div className="flex flex-col gap-3 pb-2">
        <div>
          <label className={labelClass} htmlFor="qa-link">
            {t("route.library.fieldLink")}
          </label>
          <input
            id="qa-link"
            type="url"
            dir="ltr"
            value={rawUrl}
            onChange={(event) => setRawUrl(event.target.value)}
            className={`${inputClass} tnum`}
          />
          {preview && (
            <p className="mt-1 text-xs font-semibold text-success">
              {preview.name
                ? t("route.library.parsePreview", { name: preview.name })
                : t("route.library.parseCoordsOnly")}
            </p>
          )}
          {rawUrl.trim() && !preview && (
            <p className="mt-1 text-xs text-text-muted">{t("route.library.parseFailed")}</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="qa-name">
            {t("route.library.fieldName")}
          </label>
          <input
            id="qa-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="qa-note">
            {t("route.library.fieldNote")}
          </label>
          <input
            id="qa-note"
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={inputClass}
          />
        </div>
        <Button
          block
          disabled={name.trim().length === 0}
          onClick={() => void onSubmit({ rawUrl: rawUrl.trim(), name: name.trim(), note: note.trim() || undefined })}
        >
          {t("common.add")}
        </Button>
        <Button variant="secondary" block onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </BottomSheet>
  );
}

function RejectSheet({
  place,
  onClose,
  onConfirm,
}: {
  place: LibraryPlace;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);

  return (
    <BottomSheet open onClose={onClose} title={t("route.library.rejectTitle")} destructive>
      <div className="flex flex-col gap-3 pb-2">
        <p className="text-sm font-semibold text-text-primary">{place.name}</p>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted" htmlFor="reject-reason">
            {t("route.library.rejectReasonLabel")}
          </label>
          <input
            id="reject-reason"
            type="text"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(false);
            }}
            aria-invalid={error}
            className={`h-12 w-full rounded-xl border bg-surface px-3 text-sm text-text-primary focus:outline-none ${
              error ? "border-danger" : "border-border focus:border-brand"
            }`}
          />
          {error && (
            <p className="mt-1 text-xs font-semibold text-danger">{t("route.errors.reasonRequired")}</p>
          )}
        </div>
        <Button
          variant="danger"
          block
          onClick={() => {
            if (!reason.trim()) {
              setError(true);
              return;
            }
            onConfirm(reason.trim());
          }}
        >
          {t("route.library.reject")}
        </Button>
        <Button variant="secondary" block onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </BottomSheet>
  );
}
