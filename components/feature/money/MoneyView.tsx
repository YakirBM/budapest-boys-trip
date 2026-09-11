"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { MemberAvatar } from "@/components/ui/MemberAvatar";
import { pushToast } from "@/components/ui/Toast";
import { deleteExpenseAction, settleTripAction } from "@/lib/actions/money";
import { enqueue } from "@/lib/offline/db";
import { useOutboxSync } from "@/lib/offline/useOutboxSync";
import { TZ_BUDAPEST, formatInTz } from "@/lib/utils/time";
import { isCurrency } from "@/lib/utils/money";
import { CURRENCIES } from "@/lib/utils/money";
import { ExpenseForm } from "./ExpenseForm";
import { ConverterSheet } from "./ConverterSheet";
import { Reports } from "./Reports";
import { ExpenseStatusChip, ExpenseCategoryIcon, expenseCategoryLabel } from "./visuals";
import { reconcileExpenseSplits } from "./offlineReconcile";
import { fetchBalancesPayload, fetchExpensesPayload } from "./clientBoard";
import {
  buildBalanceBreakdownList,
  buildBalanceText,
  buildExpensePaidLine,
  buildExpenseSplitLine,
  buildTransferParticipants,
  buildTransferReason,
  splitTemplate,
} from "./wording";
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

