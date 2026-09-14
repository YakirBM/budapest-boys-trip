"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Check,
  GripVertical,
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
import {
  addChecklistItemAction,
  reorderChecklistItemsAction,
  type ChecklistPriorityValue,
} from "@/lib/actions/checklists";
import type {
  ChecklistBlockRow,
  ChecklistBoard,
  ChecklistItemRow,
  ChecklistListRow,
  ChecklistScope,
} from "@/lib/data/checklists";
import type { TripMember } from "@/lib/data/trip";
import { ReadinessWidget } from "./ReadinessWidget";
import { GroupTabs } from "./GroupTabs";
import {
  mapSeedTitleToGroup,
  moveItemIds,
  normalizeChecklistGroup,
  normalizeChecklistSubFilter,
  rebalancePositions,
  type ChecklistGroup,
  type ChecklistSubFilter,
} from "./checklistGroups";

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

type Tab = ChecklistSubFilter;

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

/** Per-group accent (docs/14 §4.2): preflight=info, travelers=success, return=warning. */
const GROUP_ACCENTS: Record<ChecklistGroup, string> = {
  preflight: "border-s-info",
  travelers: "border-s-success",
  return: "border-s-warning",
};

const GROUP_READINESS_TITLES: Record<ChecklistGroup, string> = {
  preflight: t("checklists.groups.preflight.readinessTitle"),
  travelers: t("checklists.groups.travelers.readinessTitle"),
  return: t("checklists.groups.return.readinessTitle"),
};

const dateFormatter = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" });

/** Read the 0021 life-phase group with a title-mapping fallback (pre-migration rows). */
function getListGroup(list: ChecklistListRow): ChecklistGroup {
  const raw = (list as unknown as { group?: unknown }).group;
  if (typeof raw === "string" && raw !== "") return normalizeChecklistGroup(raw);
  return mapSeedTitleToGroup(list.title);
}

/** Read the 0021 drag position with a sort_order fallback (pre-migration rows). */
function getItemPosition(item: ChecklistItemRow): number {
  const raw = (item as unknown as { position?: unknown }).position;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return item.sort_order;
}

function compareByPosition(a: ChecklistItemRow, b: ChecklistItemRow): number {
  const diff = getItemPosition(a) - getItemPosition(b);
  if (diff !== 0) return diff;
  return a.title.localeCompare(b.title, "he");
}

