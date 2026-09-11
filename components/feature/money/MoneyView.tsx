"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { Fab } from "@/components/ui/FAB";
import { formatMoney, MoneyAmount } from "@/components/ui/MoneyAmount";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { EstimateBadge } from "@/components/ui/EstimateBadge";
import { QuickActionBar } from "@/components/ui/QuickActionBar";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
import { pushToast } from "@/components/ui/Toast";
import { deleteExpenseAction, settleTripAction } from "@/lib/actions/money";
import { enqueue } from "@/lib/offline/db";
import { useOutboxSync } from "@/lib/offline/useOutboxSync";
import { TZ_BUDAPEST, formatInTz } from "@/lib/utils/time";
import { CURRENCIES, isCurrency } from "@/lib/utils/money";
import { ExpenseForm } from "./ExpenseForm";
import { ConverterSheet } from "./ConverterSheet";
import { ExpenseStatusChip, ExpenseCategoryIcon, expenseCategoryLabel } from "./visuals";
import { reconcileExpenseSplits } from "./offlineReconcile";
import { fetchBalancesPayload, fetchExpensesPayload } from "./clientBoard";
import type { ExpenseRow } from "@/lib/data/money";
import type { TripMember } from "@/lib/data/trip";

export interface MoneyViewProps {
  tripId: string;
  initial: {
    expenses: ExpenseRow[];
    splits: Awaited<ReturnType<typeof fetchExpensesPayload>>["splits"];
    rates: Awaited<ReturnType<typeof fetchExpensesPayload>>["rates"];
    balances: Awaited<ReturnType<typeof fetchBalancesPayload>>["balances"];
    settlements: Awaited<ReturnType<typeof fetchBalancesPayload>>["settlements"];
  };
  members: TripMember[];
  userId: string;
  isOwner: boolean;
  /** Current trip day clamped server-side (docs/00 rule 1). */
  defaultDay: number;
}

const timeFormatter = (iso: string): string =>
  formatInTz(new Date(iso), TZ_BUDAPEST, { hour: "2-digit", minute: "2-digit" });

/**
 * Money screen (docs/06-features/05-finance.md): stats, live FX caption,
 * balances, minimal-transfer settlement, day-grouped expense feed, FAB entry
 * and the FX converter. Offline: reads come from IndexedDB snapshots, entries
 * queue through the outbox, splits re-attach on reconnect.
 */