/** Render a translated template, injecting LTR-isolated nodes for amounts. */
function renderTemplate(
  template: string,
  values: Record<string, ReactNode>,
  ltrKeys: ReadonlySet<string> = new Set(["amount", "rate", "result"]),
): ReactNode {
  const parts = splitTemplate(template);
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "text") return <span key={i}>{part.value}</span>;
        const node = values[part.key];
        if (ltrKeys.has(part.key)) {
          return (
            <span key={i} dir="ltr" className="tnum ltr-iso whitespace-nowrap">
              {node}
            </span>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

/**
 * Money screen (docs/14 §5): full-sentence balances/transfers/expenses with
 * 28px round avatars, live converter, CSS-only reports, counterpart names.
 * Offline: IndexedDB snapshots + outbox + split re-attach on reconnect.
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

  /** Attribute a settlement transfer to its most recent shared expense. */
  function attributeTransfer(fromUser: string, toUser: string): { title: string; count: number } | null {
    for (const e of expensesQ.data.expenses) {
      if (e.is_personal || e.paid_by !== toUser) continue;
      const parts = splitsOf(e.id).map((s) => s.member_id);
      const involves = parts.length > 0 ? parts.includes(fromUser) : true;
      if (!involves) continue;
      return { title: e.title, count: parts.length > 0 ? parts.length : 2 };
    }
    return null;
  }

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
  const loadFailed = expensesQ.isError || balancesQ.isError;

  return (
    <>
      {loadFailed && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger/10 px-3 py-2" role="alert">
          <span className="text-xs font-semibold text-danger">{t("money.loadError")}</span>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex min-h-12 items-center rounded-lg px-2 text-xs font-bold text-danger"
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {/* Stats */}
      <section aria-label={t("money.title")} className="mb-4 grid grid-cols-2 gap-2">
        <Card className="min-w-0 overflow-hidden p-3 sm:p-4 flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("money.myTotal")}</span>
          <span dir="ltr" className="tnum truncate text-base font-bold text-text-primary min-[380px]:text-xl">
            {formatMoney(stats.myShared, "HUF")}
          </span>
          <span className="text-xs text-text-muted">
            {t("money.personalTotal")}:{" "}
            <span dir="ltr" className="tnum">{formatMoney(stats.personal, "HUF")}</span>
          </span>
        </Card>
        <Card className="min-w-0 overflow-hidden p-3 sm:p-4 flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("money.groupTotal")}</span>
          <span dir="ltr" className="tnum truncate text-base font-bold text-text-primary min-[380px]:text-xl">
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

      {/* Balances — full sentences with avatars (docs/14 §5.1) */}
      <Card className="mb-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
            const name = nameOf.get(b.user_id) ?? "—";
            const amountFormatted = formatMoney(Math.abs(net), "HUF");
            const debts = transfers
              .filter((s) => s.from_user === b.user_id)
              .map((s) => ({
                name: nameOf.get(s.to_user) ?? "—",
                amountFormatted: formatMoney(s.amount_base_huf, "HUF"),
              }));
            const breakdownList = debts.length > 0 ? buildBalanceBreakdownList(debts) : undefined;
            const sentence = buildBalanceText({ netHuf: net, name, amountFormatted, breakdownList });
            const template =
              net > 0
                ? t("money.balances.owedTo")
                : net < 0
                  ? breakdownList
                    ? t("money.balances.breakdownWrap")
                    : t("money.balances.owesDetail")
                  : t("money.balances.settledClean");
            return (
              <li
                key={b.user_id}
                className="flex items-center gap-2.5 rounded-lg bg-surface-raised px-3 py-2"
              >
                <MemberAvatar name={name} size={28 as 32} />
                <span className="min-w-0 flex-1 text-sm leading-6 text-text-primary" aria-label={sentence}>
                  {net > 0 &&
                    renderTemplate(template, { name, amount: amountFormatted })}
                  {net < 0 &&
                    (breakdownList
                      ? renderTemplate(template, {
                          base: renderTemplate(t("money.balances.owesDetail"), {
                            name,
                            amount: amountFormatted,
                          }),
                          list: breakdownList,
                        })
                      : renderTemplate(template, { name, amount: amountFormatted }))}
                  {net === 0 && <span>{sentence}</span>}
                </span>
                <span
                  aria-hidden
                  dir="ltr"
                  className={`tnum shrink-0 whitespace-nowrap text-sm font-bold ${net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-text-muted"}`}
                >
                  {net === 0 ? "" : amountFormatted}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Settlement plan — payer + counterparties + reason */}
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
              const fromName = nameOf.get(transfer.from_user) ?? "—";
              const toName = nameOf.get(transfer.to_user) ?? "—";
              const amountFormatted = formatMoney(transfer.amount_base_huf, "HUF");
              const attributed = attributeTransfer(transfer.from_user, transfer.to_user);
              const reason = buildTransferReason(attributed?.title ?? null);
              const participantCount = attributed?.count ?? members.length;
              const participantsLine = buildTransferParticipants(participantCount);
              const aria = `${fromName} → ${toName} · ${amountFormatted} · ${reason} · ${participantsLine}`;
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-lg bg-surface-raised px-3 py-2"
                >
                  <span className="flex shrink-0 items-center">
                    <MemberAvatar name={fromName} size={28 as 32} />
                    <DirectionalIcon icon={ArrowRight} size={14} className="mx-1 text-text-muted" />
                    <MemberAvatar name={toName} size={28 as 32} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm leading-6 text-text-primary" aria-label={aria}>
                    <span className="font-semibold">{fromName}</span>
                    <DirectionalIcon icon={ArrowRight} size={14} className="mx-1 inline text-text-muted" />
                    <span className="font-semibold">{toName}</span>
                    {" · "}
                    <span dir="ltr" className="tnum ltr-iso whitespace-nowrap font-bold">
                      {amountFormatted}
                    </span>
                    {" · "}
                    <span className="text-text-secondary">{reason}</span>
                    {" · "}
                    <span className="text-xs text-text-muted">{participantsLine}</span>
                  </span>
                  <button
                    type="button"
                    disabled={paid}
                    aria-label={t("money.markTransferAria", { from: fromName, to: toName })}
                    onClick={() => markTransferPaid(key)}
                    className={
                      paid
                        ? "inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg bg-success/12 px-3 text-xs font-bold text-success"
                        : "inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg border border-border px-3 text-xs font-bold text-text-secondary transition-opacity active:opacity-80"
                    }
                  >
                    {paid ? t("money.transfer.paidDone") : t("money.markTransferPaid")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Reports — CSS-only donut + bars + per-member (docs/14 §5.4) */}
      <Reports expenses={expensesQ.data.expenses} members={members} nameOf={nameOf} />

      {/* Expense feed — payer + counterpart names + reason + day/time */}
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
                    const splitIds = splitsOf(e.id).map((s) => s.member_id);
                    const payerName = nameOf.get(e.paid_by) ?? "—";
                    const participantNames =
                      splitIds.length > 0
                        ? splitIds.map((id) => nameOf.get(id) ?? "—")
                        : [payerName];
                    const participantCount = participantNames.length;
                    const paidAmount = formatMoney(e.amount, cur as (typeof CURRENCIES)[number]);
                    const paidLine = buildExpensePaidLine(payerName, paidAmount);
                    const splitLine = buildExpenseSplitLine(participantNames, participantCount);
                    const time = timeFormatter(e.spent_at);
                    const aria = `${e.title} · ${paidLine} · ${splitLine}`;
                    return (
                      <li
                        key={e.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 rounded-xl border border-border bg-surface p-3 min-[380px]:grid-cols-[auto_minmax(0,1fr)_auto]"
                      >
                        <ExpenseCategoryIcon category={e.category} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-text-primary" title={e.title}>{e.title}</p>
                          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-text-muted" aria-label={aria}>
                            <MemberAvatar name={payerName} size={28 as 32} />
                            <span className="min-w-0">
                              {renderTemplate(t("money.expense.paidLine"), {
                                name: payerName,
                                amount: paidAmount,
                              })}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-xs text-text-muted">
                            {renderTemplate(
                              participantCount <= 1 ? t("money.expense.splitSingle") : t("money.expense.splitAmong"),
                              participantCount <= 1
                                ? { names: participantNames.join(", ") }
                                : { names: participantNames.join(", "), count: participantCount },
                              new Set(["count"]),
                            )}
                            {" · "}
                            {e.day_number !== null ? (
                              <>
                                {t("money.dayGroup", { day: e.day_number })} ·{" "}
                                <span dir="ltr" className="tnum ltr-iso">{time}</span>{" "}
                                <span dir="ltr" className="tnum">HU</span>
                              </>
                            ) : (
                              <>
                                <span dir="ltr" className="tnum ltr-iso">{time}</span>{" "}
                                <span dir="ltr" className="tnum">HU</span>
                              </>
                            )}
                            {" · "}
                            {expenseCategoryLabel(e.category)}
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
                        <div className="col-span-2 flex min-w-0 flex-row items-center justify-between gap-2 ps-12 min-[380px]:col-span-1 min-[380px]:flex-col min-[380px]:items-end min-[380px]:ps-0">
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
                              className="inline-flex h-12 w-12 items-center justify-center rounded-lg text-text-muted transition-colors active:text-danger"
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
        onRefresh={refresh}
        stale={stale}
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
