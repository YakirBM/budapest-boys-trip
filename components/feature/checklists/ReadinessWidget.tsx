"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import type { ChecklistBoard, ChecklistItemRow } from "@/lib/data/checklists";

export interface ReadinessWidgetProps {
  board: Pick<ChecklistBoard, "lists" | "items">;
  members: { user_id: string; full_name: string }[];
  /** The readiness list (defaults to the first list = pre-flight by sort order). */
  listId?: string;
  /** Per-group mode (docs/14 §4): aggregate across these list ids instead. */
  listIds?: string[];
  /** Override the widget title (per-group readiness titles live under checklists.groups.*). */
  title?: string;
  className?: string;
}

function progressOf(items: ChecklistItemRow[]): { done: number; total: number; pct: number } {
  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/**
 * Pre-flight readiness widget (docs/06-features/06 §Progress & readiness).
 * Overall % of the pre-flight list + one mini-bar per member over their
 * assigned items + the single most urgent open critical item.
 * Exported for the Today dashboard — keep it a pure component over props.
 */
export function ReadinessWidget({ board, members, listId, listIds, title, className }: ReadinessWidgetProps) {
  const targetLists = useMemo(() => {
    if (listIds && listIds.length > 0) {
      const wanted = new Set(listIds);
      const matched = board.lists.filter((l) => wanted.has(l.id));
      return matched.length > 0 ? matched : [];
    }
    const single = board.lists.find((l) => l.id === listId) ?? board.lists[0];
    return single ? [single] : [];
  }, [board.lists, listId, listIds]);
  const targetList = targetLists[0];
  const listItems = useMemo(() => {
    if (targetLists.length === 0) return [];
    const wanted = new Set(targetLists.map((l) => l.id));
    return board.items.filter((i) => wanted.has(i.checklist_id));
  }, [board.items, targetLists]);
  const overall = progressOf(listItems);

  const memberBars = useMemo(() => {
    return members
      .map((m) => ({
        member: m,
        progress: progressOf(listItems.filter((i) => i.assignee_id === m.user_id)),
      }))
      .filter((entry) => entry.progress.total > 0);
  }, [listItems, members]);

  const urgent = useMemo(() => {
    const open = listItems.filter((i) => i.status !== "done" && i.priority === "critical");
    return (
      open.sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"))[0] ?? null
    );
  }, [listItems]);

  if (!targetList) return null;

  const heading = title ?? t("checklists.readiness.title");
  const contextLabel =
    targetLists.length === 1 ? targetList.title : targetLists.map((l) => l.title).join(", ");

  return (
    <Card className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text-primary">{heading}</h2>
        <span className="text-xs font-bold text-brand" dir="ltr">
          {t("checklists.readiness.overall", { pct: overall.pct })}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={overall.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("checklists.progressAria", { done: overall.done, total: overall.total })}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-raised"
      >
        <span className="block h-full rounded-full bg-brand" style={{ width: `${overall.pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-text-muted" dir="ltr">
        {t("checklists.progressLabel", { done: overall.done, total: overall.total })} · {contextLabel}
      </p>

      {memberBars.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {memberBars.map(({ member, progress }) => (
            <li key={member.user_id} className="flex items-center gap-2">
              <span className="min-w-20 flex-1 truncate text-xs font-semibold text-text-secondary">
                {member.full_name}
              </span>
              <span
                role="progressbar"
                aria-valuenow={progress.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("checklists.readiness.memberAria", { name: member.full_name, pct: progress.pct })}
                className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-raised"
              >
                <span className="block h-full rounded-full bg-brand" style={{ width: `${progress.pct}%` }} />
              </span>
              <span className="tnum text-xs text-text-muted" dir="ltr">
                {t("checklists.progressLabel", { done: progress.done, total: progress.total })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 rounded-lg bg-surface-raised px-3 py-2">
        {urgent ? (
          <p className="flex items-center gap-2 text-sm text-text-primary">
            <AlertTriangle aria-hidden size={16} className="shrink-0 text-warning" />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-bold">{t("checklists.readiness.urgentLabel")}</span>{" "}
              {urgent.title}
            </span>
          </p>
        ) : (
          <p className="text-sm text-text-secondary">{t("checklists.readiness.urgentEmpty")}</p>
        )}
      </div>

      <Link
        href="/checklists"
        className="mt-3 inline-flex min-h-12 items-center rounded-lg text-sm font-bold text-brand transition-opacity active:opacity-80"
      >
        {t("common.seeDetails")}
      </Link>
    </Card>
  );
}
