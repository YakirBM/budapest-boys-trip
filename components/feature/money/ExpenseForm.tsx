"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { t } from "@/lib/i18n";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { pushToast } from "@/components/ui/Toast";
import { formatMoney } from "@/components/ui/MoneyAmount";
import { ExpenseCategoryIcon, expenseCategoryLabel } from "./visuals";
import {
  createExpenseAction,
  type SplitMethod,
  type SplitPlan,
} from "@/lib/actions/money";
import type { ExpenseRow, FxRateRow } from "@/lib/data/money";
import type { TripMember } from "@/lib/data/trip";
import { enqueue, cacheSnapshot } from "@/lib/offline/db";
import {
  CURRENCIES,
  convert,
  minorToNumber,
  parseAmount,
  type Currency,
} from "@/lib/utils/money";

export interface ExpenseFormProps {
  open: boolean;
  onClose: () => void;
  tripId: string;
  members: TripMember[];
  userId: string;
  rates: FxRateRow[];
  defaultDay: number;
  /** Invalidate server data after a successful online save. */
  onSaved: () => void;
  /** Prepend a locally-created row (offline path) — id is the outbox op id. */
  onOfflineTemp: (expense: ExpenseRow) => void;
}

const METHODS: SplitMethod[] = ["equal", "exact", "percent", "shares"];

/** Mirrors the DB enum expense_category (docs/03 §4.4) — server action validates. */
const EXPENSE_CATEGORIES = [
  "lodging",
  "food",
  "transit",
  "attraction",
  "shopping",
  "nightlife",
  "taxi",
  "other",
] as const;

/** Static label maps — t() keys must be literal paths (type-checked). */
const SPLIT_LABELS: Record<SplitMethod, string> = {
  equal: t("money.split.equal"),
  exact: t("money.split.exact"),
  percent: t("money.split.percent"),
  shares: t("money.split.shares"),
};

const ERROR_LABELS: Record<string, string> = {
  "money.form.errTitleRequired": t("money.form.errTitleRequired"),
  "money.form.errAmountRequired": t("money.form.errAmountRequired"),
  "money.form.errParticipants": t("money.form.errParticipants"),
  "money.form.errPayerNotParticipant": t("money.form.errPayerNotParticipant"),
  "money.form.errPercentSum": t("money.form.errPercentSum"),
  "money.form.errExactSum": t("money.form.errExactSum"),
  "money.form.errSharesSum": t("money.form.errSharesSum"),
  "money.form.errNoRate": t("money.form.errNoRate"),
  "money.form.errRateInvalid": t("money.form.errRateInvalid"),
  "money.errors.invalid": t("money.errors.invalid"),
  "money.errors.forbidden": t("money.errors.forbidden"),
  "money.errors.notFound": t("money.errors.notFound"),
  "money.errors.generic": t("money.errors.generic"),
};

function inputClass(extra?: string): string {
  return clsx(
    "min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-text-primary outline-none focus:border-brand",
    extra,
  );
}

/**
 * ExpenseForm (docs/06-features/05 §Expense entry, ≤ 15 s budget).
 * Defaults: payer = me, participants = everyone, split = equal, currency = HUF,
 * day = current trip day, spent_at = now (Europe/Budapest). Online saves are
 * atomic (row + server-recomputed splits); offline saves enqueue the row and
 * park the split plan for the reconnect reconcile.
 */