async function fetchBoard(tripId: string): Promise<BoardPayload> {
  const supabase = getSupabaseBrowserClient();
  try {
    // 0021 columns (checklists."group", checklist_items.position) with a
    // legacy fallback so the board still loads before the migration lands.
    let lists: ChecklistBoard["lists"];
    const listsNew = await supabase
      .from("checklists")
      .select("id,title,scope,sort_order,group")
      .eq("trip_id", tripId)
      .order("sort_order");
    if (listsNew.error) {
      const listsOld = await supabase
        .from("checklists")
        .select("id,title,scope,sort_order")
        .eq("trip_id", tripId)
        .order("sort_order");
      if (listsOld.error) throw listsOld.error;
      lists = ((listsOld.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        title: String(row["title"]),
        scope: String(row["scope"] ?? "group") as ChecklistScope,
        sort_order: Number(row["sort_order"] ?? 0),
      }));
    } else {
      lists = ((listsNew.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        title: String(row["title"]),
        scope: String(row["scope"] ?? "group") as ChecklistScope,
        sort_order: Number(row["sort_order"] ?? 0),
        group: typeof row["group"] === "string" ? String(row["group"]) : undefined,
      })) as ChecklistBoard["lists"];
    }
    const listIds = lists.map((l) => l.id);

    if (listIds.length === 0) {
      const empty: BoardPayload = { board: { lists: [], items: [], blocks: [] }, stale: false };
      await cacheSnapshot("checklists", empty.board);
      return empty;
    }

    let itemRows: Record<string, unknown>[];
    const itemsNew = await supabase
      .from("checklist_items")
      .select(
        "id,checklist_id,title,description,assignee_id,due_at,priority,status,blocked_by_id,link,sort_order,position,done_by,done_at",
      )
      .in("checklist_id", listIds)
      .order("sort_order");
    if (itemsNew.error) {
      const itemsOld = await supabase
        .from("checklist_items")
        .select(
          "id,checklist_id,title,description,assignee_id,due_at,priority,status,blocked_by_id,link,sort_order,done_by,done_at",
        )
        .in("checklist_id", listIds)
        .order("sort_order");
      if (itemsOld.error) throw itemsOld.error;
      itemRows = ((itemsOld.data ?? []) as unknown as Record<string, unknown>[]);
    } else {
      itemRows = ((itemsNew.data ?? []) as unknown as Record<string, unknown>[]);
    }

    const itemIds = itemRows.map((row) => String(row["id"]));
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
      items: itemRows.map((row) => {
        const base = {
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
        };
        return typeof row["position"] === "number"
          ? { ...base, position: Number(row["position"]) }
          : base;
      }) as ChecklistBoard["items"],
      blocks: ((blocksRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        item_id: String(row["item_id"]),
        blocked_by_item_id: String(row["blocked_by_item_id"]),
      })),
    };
    await cacheSnapshot("checklists", board);
    return { board, stale: false };
  } catch {
    const snap = await readSnapshot<ChecklistBoard>("checklists");
    if (snap) return { board: snap.data, stale: true };
    throw new Error("checklists board unavailable");
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
 * Checklists screen (docs/06-features/06 + docs/14 §4 Tab 2): 3 life-phase
 * group tabs (?group=) with a mine|group|all sub-filter (?filter=), per-group
 * readiness, dependency-locked toggles, drag-and-drop ordering and item
 * creation. Toggles + reorders are optimistic and queue through the outbox
 * offline (LWW).
 *
 * Note on GroupPersonalToggle: it models a 2-state group|personal switch and
 * cannot represent the required 3-state mine|group|all sub-filter, so the
 * existing 3-state segmented control is preserved (same styling/logical
 * props) per docs/14 §4.1 acceptance.
 */
export function ChecklistsView({ tripId, initialBoard, members, userId }: ChecklistsViewProps) {
  return (
    <Suspense
      fallback={
        <p className="py-8 text-center text-sm text-text-muted">{t("common.loading")}</p>
      }
    >
      <ChecklistsViewInner
        tripId={tripId}
        initialBoard={initialBoard}
        members={members}
        userId={userId}
      />
    </Suspense>
  );
}

function ChecklistsViewInner({ tripId, initialBoard, members, userId }: ChecklistsViewProps) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [blockedItemId, setBlockedItemId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const reconciledOnce = useRef(false);

  const activeGroup = normalizeChecklistGroup(searchParams.get("group") ?? "preflight");
  const tab: Tab = normalizeChecklistSubFilter(searchParams.get("filter") ?? "all");

  function navigate(group: ChecklistGroup, filter: Tab): void {
    setSelectedListId(null);
    window.history.pushState(null, "", `${pathname}?group=${group}&filter=${filter}`);
  }

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

  const groupLists = useMemo(
    () => board.lists.filter((l) => getListGroup(l) === activeGroup),
    [board.lists, activeGroup],
  );
  const groupListIds = useMemo(() => new Set(groupLists.map((l) => l.id)), [groupLists]);
  const groupItems = useMemo(
    () => board.items.filter((i) => groupListIds.has(i.checklist_id)),
    [board.items, groupListIds],
  );

  // A selection from another group (e.g. back-button) never renders stale.
  useEffect(() => {
    if (selectedListId !== null && !groupListIds.has(selectedListId)) {
      setSelectedListId(null);
    }
  }, [selectedListId, groupListIds]);

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
  const selectedInGroup = selectedList && groupListIds.has(selectedList.id) ? selectedList : undefined;
  const myItems = groupItems.filter((i) => i.assignee_id === userId);

  return (
    <>
      <GroupTabs active={activeGroup} filter={tab} onGroupChange={(group) => navigate(group, tab)} />

      {/* Per-group readiness (docs/14 §4.1): overall bar + urgent critical for this group. */}
      <ReadinessWidget
        board={{ lists: groupLists, items: groupItems }}
        members={members.filter((m) => m.status === "active")}
        listIds={groupLists.map((l) => l.id)}
        title={GROUP_READINESS_TITLES[activeGroup]}
        className="mb-4"
      />

      {stale && (
        <p className="mb-3 rounded-lg bg-warning/12 px-3 py-2 text-xs font-semibold text-warning">
          {t("common.offlineBanner")}
        </p>
      )}

      {/* Sub-filter: mine | group | all (3-state, preserved per docs/14 §4.1). */}
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
            onClick={() => navigate(activeGroup, key)}
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
                      window.history.pushState(null, "", `${pathname}?group=${activeGroup}&filter=all`);
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
      ) : selectedInGroup ? (
        <ListDetail
          list={selectedInGroup}
          board={board}
          tripId={tripId}
          nameOf={nameOf}
          isBlocked={isBlocked}
          onBack={() => setSelectedListId(null)}
          onToggle={handleToggle}
          onShowBlocked={setBlockedItemId}
          onAdd={() => setAddOpen(true)}
        />
      ) : (
        <ListOverview
          lists={tab === "group" ? groupLists.filter((l) => l.scope === "group") : groupLists}
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
        list={selectedInGroup ?? groupLists[0] ?? board.lists[0]}
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
              className={`flex min-h-16 w-full items-center gap-3 rounded-xl border border-border border-s-4 bg-surface px-4 py-3 text-start transition-opacity active:opacity-80 ${GROUP_ACCENTS[getListGroup(list)]}`}
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
  tripId,
  nameOf,
  isBlocked,
  onBack,
  onToggle,
  onShowBlocked,
  onAdd,
}: {
  list: ChecklistListRow;
  board: ChecklistBoard;
  tripId: string;
  nameOf: Map<string, string>;
  isBlocked: (id: string) => boolean;
  onBack: () => void;
  onToggle: (item: ChecklistItemRow) => void;
  onShowBlocked: (id: string) => void;
  onAdd: () => void;
}) {
  const items = useMemo(
    () => board.items.filter((i) => i.checklist_id === list.id).sort(compareByPosition),
    [board.items, list.id],
  );
  const progress = { done: items.filter((i) => i.status === "done").length, total: items.length };

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

      {items.length > 1 && (
        <p className="mb-2 text-xs text-text-muted">{t("checklists.dnd.hint")}</p>
      )}
      {items.length === 0 ? (
        <EmptyState illustration="list" title={t("checklists.emptyAll")} hint={t("checklists.emptyAllHint")} />
      ) : (
        <ReorderableItems
          items={items}
          tripId={tripId}
          nameOf={nameOf}
          isBlocked={isBlocked}
          onToggle={onToggle}
          onShowBlocked={onShowBlocked}
        />
      )}

      <div className="mt-3">
        <Button variant="secondary" block icon={<Plus aria-hidden size={18} />} onClick={onAdd}>
          {t("checklists.addItem")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Drag-and-drop item list (docs/14 §4.2): @dnd-kit/sortable vertical list with
 * long-press (250ms) touch activation, keyboard sensor, and position numbers
 * 1..n. Optimistic reorder + revert on error + offline outbox queue. Drag
 * never changes assignment — the checkbox toggle stays the keyboard fallback.
 */
function ReorderableItems({
  items,
  tripId,
  nameOf,
  isBlocked,
  onToggle,
  onShowBlocked,
}: {
  items: ChecklistItemRow[];
  tripId: string;
  nameOf: Map<string, string>;
  isBlocked: (id: string) => boolean;
  onToggle: (item: ChecklistItemRow) => void;
  onShowBlocked: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent): void {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    const newOrder = moveItemIds(ids, activeId, overId);
    if (newOrder.length === 0) return;
    const assignments = rebalancePositions(newOrder);
    const byId = new Map(assignments.map((a) => [a.id, a.position]));
    const listId = items[0]?.checklist_id;
    if (!listId) return;

    const prev = queryClient.getQueryData<BoardPayload>(["checklists", tripId]);
    queryClient.setQueryData<BoardPayload>(["checklists", tripId], (old) =>
      old
        ? {
            ...old,
            board: {
              ...old.board,
              items: old.board.items.map((it) => {
                if (it.checklist_id !== listId) return it;
                const position = byId.get(it.id);
                return position === undefined
                  ? it
                  : { ...it, sort_order: position, position } as ChecklistItemRow;
              }),
            },
          }
        : old,
    );

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      void (async () => {
        for (const a of assignments) {
          await enqueue("checklist_items", "update", {
            id: a.id,
            position: a.position,
            sort_order: a.position,
          });
        }
        pushToast({ message: t("checklists.offlineQueuedToast"), type: "info" });
      })();
      return;
    }

    void reorderChecklistItemsAction({ items: assignments })
      .then((result) => {
        if (!result.ok) {
          if (prev) queryClient.setQueryData(["checklists", tripId], prev);
          pushToast({ message: t("checklists.errors.generic"), type: "danger" });
          return;
        }
        pushToast({ message: t("checklists.dnd.reordered"), type: "success" });
        void queryClient.invalidateQueries({ queryKey: ["checklists", tripId] });
      })
      .catch(() => {
        if (prev) queryClient.setQueryData(["checklists", tripId], prev);
        pushToast({ message: t("checklists.errors.generic"), type: "danger" });
      });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-1.5">
          {items.map((item, index) => (
            <SortableItemRow
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              nameOf={nameOf}
              locked={isBlocked(item.id)}
              onToggle={onToggle}
              onShowBlocked={onShowBlocked}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableItemRow({
  item,
  index,
  total,
  nameOf,
  locked,
  onToggle,
  onShowBlocked,
}: ItemRowProps & { index: number; total: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const done = item.status === "done";
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
      className="flex items-stretch gap-1 rounded-xl border border-border bg-surface p-1"
    >
      <span
        dir="ltr"
        aria-hidden
        className="tnum flex min-h-12 w-6 shrink-0 items-center justify-center text-xs font-bold text-text-muted"
      >
        {index + 1}
      </span>
      <span className="sr-only">
        {t("checklists.dnd.positionLabel", { index: index + 1, total })}
      </span>

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

      <button
        type="button"
        aria-label={t("checklists.dnd.reorderHandleAria", { title: item.title })}
        {...attributes}
        {...listeners}
        className="flex min-h-12 w-12 shrink-0 cursor-grab items-center justify-center rounded-lg text-text-muted touch-none active:cursor-grabbing active:bg-surface-raised"
      >
        <GripVertical aria-hidden size={20} />
      </button>
    </li>
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
