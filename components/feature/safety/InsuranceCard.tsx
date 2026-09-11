"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Lock, Phone, ShieldCheck, Upload } from "lucide-react";
import { t } from "@/lib/i18n";
import { pushToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  markInsuranceVerified,
  openInsurancePolicy,
  saveMyInsurance,
  uploadInsurancePdf,
} from "@/lib/actions/safety";
import { telLink } from "@/lib/utils/deeplinks";
import { TRIP_END_ISO } from "./safetyDates";
import type { MyInsurance } from "@/lib/data/safety";

/** Local wall date compare (no tz pitfalls: YYYY-MM-DD strings compare lexically). */
function isExpiringBeforeTripEnd(validUntil: string | null): boolean {
  if (!validUntil) return false;
  return validUntil < TRIP_END_ISO;
}

function formatDateHe(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}

export interface InsuranceCardProps {
  insurance: MyInsurance | null;
}

/**
 * Card 2 — Insurance & documents. Owner-only via RLS; the policy number is
 * stored masked (schema has no full-number column), and opening the policy PDF
 * doubles as the LOGGED reveal (`policy_revealed` app_event).
 */
export function InsuranceCard({ insurance }: InsuranceCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(insurance === null);
  const [insurer, setInsurer] = useState(insurance?.insurer === "—" ? "" : (insurance?.insurer ?? ""));
  const [policyNumber, setPolicyNumber] = useState("");
  const [hotline, setHotline] = useState(insurance?.emergencyPhone ?? "");
  const [validUntil, setValidUntil] = useState(insurance?.validUntil ?? "");
  const [busy, setBusy] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const result = await saveMyInsurance({
        insurer: insurer.trim() === "" ? (insurance?.insurer ?? "—") : insurer,
        policyNumber: policyNumber || undefined,
        emergencyPhone: hotline || undefined,
        validUntil: validUntil || undefined,
      });
      if (result.ok) {
        setEditing(false);
        pushToast({ message: t("safety.saved"), type: "success" });
        router.refresh();
      } else {
        pushToast({ message: t("errors.saveFailed"), type: "danger" });
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleVerified = async (next: boolean) => {
    const result = await markInsuranceVerified(next);
    if (result.ok) router.refresh();
    else pushToast({ message: t("errors.saveFailed"), type: "danger" });
  };

  const openPolicy = async () => {
    setBusy(true);
    try {
      const result = await openInsurancePolicy();
      if (result.ok) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        router.refresh();
      } else {
        pushToast({ message: t("flights.openFailed"), type: "danger" });
      }
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadInsurancePdf(formData);
      if (result.ok) {
        pushToast({ message: t("safety.saved"), type: "success" });
        router.refresh();
      } else {
        pushToast({ message: t("errors.saveFailed"), type: "danger" });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-text-primary">{t("safety.insuranceTitle")}</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-1 text-[11px] font-bold text-text-muted">
          <Lock aria-hidden size={11} />
          {t("safety.insurancePrivateBadge")}
        </span>
      </div>

      {insurance === null || editing ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">{t("safety.insuranceEmpty")}</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("safety.insurer")}</span>
            <input
              value={insurer}
              onChange={(event) => setInsurer(event.target.value)}
              className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("safety.policyNumber")}</span>
            <input
              dir="ltr"
              value={policyNumber}
              onChange={(event) => setPolicyNumber(event.target.value)}
              className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
            />
            <span className="text-[11px] text-text-muted">{t("safety.revealNote")}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("safety.hotline")}</span>
            <input
              dir="ltr"
              value={hotline}
              onChange={(event) => setHotline(event.target.value)}
              className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("safety.validUntil")}</span>
            <input
              type="date"
              dir="ltr"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
              className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
            />
          </label>
          <div className="flex gap-2">
            <Button loading={busy} onClick={() => void save()}>
              {t("safety.insuranceSave")}
            </Button>
            {insurance !== null && (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border px-3">
            <span className="text-sm text-text-muted">{t("safety.insurer")}</span>
            <span className="text-sm font-semibold text-text-primary">{insurance.insurer}</span>
          </div>
          <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border px-3">
            <span className="text-sm text-text-muted">{t("safety.policyNumber")}</span>
            <span dir="ltr" className="ltr-iso tnum text-sm font-bold text-text-primary">
              {insurance.policyNoMasked ?? "—"}
            </span>
          </div>
          <p className="text-[11px] leading-4 text-text-muted">{t("safety.revealNote")}</p>

          {insurance.emergencyPhone && (
            <a
              href={telLink(insurance.emergencyPhone)}
              className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border px-3"
            >
              <span className="text-sm text-text-secondary">{t("safety.hotline")}</span>
              <span className="flex items-center gap-1.5 text-sm font-bold text-success">
                <Phone aria-hidden size={14} />
                <span dir="ltr" className="ltr-iso tnum">
                  {insurance.emergencyPhone}
                </span>
              </span>
            </a>
          )}

          <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border px-3">
            <span className="text-sm text-text-muted">{t("safety.validUntil")}</span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">{formatDateHe(insurance.validUntil)}</span>
              {isExpiringBeforeTripEnd(insurance.validUntil) && (
                <span className="rounded-full bg-danger/12 px-2 py-0.5 text-[11px] font-bold text-danger">
                  {t("safety.validityWarning")}
                </span>
              )}
            </span>
          </div>

          {/* Logged reveal = open the policy PDF (1h signed URL) */}
          {insurance.document ? (
            <Button
              variant="primary"
              icon={<Eye aria-hidden size={16} />}
              loading={busy}
              onClick={() => void openPolicy()}
            >
              {t("safety.policyPdf")} · {t("safety.revealPolicy")}
            </Button>
          ) : (
            <p className="text-sm text-text-secondary">{t("safety.policyPdfNone")}</p>
          )}

          <>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onUpload(file);
              }}
            />
            <Button
              variant="secondary"
              icon={<Upload aria-hidden size={16} />}
              loading={uploading}
              onClick={() => pdfInputRef.current?.click()}
            >
              {t("safety.uploadPolicy")}
            </Button>
          </>

          <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-border px-3">
            <input
              type="checkbox"
              checked={insurance.userVerifiedAt !== null}
              onChange={(event) => void toggleVerified(event.target.checked)}
              className="h-5 w-5 accent-[var(--color-success)]"
            />
            <span className="flex flex-col">
              <span className="text-sm text-text-secondary">{t("safety.verifiedCheckbox")}</span>
              {insurance.userVerifiedAt && (
                <span className="text-[11px] text-text-muted">
                  {t("safety.verifiedAt", {
                    date: new Intl.DateTimeFormat("he-IL", { dateStyle: "short" }).format(
                      new Date(insurance.userVerifiedAt),
                    ),
                  })}
                </span>
              )}
            </span>
            {insurance.userVerifiedAt && <ShieldCheck aria-hidden size={16} className="text-success" />}
          </label>

          <Button variant="ghost" onClick={() => setEditing(true)} className="self-start">
            {t("common.edit")}
          </Button>
        </div>
      )}

      <p className="text-xs leading-5 text-text-muted">{t("safety.passportNote")}</p>

      {/* Consular section — deliberately empty: never invent contacts (rule 5) */}
      <div className="flex flex-col gap-1 rounded-xl border border-dashed border-border p-3">
        <h3 className="text-sm font-bold text-text-secondary">{t("safety.embassyTitle")}</h3>
        <p className="text-xs leading-5 text-warning">{t("safety.embassyTbd")}</p>
      </div>
    </Card>
  );
}
