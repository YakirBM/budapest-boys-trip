"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Link2, Plus, Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";
import type { Category, ItineraryStatus } from "@/components/ui/types";
import type { Currency } from "@/lib/utils/money";
import { CURRENCIES } from "@/lib/utils/money";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { AmountInput } from "@/components/ui/AmountInput";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { SCHEDULE_LEGAL_TRANSITIONS, isDay5AnchorConflictHHMM } from "./schedule-logic";
import type { MemberInfo } from "@/lib/data/today";

export interface ScheduleCostDraft {
  label: string;
  amount: string;
  currency: Currency;
}

export interface ScheduleSavePayload {
  title: string;
  description: string;
  address: string;
  links: string[];
  costs: ScheduleCostDraft[];
  participantIds: string[];
  responsibility: string;
  dayNumber: number;
  startTimeHHMM: string;
  durationMin: number | null;
  category: Category;
  imageUrl: string | null;
  imageSource: string | null;
  imageFetchedAt: string | null;
  status: ItineraryStatus;
}

export interface ScheduleItemSheetProps {
  open: boolean;
  onClose: () => void;
  kind: "group" | "personal";
  dayNumber: number;
  members: MemberInfo[];
  currentUserId: string | null;
  isOwner: boolean;
  initial?: Partial<ScheduleSavePayload> & { id?: string };
  prefilledPlace?: { name: string; address?: string | null } | null;
  onSave: (payload: ScheduleSavePayload) => Promise<void>;
  onDelete?: () => Promise<void>;
  saving?: boolean;
}