export function MoneyView({ tripId, initial, members, userId, isOwner, defaultDay }: MoneyViewProps) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [converterOpen, setConverterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [settleConfirmOpen, setSettleConfirmOpen] = useState(false);
  const [settleLoading, setSettleLoading] = useState(false);
  const [paidTransfers, setPaidTransfers] = useState<Set<string>>(() => new Set());
  const reconciledOnce = useRef(false);

  const expensesQ = useQuery({
    queryKey: ["expenses", tripId],
    queryFn: fetchExpensesPayload,
    initialData: { expenses: initial.expenses, splits: initial.splits, rates: initial.rates, stale: false },
  });
  const balancesQ = useQuery({
    queryKey: ["balances", tripId],
    queryFn: () => fetchBalancesPayload(tripId),
    initialData: { balances: initial.balances, settlements: initial.settlements, stale: false },
  });

  const stale = expensesQ.data.stale || balancesQ.data.stale;

  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: ["expenses", tripId] });
    void queryClient.invalidateQueries({ queryKey: ["balances", tripId] });
  }

  // Reconnect: after the outbox flushes, attach parked split plans, then refresh.
  useOutboxSync((pending) => {
    if (pending === 0) {
      void reconcileExpenseSplits().then(refresh);
    }
  });
  useEffect(() => {
    if (reconciledOnce.current) return;
    reconciledOnce.current = true;
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void reconcileExpenseSplits().then(refresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.user_id, m.full_name);
    return map;
  }, [members]);

  const stats = useMemo(() => {
    let myShared = 0;
    let group = 0;
    let personal = 0;
    let unsettled = 0;
    for (const e of expensesQ.data.expenses) {
      if (e.is_personal) {
        if (e.paid_by === userId) personal += e.amount_base_huf ?? e.amount;
        continue;
      }
      const base = e.amount_base_huf ?? e.amount;
      group += base;
      if (e.paid_by === userId) myShared += base;
      if (e.status === "confirmed") unsettled += 1;
    }
    return { myShared, group, personal, unsettled };
  }, [expensesQ.data.expenses, userId]);

  const dayGroups = useMemo(() => {
    const groups = new Map<string, ExpenseRow[]>();
    for (const e of expensesQ.data.expenses) {
      const key = e.day_number === null ? "none" : String(e.day_number);
      const list = groups.get(key);
      if (list) list.push(e);
      else groups.set(key, [e]);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === "none") return 1;
      if (b === "none") return -1;
      return Number(a) - Number(b);
    });
  }, [expensesQ.data.expenses]);

  const splitsOf = (expenseId: string) => expensesQ.data.splits.filter((s) => s.expense_id === expenseId);
  const ilsRate = expensesQ.data.rates.find((r) => r.base === "HUF" && r.quote === "ILS");

  function onOfflineTemp(expense: ExpenseRow): void {
    queryClient.setQueryData< Awaited<ReturnType<typeof fetchExpensesPayload>> >(
      ["expenses", tripId],
      (old) =>
        old
          ? { ...old, expenses: [expense, ...old.expenses] }
          : { expenses: [expense], splits: [], rates: [], stale: false },
    );
  }

  function confirmDelete(): void {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteLoading(true);
    void deleteExpenseAction(target.id)
      .then((result) => {
        setDeleteLoading(false);
        setDeleteTarget(null);
        if (!result.ok) {
          pushToast({
            message: result.error === "money.errors.forbidden" ? t("money.errors.forbidden") : t("money.errors.generic"),
            type: "danger",
          });
          return;
        }
        pushToast({ message: t("money.deletedToast"), type: "success" });
        refresh();
      })
      .catch(() => {
        setDeleteLoading(false);
        pushToast({ message: t("money.errors.generic"), type: "danger" });
      });
  }

  function confirmSettle(): void {
    setSettleLoading(true);
    void settleTripAction()
      .then((result) => {
        setSettleLoading(false);
        setSettleConfirmOpen(false);
        if (!result.ok) {
          pushToast({ message: t("money.errors.forbidden"), type: "danger" });
          return;
        }
        pushToast({ message: t("money.settledToast"), type: "success" });
        refresh();
      })
      .catch(() => {
        setSettleLoading(false);
        setSettleConfirmOpen(false);
        pushToast({ message: t("money.errors.generic"), type: "danger" });
      });
  }

  function markTransferPaid(key: string): void {
    setPaidTransfers((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    pushToast({ message: t("money.transferPaidToast"), type: "info" });
    // Audit trail for the informal "paid" mark (append-only, offline-safe).
    void enqueue("app_events", "insert", {
      trip_id: tripId,
      action: "money.transfer_marked_paid",
      entity: "settlement_transfer",
      entity_id: null,
      meta: { key },
    });
  }

  const transfers = balancesQ.data.settlements;
  const balances = balancesQ.data.balances.filter((b) => nameOf.has(b.user_id));

  return (
    <>
      {/* Stats */}
      <section aria-label={t("money.title")} className="mb-4 grid grid-cols-2 gap-2">
        <Card className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("money.myTotal")}</span>
          <span dir="ltr" className="tnum text-xl font-bold text-text-primary">
            {formatMoney(stats.myShared, "HUF")}
          </span>
          <span className="text-xs text-text-muted">
            {t("money.personalTotal")}:{" "}
            <span dir="ltr" className="tnum">{formatMoney(stats.personal, "HUF")}</span>
          </span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("money.groupTotal")}</span>
          <span dir="ltr" className="tnum text-xl font-bold text-text-primary">
            {formatMoney(stats.group, "HUF")}
          </span>
          <span className="text-xs text-text-muted">
            {t("money.recentTitle")}: {expensesQ.data.expenses.length}
          </span>
        </Card>
      </section>

      {/* FX caption — always source + timestamp (rule 5) */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {ilsRate && !stale && (
          <>
            <span>
              {t("money.fx.caption", { rate: String(ilsRate.rate), quote: ilsRate.quote })}
            </span>
            <EstimateBadge source={ilsRate.source} lastVerifiedAt={ilsRate.fetched_at} />
          </>
        )}
        {ilsRate && stale && (
          <span className="rounded-full bg-warning/12 px-2.5 py-1 font-semibold text-warning">
            {t("money.fx.stale")}
          </span>
        )}
        {!ilsRate && <span>{t("money.fx.missing")}</span>}
      </div>

      <div className="mb-4">
        <QuickActionBar
          itemId="money-actions"
          actions={[
            {
              id: "converter",
              label: t("money.converterOpen"),
              icon: <span aria-hidden className="text-base font-bold">₪</span>,
              onClick: () => setConverterOpen(true),
            },
          ]}
        />
      </div>

      {/* Balances */}
      <Card className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-text-primary">{t("money.balancesTitle")}</h2>
          {isOwner && (
            <button
              type="button"
              onClick={() => setSettleConfirmOpen(true)}
              className="inline-flex min-h-12 items-center rounded-lg px-2 text-sm font-bold text-brand transition-opacity active:opacity-80"
            >
              {t("money.closeSettlement")}
            </button>
          )}
        </div>
        <p className="mb-2 text-xs text-text-muted">{t("money.balancesHint")}</p>
        <ul className="flex flex-col gap-1.5">
          {balances.map((b) => {
            const net = Math.round(b.net_base_huf);
            const label =
              net > 0 ? t("money.owed") : net < 0 ? t("money.owes") : t("money.even");
            return (
              <li key={b.user_id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-raised px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                  {nameOf.get(b.user_id) ?? "—"}
                </span>
                <span
                  className={netToneClass(net)}
                  aria-label={`${label}: ${formatMoney(Math.abs(net), "HUF")}`}
                >
                  {label}
                </span>
                <span dir="ltr" className="tnum text-sm font-bold text-text-primary">
                  {formatMoney(Math.abs(net), "HUF")}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Settlement plan */}
      <Card className="mb-4">
        <h2 className="text-base font-semibold text-text-primary">{t("money.settlementTitle")}</h2>
        <p className="mb-2 text-xs text-text-muted">{t("money.settlementHint")}</p>
        {transfers.length === 0 ? (
          <div className="rounded-lg bg-surface-raised px-3 py-4 text-center">
            <p className="text-sm font-semibold text-text-primary">{t("money.settlementEmpty")}</p>
            <p className="text-xs text-text-muted">{t("money.settlementEmptyHint")}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {transfers.map((transfer) => {
              const key = `${transfer.from_user}->${transfer.to_user}->${transfer.amount_base_huf}`;
              const paid = paidTransfers.has(key);
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-lg bg-surface-raised px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    <span className="font-semibold">{nameOf.get(transfer.from_user) ?? "—"}</span>
                    <DirectionalIcon icon={ArrowRight} size={14} className="mx-1 inline text-text-muted" />
                    <span className="font-semibold">{nameOf.get(transfer.to_user) ?? "—"}</span>
                  </span>
                  <MoneyAmount amount={transfer.amount_base_huf} currency="HUF" size="sm" />
                  <button
                    type="button"
                    disabled={paid}
                    aria-label={t("money.markTransferAria")}
                    onClick={() => markTransferPaid(key)}
                    className={
                      paid
                        ? "inline-flex min-h-10 items-center rounded-lg bg-success/12 px-2 text-xs font-bold text-success"
                        : "inline-flex min-h-10 items-center rounded-lg border border-border px-2 text-xs font-bold text-text-secondary transition-opacity active:opacity-80"
                    }
                  >
                    {paid ? "✓" : t("money.markTransferPaid")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Expense feed */}
      <section aria-label={t("money.recentTitle")}>
        <h2 className="mb-2 text-base font-semibold text-text-primary">{t("money.recentTitle")}</h2>
        {expensesQ.data.expenses.length === 0 ? (
          <EmptyState
            illustration="money"
            title={t("money.empty")}
            hint={t("money.emptyHint")}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {dayGroups.map(([key, list]) => (
              <div key={key}>
                <h3 className="mb-1.5 text-xs font-bold text-text-muted">
                  {key === "none" ? t("money.noDay") : t("money.dayGroup", { day: Number(key) })}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {list.map((e) => {
                    const cur: string = isCurrency(e.currency) ? e.currency : "HUF";
                    const base = e.amount_base_huf ?? e.amount;
                    const participantCount = splitsOf(e.id).length;
                    return (
                      <li
                        key={e.id}
                        className="flex items-center gap-2.5 rounded-xl border border-border bg-surface p-3"
                      >
                        <ExpenseCategoryIcon category={e.category} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-text-primary">{e.title}</p>
                          <p className="truncate text-xs text-text-muted">
                            {nameOf.get(e.paid_by) ?? "—"} · {timeFormatter(e.spent_at)} ·{" "}
                            {expenseCategoryLabel(e.category)}
                            {!e.is_personal && participantCount > 0 && (
                              <>
                                {" · "}
                                {participantCount === 1
                                  ? t("money.participantsLineOne")
                                  : t("money.participantsLine", { count: participantCount })}
                              </>
                            )}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <ExpenseStatusChip status={e.status} />
                            {e.is_personal && (
                              <span className="inline-flex items-center rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-bold text-text-muted">
                                {t("money.personalChip")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <MoneyAmount
                            amount={e.amount}
                            currency={cur as (typeof CURRENCIES)[number]}
                            convertedTo={
                              cur === "HUF" ? undefined : { amount: base, currency: "HUF" }
                            }
                            size="sm"
                          />
                          {(e.paid_by === userId || isOwner) && (
                            <button
                              type="button"
                              aria-label={`${t("common.delete")}: ${e.title}`}
                              onClick={() => setDeleteTarget(e)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors active:text-danger"
                            >
                              <Trash2 aria-hidden size={18} />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <Fab label={t("money.addExpense")} onClick={() => setFormOpen(true)} />

      <ExpenseForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        tripId={tripId}
        members={members}
        userId={userId}
        rates={expensesQ.data.rates}
        defaultDay={defaultDay}
        onSaved={refresh}
        onOfflineTemp={onOfflineTemp}
      />

      <ConverterSheet
        open={converterOpen}
        onClose={() => setConverterOpen(false)}
        rates={expensesQ.data.rates}
      />

      <ConfirmSheet
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleteLoading}
        title={t("money.deleteTitle")}
        description={t("money.deleteDescription")}
        confirmLabel={t("common.delete")}
      />

      <ConfirmSheet
        open={settleConfirmOpen}
        onClose={() => setSettleConfirmOpen(false)}
        onConfirm={confirmSettle}
        loading={settleLoading}
        title={t("money.closeSettlementTitle")}
        description={t("money.closeSettlementDescription")}
        confirmLabel={t("money.closeSettlement")}
        danger={false}
      />
    </>
  );
}

/** Semantic text color for a net balance without any physical direction class. */
function netToneClass(net: number): string {
  if (net > 0) return "shrink-0 text-xs font-bold text-success";
  if (net < 0) return "shrink-0 text-xs font-bold text-danger";
  return "shrink-0 text-xs font-bold text-text-muted";
}
