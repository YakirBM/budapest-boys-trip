"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Star, ThumbsDown, Vote } from "lucide-react";
import { t, type MessagePath } from "@/lib/i18n";
import { pushToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import type { CurrencyCode } from "@/components/ui/types";
import {
  addCandidate,
  createStayPoll,
  setCandidateStatus,
  type ActionError,
} from "@/lib/actions/stay";
import type { Accommodation, FxRateInfo } from "@/lib/data/stay";

function errorMessage(error: ActionError): string {
  const map: Record<ActionError, MessagePath> = {
    auth: "errors.auth",
    network: "errors.network",
    forbidden: "errors.forbidden",
    validation: "errors.saveFailed",
    generic: "errors.generic",
  };
  return t(map[error]);
}

const NIGHTS = 4;

/** (total ÷ 4 nights ÷ members) in the listing currency, plus an ILS estimate when an FX rate exists. */
function perPersonNight(
  acc: Accommodation,
  members: number,
  fx: FxRateInfo,
): { primary: { amount: number; currency: CurrencyCode } | null; ils: number | null } {
  if (acc.totalPrice === null || members <= 0) return { primary: null, ils: null };
  const currency = (["HUF", "ILS", "EUR", "USD"].includes(acc.currency)
    ? acc.currency
    : "HUF") as CurrencyCode;
  const perPerson = acc.totalPrice / NIGHTS / members;
  const ils =
    fx.ilsPerHuf !== null && currency === "HUF"
      ? Math.round((perPerson * fx.ilsPerHuf + Number.EPSILON) * 100) / 100
      : null;
  return { primary: { amount: perPerson, currency }, ils };
}

export interface CandidatesCardProps {
  candidates: Accommodation[];
  memberCount: number;
  fx: FxRateInfo;
  isBooked: boolean;
}

export function CandidatesCard({ candidates, memberCount, fx, isBooked }: CandidatesCardProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [pollBusy, setPollBusy] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [beds, setBeds] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("HUF");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const favoriteCount = candidates.filter((c) => c.status === "favorite").length;

  const submitCandidate = async () => {
    setBusy(true);
    try {
      const result = await addCandidate({
        name,
        district: district || undefined,
        beds: beds ? Number(beds) : undefined,
        totalPrice: price ? Number(price) : undefined,
        currency: (["HUF", "ILS", "EUR", "USD"].includes(currency) ? currency : "HUF") as
          | "HUF"
          | "ILS"
          | "EUR"
          | "USD",
        url: url || "",
        notes: notes || undefined,
      });
      if (result.ok) {
        pushToast({ message: t("stay.candidateAdded"), type: "success" });
        setFormOpen(false);
        setName("");
        setDistrict("");
        setBeds("");
        setPrice("");
        setUrl("");
        setNotes("");
        router.refresh();
      } else {
        pushToast({ message: errorMessage(result.error), type: "danger" });
      }
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: "favorite" | "candidate" | "rejected") => {
    const result = await setCandidateStatus({ id, status });
    if (result.ok) router.refresh();
    else pushToast({ message: errorMessage(result.error), type: "danger" });
  };

  const toPoll = async () => {
    setPollBusy(true);
    try {
      const result = await createStayPoll();
      if (result.ok) {
        pushToast({ message: t("stay.pollCreated"), type: "success" });
        router.push("/decisions");
      } else {
        pushToast({
          message: result.error === "validation" ? t("stay.toPollNeedFavorite") : errorMessage(result.error),
          type: "danger",
        });
      }
    } finally {
      setPollBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-text-primary">
          {t("stay.candidatesTitle")} ({candidates.length})
        </h2>
        <Button
          variant="primary"
          icon={<Plus aria-hidden size={16} />}
          onClick={() => setFormOpen(true)}
          className="px-3 text-sm"
        >
          {t("stay.addCandidate")}
        </Button>
      </div>

      {candidates.length === 0 ? (
        <EmptyState illustration="box" title={t("stay.candidatesEmpty")} />
      ) : (
        <div className="flex flex-col gap-2">
          {candidates.map((acc) => {
            const { primary, ils } = perPersonNight(acc, memberCount, fx);
            return (
              <div key={acc.id} className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {acc.status === "favorite" && (
                      <Star aria-hidden size={14} className="shrink-0 fill-warning text-warning" />
                    )}
                    <span className="truncate text-sm font-semibold text-text-primary">{acc.name}</span>
                  </span>
                  {acc.district && (
                    <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-bold text-text-muted">
                      {acc.district}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                  {acc.beds !== null && (
                    <span dir="ltr" className="ltr-iso tnum">
                      {acc.beds} {t("stay.formBeds")}
                    </span>
                  )}
                  {primary && (
                    <MoneyAmount
                      amount={primary.amount}
                      currency={primary.currency}
                      size="sm"
                      convertedTo={
                        ils !== null ? { amount: ils, currency: "ILS" as CurrencyCode } : undefined
                      }
                    />
                  )}
                  {primary && <span className="text-text-muted">{t("stay.perPersonNight")}</span>}
                </div>
                {fx.ilsPerHuf === null && primary && primary.currency === "HUF" && (
                  <p className="text-[11px] text-text-muted">{t("stay.fxMissing")}</p>
                )}
                {fx.ilsPerHuf !== null && fx.fetchedAt && primary && primary.currency === "HUF" && (
                  <p className="text-[11px] text-text-muted">
                    {t("stay.fxNote", {
                      date: new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(
                        new Date(fx.fetchedAt),
                      ),
                      source: fx.source ?? "—",
                    })}
                  </p>
                )}
                <p className="text-[11px] text-text-muted">
                  {t("stay.perPersonFormula", { members: memberCount })}
                </p>
                {acc.notes && <p className="text-xs leading-5 text-text-secondary">{acc.notes}</p>}
                <div className="flex flex-wrap items-center gap-1.5">
                  {acc.url && (
                    <a
                      href={acc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-brand underline-offset-4 hover:underline"
                    >
                      <ExternalLink aria-hidden size={14} />
                      {t("stay.openListing")}
                    </a>
                  )}
                  {acc.status === "favorite" ? (
                    <Button
                      variant="ghost"
                      className="px-3 text-xs"
                      onClick={() => void setStatus(acc.id, "candidate")}
                    >
                      {t("stay.unfavorite")}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      icon={<Star aria-hidden size={14} />}
                      className="px-3 text-xs"
                      onClick={() => void setStatus(acc.id, "favorite")}
                    >
                      {t("stay.favorite")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    icon={<ThumbsDown aria-hidden size={14} />}
                    className="px-3 text-xs text-danger"
                    onClick={() => void setStatus(acc.id, "rejected")}
                  >
                    {t("stay.reject")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isBooked && (
        <Button
          block
          loading={pollBusy}
          icon={<Vote aria-hidden size={16} />}
          onClick={() => void toPoll()}
        >
          {t("stay.toPoll")} ({favoriteCount})
        </Button>
      )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={t("stay.addCandidate")}>
        <form
          className="flex flex-col gap-3 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCandidate();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("stay.formName")}</span>
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-text-secondary">{t("stay.formDistrict")}</span>
              <input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="V / VI / VII"
                className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
              />
            </label>
            <label className="flex w-24 flex-col gap-1 text-sm">
              <span className="font-medium text-text-secondary">{t("stay.formBeds")}</span>
              <input
                inputMode="numeric"
                value={beds}
                onChange={(e) => setBeds(e.target.value.replace(/\D/g, ""))}
                className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-text-secondary">{t("stay.formPrice")}</span>
              <input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))}
                className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
              />
            </label>
            <label className="flex w-28 flex-col gap-1 text-sm">
              <span className="font-medium text-text-secondary">{t("stay.formCurrency")}</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="min-h-12 rounded-xl border border-border bg-surface px-2 text-base text-text-primary"
              >
                {["HUF", "ILS", "EUR", "USD"].map((c) => (
                  <option key={c} value={c} dir="ltr">
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("stay.formUrl")}</span>
            <input
              type="url"
              dir="ltr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-text-primary"
            />
            <span className="text-[11px] text-text-muted">{t("stay.formUrlHint")}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text-secondary">{t("stay.formNotes")}</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl border border-border bg-surface p-3 text-base text-text-primary"
            />
          </label>
          <Button type="submit" block loading={busy}>
            {t("stay.saveCandidate")}
          </Button>
        </form>
      </BottomSheet>
    </Card>
  );
}
