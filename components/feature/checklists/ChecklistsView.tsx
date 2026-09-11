"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Lock,
  Plus,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { pushToast } from "@/components/ui/Toast";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cacheSnapshot, readSnapshot, enqueue } from "@/lib/offline/db";
import { addChecklistItemAction, type ChecklistPriorityValue } from "@/lib/actions/checklists";
import type {
  ChecklistBlockRow,
  ChecklistBoard,
  ChecklistItemRow,
  ChecklistListRow,
  ChecklistScope,
} from "@/lib/data/checklists";
import type { TripMember } from "@/lib/data/trip";
import { ReadinessWidget } from "./ReadinessWidget";

export interface ChecklistsViewProps {
  tripId: string;
  initialBoard: ChecklistBoard;
  members: TripMember[];
  userId: string;
}

interface BoardPayload {
  board: ChecklistBoard;
  stale: boolean;
}

type Tab = "mine" | "group" | "all";

/** Mirrors the DB enum checklist_priority (docs/03 §4.5). */
const CHECKLIST_PRIORITIES = ["critical", "important", "normal"] as const;

const PRIORITY_LABELS: Record<ChecklistPriorityValue, string> = {
  critical: t("checklists.priority.critical"),
  important: t("checklists.priority.important"),
  normal: t("checklists.priority.normal"),
};

const PRIORITY_TONES: Record<ChecklistPriorityValue, string> = {
  critical: "bg-danger/12 text-danger",
  important: "bg-warning/12 text-warning",
  normal: "bg-surface-raised text-text-muted",
};

const TAB_LABELS: Record<Tab, string> = {
  mine: t("checklists.tabs.mine"),
  group: t("checklists.tabs.group"),
  all: t("checklists.tabs.all"),
};

const dateFormatter = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" });

async function fetchBoard(tripId: string): Promise<BoardPayload> {
  const supabase = getSupabaseBrowserClient();
  try {
    const listsRes = await supabase
      .from("checklists")
      .select("id,title,scope,sort_order")
      .eq("trip_id", tripId)
      .order("sort_order");
    if (listsRes.error) throw listsRes.error;
    const lists = ((listsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      title: String(row["title"]),
      scope: String(row["scope"] ?? "group") as ChecklistScope,
      sort_order: Number(row["sort_order"] ?? 0),
    }));
    const listIds = lists.map((l) => l.id);

    if (listIds.length === 0) {
      const empty: BoardPayload = { board: { lists: [], items: [], blocks: [] }, stale: false };
      await cacheSnapshot("checklists", empty.board);
      return empty;
    }

    const [itemsRes, itemIdsRes] = await Promise.all([
      supabase
        .from("checklist_items")
        .select(
          "id,checklist_id,title,description,assignee_id,due_at,priority,status,blocked_by_id,link,sort_order,done_by,done_at",
        )
        .in("checklist_id", listIds)
        .order("sort_order"),
      supabase.from("checklist_items").select("id").in("checklist_id", listIds),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (itemIdsRes.error) throw itemIdsRes.error;

    const itemIds = ((itemIdsRes.data ?? []) as { id: string }[]).map((r) => r.id);
    const blocksRes =
      itemIds.length > 0
        ? await supabase
            .from("checklist_item_blocks")
            .select("item_id,blocked_by_item_id")
            .in("item_id", itemIds)
        : { data: [], error: null };
    if (blocksRes.error) throw blocksRes.error;

    const board: ChecklistBoard = {
      lists,
      items: ((itemsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        checklist_id: String(row["checklist_id"]),
        title: String(row["title"]),
        description: row["description"] === null ? null : String(row["description"]),
        assignee_id: row["assignee_id"] === null ? null : String(row["assignee_id"]),
        due_at: row["due_at"] === null ? null : String(row["due_at"]),
        priority: String(row["priority"] ?? "normal") as ChecklistItemRow["priority"],
        status: String(row["status"] ?? "not_started") as ChecklistItemRow["status"],
        blocked_by_id: row["blocked_by_id"] === null ? null : String(row["blocked_by_id"]),
        link: row["link"] === null ? null : String(row["link"]),
        sort_order: Number(row["sort_order"] ?? 0),
        done_by: row["done_by"] === null ? null : String(row["done_by"]),
        done_at: row["done_at"] === null ? null : String(row["done_at"]),
      })),
      blocks: ((blocksRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        item_id: String(row["item_id"]),
        blocked_by_item_id: String(row["blocked_by_item_id"]),
      })),
    };
    await cacheSnapshot("checklists", board);
    return { board, stale: false };
  } catch (err) {
    const snap = await readSnapshot<ChecklistBoard>("checklists");
    if (snap) return { board: snap.data, stale: true };
    throw err;
  }
}