export function ExpenseForm({
  open,
  onClose,
  tripId,
  members,
  userId,
  rates,
  defaultDay,
  onSaved,
  onOfflineTemp,
}: ExpenseFormProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("food");
  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState<Currency>("HUF");
  const [payerId, setPayerId] = useState(userId);
  const [participants, setParticipants] = useState<Set<string>>(() => new Set(members.map((m) => m.user_id)));
  const [method, setMethod] = useState<SplitMethod>("equal");
  const [exactTexts, setExactTexts] = useState<Record<string, string>>({});
  const [percentTexts, setPercentTexts] = useState<Record<string, string>>({});
  const [shareTexts, setShareTexts] = useState<Record<string, string>>({});
  const [tipText, setTipText] = useState("");
  const [feeText, setFeeText] = useState("");
  const [note, setNote] = useState("");
  const [personal, setPersonal] = useState(false);
  const [day, setDay] = useState(defaultDay);
  const [manualRateText, setManualRateText] = useState("");
  const [errCode, setErrCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const amountMinor = useMemo(
    () => (amountText.trim() === "" ? 0 : parseAmount(amountText, currency) ?? 0),
    [amountText, currency],
  );
  const tipMinor = tipText.trim() === "" ? null : parseAmount(tipText, currency);
  const feeMinor = feeText.trim() === "" ? null : parseAmount(feeText, currency);
  const totalMinor = amountMinor + (tipMinor ?? 0) + (feeMinor ?? 0);

  const marketRateRow = currency === "HUF" ? undefined : rates.find((r) => r.base === "HUF" && r.quote === currency);
  const manualFx = Number(manualRateText.replace(",", "."));
  const needsManualRate = currency !== "HUF" && !marketRateRow;
  const fxRate =
    currency === "HUF"
      ? null
      : marketRateRow
        ? marketRateRow.rate > 0
          ? 1 / marketRateRow.rate
          : null
        : Number.isFinite(manualFx) && manualFx > 0
          ? manualFx
          : null;

  const baseTotalMinor = useMemo(() => {
    if (totalMinor <= 0) return 0;
    if (currency === "HUF") return totalMinor;
    if (fxRate === null) return 0;
    return convert(totalMinor, currency, "HUF", fxRate);
  }, [totalMinor, currency, fxRate]);

  const participantIds = useMemo(
    () => members.map((m) => m.user_id).filter((id) => personal || participants.has(id)),
    [members, participants, personal],
  );

  function reset(): void {
    setTitle("");
    setAmountText("");
    setTipText("");
    setFeeText("");
    setNote("");
    setManualRateText("");
    setErrCode(null);
    setMethod("equal");
    setExactTexts({});
    setPercentTexts({});
    setShareTexts({});
  }

  function buildPlan(): SplitPlan | string {
    if (!participantIds.includes(payerId)) return "money.form.errPayerNotParticipant";
    const ids = personal ? [payerId] : participantIds;
    switch (method) {
      case "equal":
        return { method, payerId, participants: ids.map((id) => ({ memberId: id, value: null })) };
      case "exact": {
        const parts = ids.map((id) => {
          const raw = exactTexts[id] ?? "";
          return { id, minor: raw.trim() === "" ? null : parseAmount(raw, currency) };
        });
        if (parts.some((p) => p.minor === null || p.minor! < 0)) return "money.form.errExactSum";
        const sumMinor = parts.reduce((acc, p) => acc + (p.minor ?? 0), 0);
        if (sumMinor !== totalMinor) return "money.form.errExactSum";
        // Convert each line to HUF minor; remainder goes to the payer so the
        // server-side exact check passes (docs/03 §9 rounding rule).
        const hufParts = parts.map((p) => ({
          memberId: p.id,
          value:
            currency === "HUF" ? (p.minor ?? 0) : convert(p.minor ?? 0, currency, "HUF", fxRate ?? 1),
        }));
        const hufSum = hufParts.reduce((acc, p) => acc + p.value, 0);
        const payerPart = hufParts.find((p) => p.memberId === payerId);
        if (payerPart) payerPart.value += baseTotalMinor - hufSum;
        return { method, payerId, participants: hufParts };
      }
      case "percent": {
        const parts = ids.map((id) => ({ memberId: id, value: Number((percentTexts[id] ?? "").replace(",", ".")) }));
        if (parts.some((p) => !Number.isFinite(p.value) || p.value < 0)) return "money.form.errPercentSum";
        const sum = parts.reduce((acc, p) => acc + p.value, 0);
        if (Math.abs(sum - 100) > 0.001) return "money.form.errPercentSum";
        return { method, payerId, participants: parts };
      }
      case "shares": {
        const parts = ids.map((id) => ({ memberId: id, value: Number((shareTexts[id] ?? "").replace(",", ".")) }));
        if (parts.some((p) => !Number.isFinite(p.value) || p.value <= 0)) return "money.form.errSharesSum";
        return { method, payerId, participants: parts };
      }
    }
  }

  function handleSave(): void {
    setErrCode(null);
    if (title.trim() === "") return setErrCode("money.form.errTitleRequired");
    if (amountMinor <= 0) return setErrCode("money.form.errAmountRequired");
    if (!personal && participantIds.length === 0) return setErrCode("money.form.errParticipants");
    if (needsManualRate && fxRate === null) return setErrCode("money.form.errNoRate");
    if (baseTotalMinor <= 0) return setErrCode("money.form.errRateInvalid");
    const planOrErr = buildPlan();
    if (typeof planOrErr === "string") return setErrCode(planOrErr);

    // FX provenance is written onto the row (rule 5) — source + recorded rate.
    const noteParts: string[] = [];
    if (note.trim() !== "") noteParts.push(note.trim());
    if (currency !== "HUF") {
      noteParts.push(
        `${t("money.fxLine", { rate: String(fxRate) })} (${marketRateRow?.source ?? "manual"})`,
      );
    }
    const noteWithFx = noteParts.length > 0 ? noteParts.join(" · ") : null;

    const spentAtIso = new Date().toISOString();
    const rowPayload = {
      trip_id: tripId,
      title: title.trim(),
      category,
      amount: minorToNumber(amountMinor, currency),
      currency,
      amount_base_huf: minorToNumber(baseTotalMinor, "HUF"),
      fx_rate_used: fxRate,
      spent_at: spentAtIso,
      paid_by: payerId,
      is_personal: personal,
      tip: tipMinor === null ? null : minorToNumber(tipMinor, currency),
      fee: feeMinor === null ? null : minorToNumber(feeMinor, currency),
      note: noteWithFx === "" ? null : noteWithFx,
      status: "confirmed",
      day_number: day,
    };

    setSaving(true);
    const offline = typeof navigator !== "undefined" && !navigator.onLine;

    if (offline) {
      void (async () => {
        const op = await enqueue("expenses", "insert", rowPayload);
        if (!personal) await cacheSnapshot(`expense-splits:${op.id}`, planOrErr);
        onOfflineTemp({
          id: op.id,
          trip_id: tripId,
          title: rowPayload.title,
          category,
          amount: rowPayload.amount,
          currency,
          amount_base_huf: rowPayload.amount_base_huf,
          fx_rate_used: fxRate,
          spent_at: spentAtIso,
          paid_by: payerId,
          is_personal: personal,
          tip: rowPayload.tip,
          fee: rowPayload.fee,
          note: rowPayload.note,
          status: "pending",
          day_number: day,
        });
        pushOfflineToast();
        setSaving(false);
        reset();
        onClose();
      })();
      return;
    }

    startTransition(async () => {
      const result = await createExpenseAction({
        title: rowPayload.title,
        category,
        amountMinor,
        currency,
        amountBaseHufMinor: baseTotalMinor,
        fxRateUsed: fxRate,
        paidBy: payerId,
        isPersonal: personal,
        dayNumber: day,
        spentAtIso,
        tipMinor,
        feeMinor,
        note: rowPayload.note,
        plan: planOrErr,
      });
      setSaving(false);
      if (!result.ok) {
        setErrCode(result.error);
        return;
      }
      onSaved();
      reset();
      onClose();
    });
  }

  function pushOfflineToast(): void {
    pushToast({ message: t("money.form.offlineQueuedToast"), type: "info" });
  }

  const exactEntered = participantIds.reduce((acc, id) => {
    const raw = exactTexts[id] ?? "";
    return acc + (raw.trim() === "" ? 0 : parseAmount(raw, currency) ?? 0);
  }, 0);
  const percentEntered = participantIds.reduce(
    (acc, id) => acc + (Number((percentTexts[id] ?? "").replace(",", ".")) || 0),
    0,
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={t("money.form.title")}>
      <div className="flex flex-col gap-4 pb-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("money.form.titleLabel")}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("money.form.titlePlaceholder")}
            className={inputClass()}
          />
        </label>

        <div>
          <p className="mb-1 text-xs font-semibold text-text-muted">{t("money.form.categoryLabel")}</p>
          <div role="radiogroup" aria-label={t("money.form.categoryLabel")} className="grid grid-cols-4 gap-1">
            {EXPENSE_CATEGORIES.map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={category === code}
                onClick={() => setCategory(code)}
                className={clsx(
                  "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 transition-colors",
                  category === code ? "border-brand bg-brand-soft" : "border-border bg-surface active:opacity-80",
                )}
              >
                <ExpenseCategoryIcon category={code} size={28} selected={category === code} />
                <span className="text-[11px] font-semibold text-text-secondary">
                  {expenseCategoryLabel(code)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold text-text-muted">{t("money.form.amountLabel")}</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              placeholder={t("money.form.amountPlaceholder")}
              aria-label={t("money.form.amountLabel")}
              className={clsx(inputClass(), "flex-1 text-lg font-bold tnum")}
            />
            <div
              role="radiogroup"
              aria-label={currency}
              className="grid grid-cols-2 gap-1 rounded-xl bg-surface-raised p-1"
            >
              {CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={currency === code}
                  onClick={() => setCurrency(code)}
                  className={clsx(
                    "min-h-10 min-w-14 rounded-lg px-2 text-xs font-bold transition-[background-color,color]",
                    currency === code ? "bg-brand text-brand-contrast" : "text-text-secondary",
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        </div>

        {needsManualRate && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-warning">{t("money.form.manualRateLabel", { currency })}</span>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={manualRateText}
                onChange={(e) => setManualRateText(e.target.value)}
                placeholder={`1 ${currency} = ? HUF`}
                className={inputClass("tnum")}
              />
            </label>
            <p className="mt-1 text-xs leading-5 text-text-secondary">{t("money.form.manualRateHint")}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text-muted">{t("money.form.payerLabel")}</span>
            <select
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className={inputClass("font-semibold")}
            >
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text-muted">{t("money.form.dayLabel")}</span>
            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className={inputClass("font-semibold")}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {t("money.dayGroup", { day: n })}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 rounded-xl bg-surface p-3 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={personal}
            onChange={(e) => setPersonal(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-[var(--color-brand)]"
          />
          <span>
            <span className="block font-semibold text-text-primary">{t("money.form.personalLabel")}</span>
            {t("money.form.personalHint")}
          </span>
        </label>

        {!personal && (
          <>
            <div>
              <p className="mb-1 text-xs font-semibold text-text-muted">{t("money.form.participantsLabel")}</p>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const isPayer = m.user_id === payerId;
                  const active = participants.has(m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      aria-pressed={active}
                      disabled={isPayer}
                      onClick={() =>
                        setParticipants((prev) => {
                          const next = new Set(prev);
                          if (next.has(m.user_id)) next.delete(m.user_id);
                          else next.add(m.user_id);
                          return next;
                        })
                      }
                      className={clsx(
                        "min-h-12 rounded-full border px-3 text-sm font-semibold transition-colors",
                        active || isPayer
                          ? "border-brand bg-brand-soft text-brand-strong"
                          : "border-border bg-surface text-text-muted",
                        isPayer && "cursor-default",
                      )}
                    >
                      {m.full_name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-text-muted">{t("money.form.participantsHint")}</p>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-text-muted">{t("money.form.splitLabel")}</p>
              <div role="radiogroup" aria-label={t("money.form.splitLabel")} className="grid grid-cols-4 gap-1 rounded-xl bg-surface-raised p-1">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={method === m}
                    onClick={() => setMethod(m)}
                    className={clsx(
                      "min-h-12 rounded-lg px-1 text-sm font-bold transition-[background-color,color]",
                      method === m ? "bg-brand text-brand-contrast" : "text-text-secondary",
                    )}
                  >
                    {SPLIT_LABELS[m]}
                  </button>
                ))}
              </div>

              {method === "exact" && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <p className="text-xs text-text-muted">
                    {t("money.form.exactSumLabel", {
                      total: formatMoney(minorToNumber(totalMinor, currency), currency),
                    })}
                  </p>
                  {participantIds.map((id) => (
                    <div key={id} className="flex items-center gap-2">
                      <span className="min-w-16 flex-1 truncate text-sm text-text-secondary">
                        {members.find((m) => m.user_id === id)?.full_name}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        value={exactTexts[id] ?? ""}
                        onChange={(e) => setExactTexts((prev) => ({ ...prev, [id]: e.target.value }))}
                        aria-label={`${SPLIT_LABELS.exact} ${members.find((m) => m.user_id === id)?.full_name ?? ""}`}
                        className={clsx(inputClass(), "max-w-32 tnum")}
                      />
                    </div>
                  ))}
                </div>
              )}

              {method === "percent" && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <p className="text-xs text-text-muted">
                    {t("money.form.percentLabel")} · {percentEntered}%
                  </p>
                  {participantIds.map((id) => (
                    <div key={id} className="flex items-center gap-2">
                      <span className="min-w-16 flex-1 truncate text-sm text-text-secondary">
                        {members.find((m) => m.user_id === id)?.full_name}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        value={percentTexts[id] ?? ""}
                        onChange={(e) => setPercentTexts((prev) => ({ ...prev, [id]: e.target.value }))}
                        aria-label={`${t("money.split.percent")} ${members.find((m) => m.user_id === id)?.full_name ?? ""}`}
                        className={clsx(inputClass(), "max-w-32 tnum")}
                      />
                    </div>
                  ))}
                </div>
              )}

              {method === "shares" && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <p className="text-xs text-text-muted">{t("money.form.sharesLabel")}</p>
                  {participantIds.map((id) => (
                    <div key={id} className="flex items-center gap-2">
                      <span className="min-w-16 flex-1 truncate text-sm text-text-secondary">
                        {members.find((m) => m.user_id === id)?.full_name}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        value={shareTexts[id] ?? ""}
                        onChange={(e) => setShareTexts((prev) => ({ ...prev, [id]: e.target.value }))}
                        aria-label={`${t("money.split.shares")} ${members.find((m) => m.user_id === id)?.full_name ?? ""}`}
                        className={clsx(inputClass(), "max-w-32 tnum")}
                      />
                    </div>
                  ))}
                </div>
              )}

              {method === "exact" && exactEntered !== totalMinor && totalMinor > 0 && (
                <p className="mt-1 text-xs font-semibold text-warning">
                  {formatMoney(minorToNumber(totalMinor - exactEntered, currency), currency)}
                </p>
              )}
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text-muted">{t("money.form.tipLabel")}</span>
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={tipText}
              onChange={(e) => setTipText(e.target.value)}
              className={inputClass("tnum")}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text-muted">{t("money.form.feeLabel")}</span>
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={feeText}
              onChange={(e) => setFeeText(e.target.value)}
              className={inputClass("tnum")}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("money.form.noteLabel")}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={clsx(inputClass(), "min-h-16 resize-none")}
          />
        </label>

        <p className="text-xs text-text-muted">
          {t("money.recordedNow")} · {t("money.form.noReceiptNote")}
        </p>

        {errCode && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {ERROR_LABELS[errCode] ?? t("money.errors.generic")}
          </p>
        )}

        <Button block onClick={handleSave} loading={saving || undefined}>
          {t("money.form.save")}
        </Button>
      </div>
    </BottomSheet>
  );
}