const CATEGORIES: Category[] = [
  "food",
  "attraction",
  "walk",
  "transit",
  "rest",
  "nightlife",
  "flight",
  "accommodation",
  "other",
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * ScheduleItemSheet — bottom drawer editor (docs/14 §3.2.4, 90dvh).
 * Group items require title + address; personal items may omit address.
 * Day-5 >06:00 shows the anchor warning but still allows save.
 */
export function ScheduleItemSheet({
  open,
  onClose,
  kind,
  dayNumber,
  members,
  initial,
  prefilledPlace,
  onSave,
  onDelete,
  saving = false,
}: ScheduleItemSheetProps) {
  const [title, setTitle] = useState(initial?.title ?? prefilledPlace?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [address, setAddress] = useState(initial?.address ?? prefilledPlace?.address ?? "");
  const [links, setLinks] = useState<string[]>(initial?.links ?? []);
  const [linkDraft, setLinkDraft] = useState("");
  const [costs, setCosts] = useState<ScheduleCostDraft[]>(
    initial?.costs ?? [{ label: "", amount: "", currency: "HUF" }],
  );
  const [participantIds, setParticipantIds] = useState<string[]>(initial?.participantIds ?? []);
  const [responsibility, setResponsibility] = useState(initial?.responsibility ?? "");
  const [day, setDay] = useState(initial?.dayNumber ?? dayNumber);
  const [startTime, setStartTime] = useState(initial?.startTimeHHMM ?? "");
  const [duration, setDuration] = useState(
    initial?.durationMin !== undefined && initial?.durationMin !== null ? String(initial.durationMin) : "",
  );
  const [category, setCategory] = useState<Category>(initial?.category ?? "other");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [imageSource, setImageSource] = useState(initial?.imageSource ?? "");
  const [imageFetchedAt, setImageFetchedAt] = useState<string | null>(initial?.imageFetchedAt ?? null);
  const [status, setStatus] = useState<ItineraryStatus>(initial?.status ?? "planned");
  const [scrapeState, setScrapeState] = useState<"idle" | "loading" | "failed">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? prefilledPlace?.name ?? "");
      setAddress(initial?.address ?? prefilledPlace?.address ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const legalTargets = SCHEDULE_LEGAL_TRANSITIONS[initial?.status ?? "planned"] ?? [];
  const showAnchorWarning = isDay5AnchorConflictHHMM(day, startTime || null);

  const inputClass =
    "min-h-12 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none";
  const labelClass = "mb-1 block text-sm font-semibold text-text-primary";

  function toggleParticipant(id: string): void {
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function fetchImageFromLink(url: string): Promise<void> {
    if (!url.trim()) return;
    setScrapeState("loading");
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) throw new Error("scrape failed");
      const data = (await res.json()) as {
        title?: string;
        description?: string;
        imageUrl?: string | null;
        address?: string | null;
        source?: string;
        fetchedAt?: string;
      };
      if (data.imageUrl) {
        setImageUrl(data.imageUrl);
        setImageSource(data.source ?? new URL(url).hostname);
        setImageFetchedAt(data.fetchedAt ?? new Date().toISOString());
      }
      if (!title.trim() && data.title) setTitle(data.title.slice(0, 120));
      if (!description.trim() && data.description) setDescription(data.description.slice(0, 2000));
      if (!address.trim() && data.address) setAddress(data.address);
      setScrapeState("idle");
    } catch {
      setScrapeState("failed");
    }
  }

  async function handleSave(): Promise<void> {
    setFormError(null);
    if (!title.trim()) {
      setFormError(t("today.editor.titleRequired"));
      return;
    }
    if (kind === "group" && !address.trim()) {
      setFormError(t("today.editor.addressRequired"));
      return;
    }
    if (startTime && !TIME_RE.test(startTime)) {
      setFormError(t("route.errors.timeRequired"));
      return;
    }
    const durationMin = duration.trim() === "" ? null : Number(duration);
    if (duration.trim() !== "" && (!Number.isInteger(durationMin) || (durationMin ?? 0) < 5)) {
      setFormError(t("route.errors.validation"));
      return;
    }
    await onSave({
      title: title.trim(),
      description: description.trim(),
      address: address.trim(),
      links: links.filter((l) => l.trim()),
      costs: costs.filter((c) => c.amount.trim() !== ""),
      participantIds,
      responsibility: responsibility.trim(),
      dayNumber: day,
      startTimeHHMM: startTime,
      durationMin,
      category,
      imageUrl: imageUrl.trim() || null,
      imageSource: imageSource.trim() || null,
      imageFetchedAt,
      status,
    });
  }

  if (!open) return null;

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={initial?.id ? t("today.editor.title") : t("today.editor.newTitle")}>
        <div className="flex flex-col gap-4 pb-2">
          {showAnchorWarning && (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2.5 text-sm font-bold text-danger">
              {t("today.editor.anchorWarning")}
            </p>
          )}
          {formError && (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
              {formError}
            </p>
          )}

          <div>
            <label className={labelClass} htmlFor="sched-title">{t("today.editor.fieldTitle")}</label>
            <input
              id="sched-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="sched-desc">{t("today.editor.fieldDescription")}</label>
            <textarea
              id="sched-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={clsx(inputClass, "min-h-20 resize-y")}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="sched-address">
              {t("today.editor.fieldAddress")}
              {kind === "personal" ? ` · ${t("today.editor.personalNoAddressHint")}` : ""}
            </label>
            <input
              id="sched-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <span className={labelClass}>{t("today.editor.fieldLinks")}</span>
            <ul className="flex flex-col gap-2">
              {links.map((link, index) => (
                <li key={`${link}-${index}`} className="flex items-center gap-2">
                  <span dir="ltr" className="ltr-iso tnum min-w-0 flex-1 truncate text-xs text-text-secondary">
                    {link}
                  </span>
                  <button
                    type="button"
                    aria-label={t("today.editor.removeLink")}
                    onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-text-muted"
                  >
                    <Trash2 aria-hidden size={18} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="url"
                dir="ltr"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onBlur={() => {
                  if (linkDraft.trim()) void fetchImageFromLink(linkDraft);
                }}
                placeholder="https://"
                aria-label={t("today.editor.fieldLinks")}
                className={`${inputClass} ltr-iso tnum flex-1`}
              />
              <Button
                variant="secondary"
                icon={<Plus aria-hidden size={16} />}
                onClick={() => {
                  if (!linkDraft.trim()) return;
                  setLinks((prev) => [...prev, linkDraft.trim()]);
                  setLinkDraft("");
                }}
              >
                {t("today.editor.addLink")}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => {
                const first = links[0] ?? linkDraft;
                if (first) void fetchImageFromLink(first);
              }}
              disabled={scrapeState === "loading"}
              className="mt-2 inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-surface px-3 text-sm font-semibold text-brand-strong"
            >
              <Link2 aria-hidden size={16} />
              {t("today.editor.fetchImage")}
            </button>
            {scrapeState === "failed" && (
              <p className="mt-1 text-xs text-text-muted">{t("today.editor.fetchFailed")}</p>
            )}
          </div>

          <div>
            <span className={labelClass}>{t("today.editor.fieldCosts")}</span>
            <ul className="flex flex-col gap-3">
              {costs.map((cost, index) => (
                <li key={index} className="rounded-xl border border-border p-2.5">
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={cost.label}
                      onChange={(e) =>
                        setCosts((prev) => prev.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)))
                      }
                      placeholder={t("today.editor.costLabel")}
                      aria-label={t("today.editor.costLabel")}
                      className={`${inputClass} flex-1`}
                    />
                    <button
                      type="button"
                      aria-label={t("today.editor.removeCost")}
                      onClick={() => setCosts((prev) => prev.filter((_, i) => i !== index))}
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-text-muted"
                    >
                      <Trash2 aria-hidden size={18} />
                    </button>
                  </div>
                  <div className="flex items-end gap-2">
                    <AmountInput
                      value={cost.amount}
                      currency={cost.currency}
                      onChange={(next) =>
                        setCosts((prev) => prev.map((c, i) => (i === index ? { ...c, amount: next } : c)))
                      }
                      className="flex-1"
                    />
                    <label className="flex shrink-0 flex-col gap-1 text-xs text-text-muted">
                      {t("route.form.fieldCurrency")}
                      <select
                        value={cost.currency}
                        onChange={(e) =>
                          setCosts((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, currency: e.target.value as Currency } : c)),
                          )
                        }
                        className="h-12 rounded-xl border border-border bg-surface px-2 text-sm text-text-primary"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              block
              icon={<Plus aria-hidden size={16} />}
              onClick={() => setCosts((prev) => [...prev, { label: "", amount: "", currency: "HUF" }])}
              className="mt-2"
            >
              {t("today.editor.addCost")}
            </Button>
          </div>

          <div>
            <span className={labelClass}>{t("today.editor.fieldParticipants")}</span>
            <div className="flex flex-wrap gap-2">
              {members.map((member) => {
                const selected = participantIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleParticipant(member.id)}
                    className={clsx(
                      "inline-flex min-h-12 items-center rounded-xl border px-3 text-sm font-semibold",
                      selected ? "border-transparent bg-brand text-brand-contrast" : "border-border bg-surface text-text-secondary",
                    )}
                  >
                    {member.fullName}
                  </button>
                );
              })}
            </div>
            <label className="mt-2 block">
              <span className={labelClass}>{t("today.editor.fieldResponsibility")}</span>
              <input
                type="text"
                value={responsibility}
                onChange={(e) => setResponsibility(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className={labelClass}>{t("today.editor.fieldDay")}</span>
              <select value={day} onChange={(e) => setDay(Number(e.target.value))} className={inputClass}>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>
                {t("today.editor.fieldStartTime")} · {t("today.editor.timeLabel")}
              </span>
              <input
                type="time"
                dir="ltr"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={`${inputClass} ltr-iso tnum`}
              />
            </label>
            <label className="block">
              <span className={labelClass}>{t("today.editor.fieldDuration")}</span>
              <input
                type="number"
                dir="ltr"
                inputMode="numeric"
                min={5}
                max={720}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={`${inputClass} ltr-iso tnum`}
              />
            </label>
          </div>

          <div>
            <span className={labelClass}>{t("today.editor.fieldCategory")}</span>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  className={clsx(
                    "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold",
                    category === c ? "border-transparent bg-brand text-brand-contrast" : "border-border bg-surface text-text-secondary",
                  )}
                >
                  <CategoryIcon category={c} size={20} />
                  {t(`categories.${c}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={labelClass}>{t("today.editor.fieldCover")}</span>
            {imageUrl ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" aria-hidden className="h-16 w-16 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p dir="ltr" className="ltr-iso tnum truncate text-xs text-text-muted">{imageSource}</p>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setImageUrl("");
                        setImageSource("");
                        setImageFetchedAt(null);
                      }}
                      className="inline-flex min-h-12 items-center rounded-xl bg-surface px-3 text-xs font-bold text-text-secondary"
                    >
                      {t("today.editor.removeImage")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-muted">{t("today.editor.imageFromLink")}</p>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor="sched-status">{t("today.editor.fieldStatus")}</label>
            <select
              id="sched-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ItineraryStatus)}
              className={inputClass}
            >
              <option value={initial?.status ?? "planned"}>{t(`statusLabels.${initial?.status ?? "planned"}`)}</option>
              {legalTargets.map((target) => (
                <option key={target} value={target}>{t(`statusLabels.${target}`)}</option>
              ))}
            </select>
          </div>

          <div className="sticky bottom-0 flex flex-col gap-2 bg-surface-raised pb-2 pt-2">
            <Button block loading={saving} onClick={() => void handleSave()}>
              {t("common.save")}
            </Button>
            {onDelete && initial?.id && (
              <Button variant="danger" block onClick={() => setConfirmDelete(true)}>
                {t("today.editor.deleteItem")}
              </Button>
            )}
            {!navigator.onLine && (
              <p className="text-center text-xs text-text-muted">{t("today.editor.queuedOffline")}</p>
            )}
          </div>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void onDelete?.();
        }}
        title={t("today.editor.deleteItem")}
        description={t("today.editor.deleteConfirm")}
      />
    </>
  );
}