function ProgressRow({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex min-w-24 flex-1 items-center gap-2">
      <span
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("checklists.progressAria", { done, total })}
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised"
      >
        <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </span>
      <span className="tnum shrink-0 text-xs font-bold text-text-muted" dir="ltr">
        {t("checklists.progressLabel", { done, total })}
      </span>
    </div>
  );
}

/**
 * Checklists screen (docs/06-features/06-checklists.md): tabs (שלי / קבוצתי /
 * הכול), per-list progress, dependency-locked toggles with a blockers sheet,
 * custom item creation, and the readiness widget. Toggles are optimistic and
 * queue through the outbox offline (LWW).
 */
export function ChecklistsView({ tripId, initialBoard, members, userId }: ChecklistsViewProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [blockedItemId, setBlockedItemId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const reconciledOnce = useRef(false);

  const boardQ = useQuery({
    queryKey: ["checklists", tripId],
    queryFn: () => fetchBoard(tripId),
    initialData: { board: initialBoard, stale: false },
  });
  const board = boardQ.data.board;
  const stale = boardQ.data.stale;

  // Outbox flush → refresh toggles that synced (and rollback failures server-side).
  useEffect(() => {
    if (reconciledOnce.current) return;
    reconciledOnce.current = true;
    const onOnline = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["checklists", tripId] });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemById = useMemo(() => new Map(board.items.map((i) => [i.id, i])), [board.items]);
  const listById = useMemo(() => new Map(board.lists.map((l) => [l.id, l])), [board.lists]);
  const nameOf = useMemo(() => new Map(members.map((m) => [m.user_id, m.full_name])), [members]);

  const blockersMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const b of board.blocks as ChecklistBlockRow[]) {
      const list = map.get(b.item_id);
      if (list) list.push(b.blocked_by_item_id);
      else map.set(b.item_id, [b.blocked_by_item_id]);
    }
    for (const item of board.items) {
      if (item.blocked_by_id) {
        const list = map.get(item.id);
        if (list) list.push(item.blocked_by_id);
        else map.set(item.id, [item.blocked_by_id]);
      }
    }
    return map;
  }, [board.blocks, board.items]);

  const isBlocked = (itemId: string): boolean =>
    (blockersMap.get(itemId) ?? []).some((id) => itemById.get(id)?.status !== "done");

  const progressOfList = (listId: string): { done: number; total: number } => {
    const items = board.items.filter((i) => i.checklist_id === listId);
    return { done: items.filter((i) => i.status === "done").length, total: items.length };
  };

  function applyToggle(item: ChecklistItemRow, done: boolean): void {
    const status: ChecklistItemRow["status"] = done ? "done" : "not_started";
    const patch = {
      status,
      done_by: done ? userId : null,
      done_at: done ? new Date().toISOString() : null,
    };
    queryClient.setQueryData<BoardPayload>(["checklists", tripId], (old) =>
      old
        ? {
            ...old,
            board: {
              ...old.board,
              items: old.board.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)),
            },
          }
        : old,
    );
    const payload = { id: item.id, ...patch };
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      void enqueue("checklist_items", "update", payload).then(() =>
        pushToast({ message: t("checklists.offlineQueuedToast"), type: "info" }),
      );
      return;
    }
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("checklist_items").update(payload).eq("id", item.id);
      if (error) {
        // Server rejected (blockers/RLS) — revert to the authoritative state.
        void queryClient.invalidateQueries({ queryKey: ["checklists", tripId] });
        pushToast({
          message: error.code === "23514" ? t("checklists.errors.blocked") : t("checklists.errors.generic"),
          type: "danger",
        });
      }
    })();
  }

  function handleToggle(item: ChecklistItemRow): void {
    const wantDone = item.status !== "done";
    if (wantDone && isBlocked(item.id)) {
      setBlockedItemId(item.id);
      return;
    }
    applyToggle(item, wantDone);
  }

  const selectedList = selectedListId ? listById.get(selectedListId) : undefined;
  const myItems = board.items.filter((i) => i.assignee_id === userId);

  return (
    <>
      {/* Readiness widget (also exported for the Today dashboard) */}
      <ReadinessWidget
        board={board}
        members={members.filter((m) => m.status === "active")}
        className="mb-4"
      />

      {stale && (
        <p className="mb-3 rounded-lg bg-warning/12 px-3 py-2 text-xs font-semibold text-warning">
          {t("common.offlineBanner")}
        </p>
      )}

      {/* Tabs */}
      <div
        role="radiogroup"
        aria-label={t("checklists.title")}
        className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-surface-raised p-1"
      >
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={tab === key}
            onClick={() => {
              setTab(key);
              setSelectedListId(null);
            }}
            className={
              tab === key
                ? "min-h-12 rounded-lg bg-brand px-2 text-sm font-bold text-brand-contrast"
                : "min-h-12 rounded-lg px-2 text-sm font-bold text-text-secondary active:opacity-80"
            }
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {tab === "mine" ? (
        myItems.length === 0 ? (
          <EmptyState
            illustration="list"
            title={t("checklists.emptyMine")}
            hint={t("checklists.emptyMineHint")}
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {[...new Set(myItems.map((i) => i.checklist_id))].map((listId) => {
              const list = listById.get(listId);
              if (!list) return null;
              return (
                <li key={listId}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedListId(listId);
                      setTab("all");
                    }}
                    className="mb-1.5 inline-flex min-h-12 items-center gap-2 text-sm font-bold text-brand"
                  >
                    {list.title}
                    <ProgressRowInline done={progressOfList(listId).done} total={progressOfList(listId).total} />
                  </button>
                  <ul className="flex flex-col gap-1.5">
                    {myItems
                      .filter((i) => i.checklist_id === listId)
                      .map((item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          nameOf={nameOf}
                          locked={isBlocked(item.id)}
                          onToggle={handleToggle}
                          onShowBlocked={setBlockedItemId}
                        />
                      ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )
      ) : selectedList ? (
        <ListDetail
          list={selectedList}
          board={board}
          userId={userId}
          nameOf={nameOf}
          isBlocked={isBlocked}
          onBack={() => setSelectedListId(null)}
          onToggle={handleToggle}
          onShowBlocked={setBlockedItemId}
          onAdd={() => setAddOpen(true)}
        />
      ) : (
        <ListOverview
          lists={tab === "group" ? board.lists.filter((l) => l.scope === "group") : board.lists}
          progressOfList={progressOfList}
          onSelect={setSelectedListId}
        />
      )}

      {/* Blocked-by sheet */}
      <BottomSheet
        open={blockedItemId !== null}
        onClose={() => setBlockedItemId(null)}
        title={t("checklists.blockedBy")}
      >
        <div className="flex flex-col gap-2 pb-4">
          <p className="text-sm text-text-secondary">{t("checklists.blockedSheetTitle")}</p>
          {(blockersMap.get(blockedItemId ?? "") ?? []).map((id) => {
            const blocker = itemById.get(id);
            if (!blocker) return null;
            const done = blocker.status === "done";
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSelectedListId(blocker.checklist_id);
                  setBlockedItemId(null);
                }}
                className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-start transition-opacity active:opacity-80"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                  {blocker.title}
                </span>
                <span
                  className={
                    done
                      ? "shrink-0 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-bold text-success"
                      : "shrink-0 rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-bold text-warning"
                  }
                >
                  {done ? t("checklists.blockerDone") : t("checklists.blockerOpen")}
                </span>
                <span className="shrink-0 text-xs text-text-muted">
                  {listById.get(blocker.checklist_id)?.title}
                </span>
              </button>
            );
          })}
          <p className="text-xs text-text-muted">{t("checklists.blockedLockedHint")}</p>
        </div>
      </BottomSheet>

      <AddItemSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        list={selectedList ?? board.lists[0]}
        members={members.filter((m) => m.status === "active")}
        userId={userId}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ["checklists", tripId] })}
      />
    </>
  );
}

