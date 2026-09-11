"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { t } from "@/lib/i18n";
import type { LibraryPlace } from "@/lib/data/route";
import type { DayPlanInfo, MemberInfo } from "@/lib/data/today";
import type { Category } from "@/components/ui/types";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";

export interface AddItemSheetProps {
  open: boolean;
  onClose: () => void;
  /** Preselected place (schedule-from-library flow) or null for library picker. */
  fixedPlace: LibraryPlace | null;
  places: LibraryPlace[];
  dayPlans: DayPlanInfo[];
  selectedDay: number;
  members: MemberInfo[];
  currentUserId: string | null;
  onSubmit: (input: {
    dayPlanId: string;
    dateIso: string;
    placeId: string | null;
    title: string;
    address: string;
    category: Category;
    startTime: string;
    ownerId: string | null;
    durationMin: number | null;
    estCostPerPerson: number | null;
  }) => Promise<void>;
}

type FormState = {
  placeId: string; // "" = manual
  day: number;
  time: string;
  ownerId: string;
  title: string;
  address: string;
  durationMin: string;
  cost: string;
};

const INITIAL_TIME = "10:00";

/**
 * AddItemSheet — zero-ambiguity scheduling (doc 01 rule 5): start time (+ fixed
 * Europe/Budapest tz), place-derived title/address or manual title + address,
 * owner (defaults to me), optional duration + estimate cost. Day-5 entries
 * after 06:00 trigger the hard-anchor warning (IZ292 dep 10:25).
 */
export function AddItemSheet({
  open,
  onClose,
  fixedPlace,
  places,
  dayPlans,
  selectedDay,
  members,
  currentUserId,
  onSubmit,
}: AddItemSheetProps) {
  const schedulablePlaces = useMemo(
    () => places.filter((place) => ["idea", "under_review", "approved"].includes(place.status)),
    [places],
  );

  const [form, setForm] = useState<FormState>({
    placeId: fixedPlace?.id ?? "",
    day: selectedDay,
    time: INITIAL_TIME,
    ownerId: currentUserId ?? members.find((m) => m.active)?.id ?? "",
    title: "",
    address: "",
    durationMin: "",
    cost: "",
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const chosenPlace = fixedPlace ?? schedulablePlaces.find((p) => p.id === form.placeId) ?? null;
  const plan = dayPlans.find((p) => p.dayNumber === form.day) ?? null;
  const manual = !chosenPlace;
  const day5Warning = form.day === 5 && form.time > "06:00";

  const [titleError, setTitleError] = useState(false);
  const [addressError, setAddressError] = useState(false);

  const submit = async () => {
    if (!plan) return;
    if (manual && !form.title.trim()) {
      setTitleError(true);
      return;
    }
    if (manual && !form.address.trim()) {
      setAddressError(true);
      return;
    }
    await onSubmit({
      dayPlanId: plan.id,
      dateIso: plan.date,
      placeId: chosenPlace?.id ?? null,
      title: manual ? form.title.trim() : chosenPlace.name,
      address: manual ? form.address.trim() : (chosenPlace.district ?? chosenPlace.name),
      category: chosenPlace?.category ?? "other",
      startTime: form.time,
      ownerId: form.ownerId || null,
      durationMin: form.durationMin ? Number(form.durationMin) : null,
      estCostPerPerson: form.cost ? Number(form.cost) : null,
    });
    setTitleError(false);
    setAddressError(false);
  };

  const inputClass =
    "h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none";
  const labelClass = "mb-1 block text-xs font-medium text-text-muted";

  return (
    <BottomSheet open={open} onClose={onClose} title={t("route.addItemTitle")}>
      <div className="flex flex-col gap-3 pb-2">
        {!fixedPlace && (
          <div>
            <label className={labelClass} htmlFor="add-place">
              {t("route.fieldPlace")}
            </label>
            <select
              id="add-place"
              value={form.placeId}
              onChange={(event) => update("placeId", event.target.value)}
              className={inputClass}
            >
              <option value="">{t("route.manualOption")}</option>
              {schedulablePlaces.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {manual && (
          <>
            <div>
              <label className={labelClass} htmlFor="add-title">
                {t("route.fieldTitle")}
              </label>
              <input
                id="add-title"
                type="text"
                value={form.title}
                onChange={(event) => {
                  update("title", event.target.value);
                  setTitleError(false);
                }}
                aria-invalid={titleError}
                className={`${inputClass} ${titleError ? "border-danger" : ""}`}
              />
              {titleError && (
                <p className="mt-1 text-xs font-semibold text-danger">{t("route.errors.titleRequired")}</p>
              )}
            </div>
            <div>
              <label className={labelClass} htmlFor="add-address">
                {t("route.fieldAddress")}
              </label>
              <input
                id="add-address"
                type="text"
                value={form.address}
                onChange={(event) => {
                  update("address", event.target.value);
                  setAddressError(false);
                }}
                aria-invalid={addressError}
                className={`${inputClass} ${addressError ? "border-danger" : ""}`}
              />
              {addressError && (
                <p className="mt-1 text-xs font-semibold text-danger">{t("route.errors.addressRequired")}</p>
              )}
            </div>
          </>
        )}

        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelClass} htmlFor="add-day">
              {t("route.fieldDay")}
            </label>
            <select
              id="add-day"
              value={form.day}
              onChange={(event) => update("day", Number(event.target.value))}
              className={inputClass}
            >
              {dayPlans.map((p) => (
                <option key={p.id} value={p.dayNumber}>
                  {t("route.dayTabLabel", { day: p.dayNumber })}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className={labelClass} htmlFor="add-time">
              {t("route.fieldTime")}
            </label>
            <input
              id="add-time"
              type="time"
              dir="ltr"
              value={form.time}
              onChange={(event) => update("time", event.target.value)}
              className={`${inputClass} tnum`}
            />
          </div>
        </div>

        {day5Warning && (
          <p className="flex items-start gap-1.5 rounded-lg bg-warning/12 p-2.5 text-xs font-semibold text-warning">
            <TriangleAlert aria-hidden size={14} className="mt-0.5 shrink-0" />
            {t("route.day5Warning")}
          </p>
        )}

        <div>
          <label className={labelClass} htmlFor="add-owner">
            {t("route.fieldOwner")}
          </label>
          <select
            id="add-owner"
            value={form.ownerId}
            onChange={(event) => update("ownerId", event.target.value)}
            className={inputClass}
          >
            {members
              .filter((member) => member.active)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName}
                </option>
              ))}
          </select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelClass} htmlFor="add-duration">
              {t("route.fieldDuration")}
            </label>
            <input
              id="add-duration"
              type="number"
              dir="ltr"
              min={5}
              max={720}
              value={form.durationMin}
              onChange={(event) => update("durationMin", event.target.value)}
              className={`${inputClass} tnum`}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass} htmlFor="add-cost">
              {t("route.fieldCost")}
            </label>
            <input
              id="add-cost"
              type="number"
              dir="ltr"
              min={0}
              value={form.cost}
              onChange={(event) => update("cost", event.target.value)}
              className={`${inputClass} tnum`}
            />
          </div>
        </div>

        <Button block onClick={() => void submit()}>
          {t("route.save")}
        </Button>
        <Button variant="secondary" block onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </BottomSheet>
  );
}
