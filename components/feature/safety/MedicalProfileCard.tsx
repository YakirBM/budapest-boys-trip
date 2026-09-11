"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, HeartPulse, Phone } from "lucide-react";
import { t } from "@/lib/i18n";
import { pushToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { formatDateShortHe } from "./safetyDates";
import {
  revealGroupMedicalProfiles,
  saveMyMedicalProfile,
  type RevealedProfile,
} from "@/lib/actions/safety";
import { telLink } from "@/lib/utils/deeplinks";
import type { AccessLogEntry, MyMedicalProfile, ProfileVisibility } from "@/lib/data/safety";

const VISIBILITIES: ProfileVisibility[] = ["private", "members", "emergency_only"];

function visibilityLabel(visibility: ProfileVisibility): string {
  switch (visibility) {
    case "members":
      return t("safety.visMembers");
    case "emergency_only":
      return t("safety.visEmergency");
    default:
      return t("safety.visPrivate");
  }
}

function linesToText(entries: string[]): string {
  return entries.join("\n");
}

export interface MedicalProfileCardProps {
  profile: MyMedicalProfile | null;
  accessLog: AccessLogEntry[];
}

/**
 * Card 3 — Personal medical profile (OPT-IN). Owner edits own row; other
 * members' profiles surface ONLY through the logged reveal (ConfirmSheet →
 * server action that writes app_events BEFORE returning data).
 */
export function MedicalProfileCard({ profile, accessLog }: MedicalProfileCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(profile === null);
  const [open, setOpen] = useState(profile !== null);

  const [allergies, setAllergies] = useState(linesToText(profile?.allergies ?? []));
  const [medications, setMedications] = useState(linesToText(profile?.medications ?? []));
  const [conditions, setConditions] = useState(linesToText(profile?.conditions ?? []));
  const [iceName, setIceName] = useState(profile?.iceName ?? "");
  const [icePhone, setIcePhone] = useState(profile?.icePhone ?? "");
  const [bloodType, setBloodType] = useState(profile?.bloodType ?? "");
  const [visibility, setVisibility] = useState<ProfileVisibility>(profile?.visibility ?? "emergency_only");
  const [busy, setBusy] = useState(false);

  const [revealOpen, setRevealOpen] = useState(false);
  const [revealed, setRevealed] = useState<RevealedProfile[] | null>(null);
  const [revealBusy, setRevealBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const result = await saveMyMedicalProfile({
        allergies: allergies.split("\n").map((line) => line.trim()).filter(Boolean),
        medications: medications.split("\n").map((line) => line.trim()).filter(Boolean),
        conditions: conditions.split("\n").map((line) => line.trim()).filter(Boolean),
        bloodType: bloodType || undefined,
        iceName,
        icePhone,
        visibility,
      });
      if (result.ok) {
        setEditing(false);
        setOpen(true);
        pushToast({ message: t("safety.medicalSaved"), type: "success" });
        router.refresh();
      } else {
        pushToast({ message: t("errors.saveFailed"), type: "danger" });
      }
    } finally {
      setBusy(false);
    }
  };

  const doReveal = async () => {
    setRevealBusy(true);
    try {
      const result = await revealGroupMedicalProfiles();
      if (result.ok) {
        setRevealed(result.profiles);
        setRevealOpen(false);
        pushToast({ message: t("safety.revealLogged"), type: "info" });
      } else {
        pushToast({ message: t("errors.forbidden"), type: "danger" });
      }
    } finally {
      setRevealBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <HeartPulse aria-hidden size={18} className="text-danger" />
          {t("safety.medicalTitle")}
        </h2>
        {profile && (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex min-h-12 items-center rounded-xl px-2 text-xs font-semibold text-brand"
          >
            {open ? t("common.close") : t("common.seeDetails")}
          </button>
        )}
      </div>

      {profile === null && !editing ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-text-primary">{t("safety.medicalEmptyTitle")}</p>
          <p className="text-sm leading-6 text-text-secondary">{t("safety.medicalEmptyHint")}</p>
          <Button onClick={() => setEditing(true)} className="self-start">
            {t("safety.medicalFill")}
          </Button>
        </div>
      ) : editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("safety.allergies")}</span>
            <textarea
              rows={3}
              value={allergies}
              onChange={(event) => setAllergies(event.target.value)}
              className="rounded-xl border border-border bg-surface p-3 text-base text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("safety.medications")}</span>
            <textarea
              rows={3}
              value={medications}
              onChange={(event) => setMedications(event.target.value)}
              className="rounded-xl border border-border bg-surface p-3 text-base text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("safety.conditions")}</span>
            <textarea
              rows={2}
              value={conditions}
              onChange={(event) => setConditions(event.target.value)}
              className="rounded-xl border border-border bg-surface p-3 text-base text-text-primary"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-text-secondary">{t("safety.iceName")}</span>
              <input
                required
                value={iceName}
                onChange={(event) => setIceName(event.target.value)}
                className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-text-secondary">{t("safety.icePhone")}</span>
              <input
                required
                dir="ltr"
                value={icePhone}
                onChange={(event) => setIcePhone(event.target.value)}
                className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("safety.bloodType")}</span>
            <input
              dir="ltr"
              value={bloodType}
              onChange={(event) => setBloodType(event.target.value)}
              className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
            />
            <span className="text-[11px] text-text-muted">{t("safety.bloodDisclaimer")}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("safety.visibility")}</span>
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as ProfileVisibility)}
              className="min-h-12 rounded-xl border border-border bg-surface px-2 text-base text-text-primary"
            >
              {VISIBILITIES.map((value) => (
                <option key={value} value={value}>
                  {visibilityLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              {t("safety.medicalSave")}
            </Button>
            {profile !== null && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
            )}
          </div>
        </form>
      ) : profile ? (
        <div className="flex flex-col gap-2">
          {open && (
            <>
              {profile.allergies.length > 0 && (
                <div className="rounded-xl border border-border p-3">
                  <h3 className="text-xs font-bold text-text-muted">{t("safety.allergies")}</h3>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {profile.allergies.map((line) => (
                      <li key={line} className="text-sm leading-6 text-text-primary">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.medications.length > 0 && (
                <div className="rounded-xl border border-border p-3">
                  <h3 className="text-xs font-bold text-text-muted">{t("safety.medications")}</h3>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {profile.medications.map((line) => (
                      <li key={line} className="text-sm leading-6 text-text-primary">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.conditions.length > 0 && (
                <div className="rounded-xl border border-border p-3">
                  <h3 className="text-xs font-bold text-text-muted">{t("safety.conditions")}</h3>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {profile.conditions.map((line) => (
                      <li key={line} className="text-sm leading-6 text-text-primary">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.bloodType && (
                <p className="text-sm text-text-secondary">
                  {t("safety.bloodType")}:{" "}
                  <span dir="ltr" className="ltr-iso font-semibold">
                    {profile.bloodType}
                  </span>{" "}
                  <span className="text-[11px] text-text-muted">({t("safety.bloodDisclaimer")})</span>
                </p>
              )}
            </>
          )}
          <a
            href={telLink(profile.icePhone)}
            className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border px-3"
          >
            <span className="text-sm text-text-secondary">{t("safety.iceName")}</span>
            <span className="flex items-center gap-1.5 text-sm font-bold text-success">
              <Phone aria-hidden size={14} />
              <span className="text-text-primary">{profile.iceName}</span>
              <span dir="ltr" className="ltr-iso tnum">
                {profile.icePhone}
              </span>
            </span>
          </a>
          <p className="text-xs text-text-muted">
            {t("safety.visibility")}: {visibilityLabel(profile.visibility)}
          </p>
          <Button variant="ghost" onClick={() => setEditing(true)} className="self-start">
            {t("safety.medicalEdit")}
          </Button>
        </div>
      ) : null}

      {/* Group reveal — logged path only */}
      <Button
        variant="secondary"
        icon={<Eye aria-hidden size={16} />}
        onClick={() => setRevealOpen(true)}
      >
        {t("safety.groupReveal")}
      </Button>

      {revealed !== null && (
        <div className="flex flex-col gap-2">
          {revealed.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("safety.groupRevealEmpty")}</p>
          ) : (
            revealed.map((entry) => (
              <div key={entry.userId} className="flex flex-col gap-1 rounded-xl border border-border p-3">
                <span className="text-sm font-bold text-text-primary">{entry.fullName}</span>
                {entry.allergies.length > 0 && (
                  <p className="text-xs leading-5 text-text-secondary">
                    <span className="font-bold">{t("safety.allergies")}:</span> {entry.allergies.join(", ")}
                  </p>
                )}
                {entry.medications.length > 0 && (
                  <p className="text-xs leading-5 text-text-secondary">
                    <span className="font-bold">{t("safety.medications")}:</span> {entry.medications.join(", ")}
                  </p>
                )}
                {entry.conditions.length > 0 && (
                  <p className="text-xs leading-5 text-text-secondary">
                    <span className="font-bold">{t("safety.conditions")}:</span> {entry.conditions.join(", ")}
                  </p>
                )}
                {entry.bloodType && (
                  <p className="text-xs leading-5 text-text-secondary">
                    <span className="font-bold">{t("safety.bloodType")}:</span>{" "}
                    <span dir="ltr" className="ltr-iso">
                      {entry.bloodType}
                    </span>
                  </p>
                )}
                <a
                  href={telLink(entry.icePhone)}
                  className="inline-flex min-h-12 items-center gap-1.5 text-xs font-bold text-success"
                >
                  <Phone aria-hidden size={13} />
                  {t("safety.iceOf", { name: entry.iceName, phone: entry.icePhone })}
                </a>
              </div>
            ))
          )}
        </div>
      )}

      {/* Access log — who viewed MY profile */}
      <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
        <h3 className="text-xs font-bold text-text-muted">{t("safety.accessLogTitle")}</h3>
        {accessLog.length === 0 ? (
          <p className="text-xs text-text-muted">{t("safety.accessLogEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {accessLog.map((entry) => (
              <li key={entry.id} className="text-xs leading-5 text-text-secondary">
                {entry.actorName} · {formatDateShortHe(entry.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmSheet
        open={revealOpen}
        onClose={() => setRevealOpen(false)}
        onConfirm={() => void doReveal()}
        title={t("safety.groupReveal")}
        description={t("safety.groupRevealConfirm")}
        confirmLabel={t("common.confirm")}
        danger={false}
        loading={revealBusy}
      />
    </Card>
  );
}