function ProgressRowInline({ done, total }: { done: number; total: number }) {
  return (
    <span className="tnum text-xs font-bold text-text-muted" dir="ltr">
      {t("checklists.progressLabel", { done, total })}
    </span>
  );
}

interface ItemRowProps {
  item: ChecklistItemRow;
  nameOf: Map<string, string>;
  locked: boolean;
  onToggle: (item: ChecklistItemRow) => void;
  onShowBlocked: (itemId: string) => void;
}

function ItemRow({ item, nameOf, locked, onToggle, onShowBlocked }: ItemRowProps) {
  const done = item.status === "done";
  return (
    <li className="flex items-stretch gap-1 rounded-xl border border-border bg-surface p-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        disabled={locked}
        onClick={() => onToggle(item)}
        aria-label={done ? t("checklists.toggleUndoneAria", { title: item.title }) : t("checklists.toggleDoneAria", { title: item.title })}
        className={
          done
            ? "flex min-h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-success/12"
            : locked
              ? "flex min-h-12 w-12 shrink-0 items-center justify-center rounded-lg"
              : "flex min-h-12 w-12 shrink-0 items-center justify-center rounded-lg active:bg-surface-raised"
        }
      >
        {done ? (
          <Check aria-hidden size={22} className="text-success" />
        ) : locked ? (
          <Lock aria-hidden size={18} className="text-text-muted" />
        ) : (
          <span aria-hidden className="h-6 w-6 rounded-md border-2 border-border" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1 pe-1">
        <p className={done ? "truncate text-sm text-text-muted line-through" : "truncate text-sm font-medium text-text-primary"}>
          {item.title}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${PRIORITY_TONES[item.priority]}`}>
            {PRIORITY_LABELS[item.priority]}
          </span>
          {item.assignee_id && (
            <span className="text-[11px] text-text-muted">{nameOf.get(item.assignee_id) ?? "—"}</span>
          )}
          {item.due_at && (
            <span className="text-[11px] text-text-muted">
              {t("checklists.dueAt", { date: dateFormatter.format(new Date(item.due_at)) })}
            </span>
          )}
          {done && item.done_by && (
            <span className="text-[11px] text-text-muted">
              {t("checklists.doneBy", { name: nameOf.get(item.done_by) ?? "—" })}
            </span>
          )}
        </div>
      </div>

      {locked && (
        <button
          type="button"
          aria-label={t("checklists.blockedBy")}
          onClick={() => onShowBlocked(item.id)}
          className="flex min-h-12 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted active:opacity-80"
        >
          <Lock aria-hidden size={16} />
        </button>
      )}
    </li>
  );
}

function ListOverview({
  lists,
  progressOfList,
  onSelect,
}: {
  lists: ChecklistListRow[];
  progressOfList: (id: string) => { done: number; total: number };
  onSelect: (id: string) => void;
}) {
  if (lists.length === 0) {
    return <EmptyState illustration="list" title={t("checklists.emptyAll")} hint={t("checklists.emptyAllHint")} />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {lists.map((list) => {
        const progress = progressOfList(list.id);
        return (
          <li key={list.id}>
            <button
              type="button"
              onClick={() => onSelect(list.id)}
              aria-label={list.title}
              className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-start transition-opacity active:opacity-80"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-text-primary">{list.title}</span>
                {progress.total === 0 && (
                  <span className="text-xs text-text-muted">{t("checklists.listEmpty")}</span>
                )}
              </span>
              <ProgressRow done={progress.done} total={progress.total} />
              <DirectionalIcon icon={ArrowLeft} size={18} className="shrink-0 text-text-muted" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ListDetail({
  list,
  board,
  userId,
  nameOf,
  isBlocked,
  onBack,
  onToggle,
  onShowBlocked,
  onAdd,
}: {
  list: ChecklistListRow;
  board: ChecklistBoard;
  userId: string;
  nameOf: Map<string, string>;
  isBlocked: (id: string) => boolean;
  onBack: () => void;
  onToggle: (item: ChecklistItemRow) => void;
  onShowBlocked: (id: string) => void;
  onAdd: () => void;
}) {
  const items = board.items.filter((i) => i.checklist_id === list.id);
  const progress = { done: items.filter((i) => i.status === "done").length, total: items.length };
  const mine = items.filter((i) => i.assignee_id === userId);
  const others = items.filter((i) => i.assignee_id !== null && i.assignee_id !== userId);
  const group = items.filter((i) => i.assignee_id === null);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-2 inline-flex min-h-12 items-center gap-1 rounded-lg text-sm font-bold text-brand transition-opacity active:opacity-80"
      >
        <DirectionalIcon icon={ArrowLeft} size={18} />
        {t("checklists.backToLists")}
      </button>

      <Card className="mb-3">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-text-primary">{list.title}</h2>
          <ProgressRow done={progress.done} total={progress.total} />
        </div>
      </Card>

      {[
        { label: t("checklists.sectionMine"), rows: mine },
        { label: t("checklists.sectionOthers"), rows: others },
        { label: t("checklists.sectionGroup"), rows: group },
      ]
        .filter((section) => section.rows.length > 0)
        .map((section) => (
          <section key={section.label} className="mb-4">
            <h3 className="mb-1.5 text-xs font-bold text-text-muted">{section.label}</h3>
            <ul className="flex flex-col gap-1.5">
              {section.rows.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  nameOf={nameOf}
                  locked={isBlocked(item.id)}
                  onToggle={onToggle}
                  onShowBlocked={onShowBlocked}
                />
              ))}
            </ul>
          </section>
        ))}

      <Button variant="secondary" block icon={<Plus aria-hidden size={18} />} onClick={onAdd}>
        {t("checklists.addItem")}
      </Button>
    </div>
  );
}

function AddItemSheet({
  open,
  onClose,
  list,
  members,
  userId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  list: ChecklistListRow | undefined;
  members: TripMember[];
  userId: string;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<ChecklistPriorityValue>("normal");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [errCode, setErrCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function save(): void {
    if (!list) return;
    if (title.trim() === "") {
      setErrCode("checklists.errors.invalid");
      return;
    }
    setSaving(true);
    const assignee = assigneeId === "" ? null : assigneeId;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      void enqueue("checklist_items", "insert", {
        checklist_id: list.id,
        title: title.trim(),
        priority,
        assignee_id: assignee,
        status: "not_started",
        created_by: userId,
      }).then(() => {
        pushToast({ message: t("checklists.addedToast"), type: "success" });
        setSaving(false);
        setTitle("");
        onClose();
      });
      return;
    }
    void addChecklistItemAction({
      checklistId: list.id,
      title: title.trim(),
      priority,
      assigneeId: assignee,
    })
      .then((result) => {
        setSaving(false);
        if (!result.ok) {
          setErrCode(result.error === "checklists.errors.forbidden" ? "checklists.errors.forbidden" : "checklists.errors.invalid");
          return;
        }
        pushToast({ message: t("checklists.addedToast"), type: "success" });
        onSaved();
        setTitle("");
        onClose();
      })
      .catch(() => {
        setSaving(false);
        setErrCode("checklists.errors.generic");
      });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("checklists.addTitle")}>
      <div className="flex flex-col gap-4 pb-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("checklists.titleLabel")}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("checklists.titlePlaceholder")}
            className="min-h-12 rounded-xl border border-border bg-surface px-4 text-text-primary outline-none focus:border-brand"
          />
        </label>

        <div>
          <p className="mb-1 text-xs font-semibold text-text-muted">{t("checklists.priorityLabel")}</p>
          <div role="radiogroup" aria-label={t("checklists.priorityLabel")} className="grid grid-cols-3 gap-1 rounded-xl bg-surface-raised p-1">
            {CHECKLIST_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={priority === p}
                onClick={() => setPriority(p)}
                className={
                  priority === p
                    ? "min-h-12 rounded-lg bg-brand px-1 text-sm font-bold text-brand-contrast"
                    : "min-h-12 rounded-lg px-1 text-sm font-bold text-text-secondary"
                }
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("checklists.assigneeLabel")}</span>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="min-h-12 rounded-xl border border-border bg-surface px-4 text-text-primary outline-none focus:border-brand"
          >
            <option value="">{t("checklists.assigneeNone")}</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </label>

        {errCode && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {t("checklists.errors.invalid")}
          </p>
        )}

        <Button block onClick={save} loading={saving}>
          {t("checklists.save")}
        </Button>
      </div>
    </BottomSheet>
  );
}
