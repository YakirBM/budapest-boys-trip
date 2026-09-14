"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { t } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { TRIP_ID, type MemberInfo, type TripItem } from "@/lib/data/today";
import { cacheSnapshot, readSnapshot } from "@/lib/offline/db";
import { GroupPersonalToggle, type ScopeValue } from "@/components/ui/GroupPersonalToggle";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { pushToast } from "@/components/ui/Toast";
import type { Category, CurrencyCode } from "@/components/ui/types";
import { parseAmount } from "@/lib/utils/money";
import { ScheduleTiles, type ScheduleTileItem } from "./ScheduleTiles";
import { ScheduleItemSheet, type ScheduleSavePayload } from "./ScheduleItemSheet";
import { CommentsThread } from "./CommentsThread";
import { isDay5AnchorConflict, rebalanceSortOrders, sortScheduleItems } from "./schedule-logic";

export interface PersonalRow {
  id: string;
  title: string;
  description: string | null;
  address: string | null;
  links: string[];
  costs: { label: string; amountMinor: number; currency: CurrencyCode }[];
  category: Category;
  startTime: string | null;
  durationMin: number | null;
  imageUrl: string | null;
  imageSource: string | null;
  imageFetchedAt: string | null;
  status: TripItem["status"];
  sortOrder: number;
}

export interface SchedulePaneProps {
  dayNumber: number;
  dayDateIso: string;
  groupItems: TripItem[];
  members: MemberInfo[];
  currentUserId: string | null;
  isOwner: boolean;
  prefilledPlace?: { name: string; address?: string | null } | null;
  onPrefilledConsumed?: () => void;
}

function tripItemToTile(item: TripItem, commentCounts: Map<string, number>): ScheduleTileItem {
  return {
    id: item.id,
    title: item.title,
    description: null,
    address: item.address,
    category: item.category,
    status: item.status,
    startTime: item.startTime,
    durationMin: item.durationMin,
    imageUrl: null,
    imageSource: item.place?.source ?? null,
    imageFetchedAt: item.place?.lastVerifiedAt ?? null,
    ownerName: item.ownerName,
    costPerPerson: item.estCostPerPerson,
    currency: item.currency,
    source: item.place?.source ?? null,
    lastVerifiedAt: item.place?.lastVerifiedAt ?? null,
    commentCount: commentCounts.get(item.id) ?? 0,
    navUrl: item.navUrl,
    sortOrder: item.sortOrder,
    kind: "group",
  };
}

function personalToTile(row: PersonalRow, commentCounts: Map<string, number>): ScheduleTileItem {
  const firstCost = row.costs[0];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    address: row.address,
    category: row.category,
    status: row.status,
    startTime: row.startTime,
    durationMin: row.durationMin,
    imageUrl: row.imageUrl,
    imageSource: row.imageSource,
    imageFetchedAt: row.imageFetchedAt,
    ownerName: null,
    costPerPerson: firstCost ? firstCost.amountMinor : null,
    currency: firstCost?.currency ?? "HUF",
    source: row.imageSource,
    lastVerifiedAt: row.imageFetchedAt,
    commentCount: commentCounts.get(row.id) ?? 0,
    navUrl: null,
    sortOrder: row.sortOrder,
    kind: "personal",
  };
}

/**
 * SchedulePane — group/personal toggle + tiles + drawer + comments
 * (docs/14 §3.2). Personal rows come from personal_items (owner-only RLS);
 * group rows are the TripItem prop (RSC-prefetched, TanStack-fresh).
 */
export function SchedulePane({
  dayNumber,
  groupItems,
  members,
  currentUserId,
  isOwner,
  prefilledPlace,
  onPrefilledConsumed,
}: SchedulePaneProps) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<ScopeValue>("group");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [localGroupOrder, setLocalGroupOrder] = useState<string[] | null>(null);
  const [localPersonalOrder, setLocalPersonalOrder] = useState<string[] | null>(null);

  const personalKey = ["personal", TRIP_ID, dayNumber] as const;
  const snapshotKey = `schedule-day-${dayNumber}`;

  const personalQuery = useQuery({
    queryKey: personalKey,
    queryFn: async (): Promise<PersonalRow[]> => {
      if (!currentUserId) return [];
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("personal_items")
          .select(
            "id, title, description, address, links, costs, category, start_time, duration_min, image_url, image_source, image_fetched_at, status, sort_order",
          )
          .eq("trip_id", TRIP_ID)
          .eq("day_number", dayNumber)
          .order("sort_order");
        if (error) throw error;
        const rows: PersonalRow[] = (data ?? []).map((r) => ({
          id: r.id as string,
          title: r.title as string,
          description: (r.description as string | null) ?? null,
          address: (r.address as string | null) ?? null,
          links: Array.isArray(r.links) ? (r.links as string[]) : [],
          costs: Array.isArray(r.costs)
            ? (r.costs as { label: string; amountMinor: number; currency: CurrencyCode }[])
            : [],
          category: (r.category as Category) ?? "other",
          startTime: (r.start_time as string | null) ?? null,
          durationMin: (r.duration_min as number | null) ?? null,
          imageUrl: (r.image_url as string | null) ?? null,
          imageSource: (r.image_source as string | null) ?? null,
          imageFetchedAt: (r.image_fetched_at as string | null) ?? null,
          status: (r.status as PersonalRow["status"]) ?? "planned",
          sortOrder: (r.sort_order as number) ?? 1000,
        }));
        void cacheSnapshot(`${snapshotKey}:personal`, rows);
        return rows;
      } catch (err) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const snap = await readSnapshot<PersonalRow[]>(`${snapshotKey}:personal`);
          if (snap) return snap.data;
        }
        throw err;
      }
    },
    enabled: currentUserId !== null,
    staleTime: 60_000,
  });

  const personalItems = useMemo(() => personalQuery.data ?? [], [personalQuery.data]);

  // Realtime: personal channel per-user + group itinerary invalidation.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`schedule-day-${dayNumber}`)
      .on("postgres_changes" as const, { event: "*", schema: "public", table: "personal_items" }, () => {
        void queryClient.invalidateQueries({ queryKey: personalKey });
      })
      .on("postgres_changes" as const, { event: "*", schema: "public", table: "itinerary_items" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["today", TRIP_ID] });
        void queryClient.invalidateQueries({ queryKey: ["route", TRIP_ID] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNumber, queryClient]);

  // Comment counts (group + personal) for tiles.
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const supabase = getSupabaseBrowserClient();
        const ids = [...groupItems.map((i) => i.id), ...personalItems.map((p) => p.id)];
        if (ids.length === 0) {
          if (!cancelled) setCommentCounts(new Map());
          return;
        }
        const { data } = await supabase.from("item_comments").select("item_id").in("item_id", ids.slice(0, 100));
        if (cancelled) return;
        const counts = new Map<string, number>();
        for (const row of (data ?? []) as { item_id: string }[]) {
          counts.set(row.item_id, (counts.get(row.item_id) ?? 0) + 1);
        }
        setCommentCounts(counts);
      } catch {
        // Counts are decorative; never block tiles.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [groupItems, personalItems]);

  const groupTiles = useMemo(
    () => groupItems.map((item) => tripItemToTile(item, commentCounts)),
    [groupItems, commentCounts],
  );
  const personalTiles = useMemo(
    () => personalItems.map((row) => personalToTile(row, commentCounts)),
    [personalItems, commentCounts],
  );
  const visibleTiles = useMemo(() => {
    const source = scope === "group" ? groupTiles : personalTiles;
    const order = scope === "group" ? localGroupOrder : localPersonalOrder;
    if (!order) return source;
    const index = new Map(order.map((id, position) => [id, position]));
    return source.map((tile) => ({
      ...tile,
      sortOrder: index.has(tile.id) ? (index.get(tile.id)! + 1) * 10 : tile.sortOrder,
    }));
  }, [groupTiles, localGroupOrder, localPersonalOrder, personalTiles, scope]);

  useEffect(() => {
    setLocalGroupOrder(null);
    setLocalPersonalOrder(null);
  }, [dayNumber]);

  const anchorConflict = useMemo(
    () => visibleTiles.some((tile) => isDay5AnchorConflict(dayNumber, tile.startTime)),
    [visibleTiles, dayNumber],
  );

  // Prefilled place from Discover → open the drawer once.
  useEffect(() => {
    if (prefilledPlace) {
      setScope("group");
      setEditingId(null);
      setSheetOpen(true);
    }
  }, [prefilledPlace]);

  function openTile(id: string): void {
    setEditingId(id);
    setSheetOpen(true);
  }

  async function handleReorder(orderedIds: string[]): Promise<void> {
    const orders = rebalanceSortOrders(orderedIds.length);
    const orderById = new Map(orderedIds.map((id, index) => [id, orders[index] ?? (index + 1) * 10]));
    setPendingIds(new Set(orderedIds));
    if (scope === "group") setLocalGroupOrder(orderedIds);
    else setLocalPersonalOrder(orderedIds);
    try {
      const supabase = getSupabaseBrowserClient();
      const table = scope === "group" ? "itinerary_items" : "personal_items";
      const column = scope === "group" ? "sort_order" : "sort_order";
      const updates = orderedIds.map(async (id) => {
        const sort_order = orderById.get(id);
        if (sort_order === undefined) return;
        const { error } = await supabase.from(table).update({ [column]: sort_order }).eq("id", id);
        if (error) throw error;
      });
      await Promise.all(updates);
      pushToast({ message: t("today.dnd.reordered"), type: "success" });
      if (scope === "personal") void queryClient.invalidateQueries({ queryKey: personalKey });
      else {
        void queryClient.invalidateQueries({ queryKey: ["today", TRIP_ID] });
        void queryClient.invalidateQueries({ queryKey: ["route", TRIP_ID] });
      }
    } catch {
      pushToast({ message: t("today.dnd.offlineQueued"), type: "info" });
      // Offline: persist the order locally; replay on reconnect via snapshot.
      const sorted = sortScheduleItems(
        visibleTiles.map((tile) => ({
          id: tile.id,
          startTime: tile.startTime,
          sortOrder: orderById.get(tile.id) ?? tile.sortOrder,
        })),
      );
      void cacheSnapshot(`${snapshotKey}:${scope}:order`, sorted.map((s) => s.id));
    } finally {
      setPendingIds(new Set());
    }
  }

  async function handleSave(payload: ScheduleSavePayload): Promise<void> {
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (scope === "personal" || payload.dayNumber !== dayNumber) {
        // Personal write (owner-only RLS; login required).
        if (!currentUserId) throw new Error("auth");
        const costsJson = payload.costs.map((c) => ({
          label: c.label,
          amountMinor: parseAmount(c.amount, c.currency) ?? 0,
          currency: c.currency,
        }));
        const startIso =
          payload.startTimeHHMM && payload.dayNumber >= 1 && payload.dayNumber <= 5
            ? dayDateForPayload(payload.dayNumber, payload.startTimeHHMM)
            : null;
        if (editingId) {
          const { error } = await supabase
            .from("personal_items")
            .update({
              title: payload.title,
              description: payload.description || null,
              address: payload.address || null,
              links: payload.links,
              costs: costsJson,
              category: payload.category,
              start_time: startIso,
              duration_min: payload.durationMin,
              day_number: payload.dayNumber,
              image_url: payload.imageUrl,
              image_source: payload.imageSource,
              image_fetched_at: payload.imageFetchedAt,
              status: payload.status,
            })
            .eq("id", editingId);
          if (error) throw error;
        } else {
          const maxOrder = personalItems.reduce((m, r) => Math.max(m, r.sortOrder), 0);
          const { error } = await supabase.from("personal_items").insert({
            trip_id: TRIP_ID,
            owner_id: currentUserId,
            day_number: payload.dayNumber,
            title: payload.title,
            description: payload.description || null,
            address: payload.address || null,
            links: payload.links,
            costs: costsJson,
            category: payload.category,
            start_time: startIso,
            duration_min: payload.durationMin,
            image_url: payload.imageUrl,
            image_source: payload.imageSource,
            image_fetched_at: payload.imageFetchedAt,
            status: payload.status,
            sort_order: maxOrder + 10,
          });
          if (error) throw error;
        }
        void queryClient.invalidateQueries({ queryKey: personalKey });
      } else {
        // Group write via itinerary_items (day_plans lookup).
        const { data: plan } = await supabase
          .from("day_plans")
          .select("id, date")
          .eq("trip_id", TRIP_ID)
          .eq("day_number", payload.dayNumber)
          .maybeSingle();
        if (!plan) throw new Error("noDay");
        const planRow = plan as { id: string; date: string };
        const startIso = payload.startTimeHHMM
          ? wallToIso(planRow.date, payload.startTimeHHMM)
          : new Date().toISOString();
        if (editingId) {
          const { error } = await supabase
            .from("itinerary_items")
            .update({
              title: payload.title,
              address: payload.address,
              category: payload.category,
              start_time: startIso,
              duration_min: payload.durationMin,
              status: payload.status,
            })
            .eq("id", editingId);
          if (error) throw error;
        } else {
          const { data: lastItem } = await supabase
            .from("itinerary_items")
            .select("sort_order")
            .eq("day_plan_id", planRow.id)
            .order("sort_order", { ascending: false })
            .limit(1)
            .maybeSingle();
          const lastRow = lastItem as { sort_order: number | null } | null;
          const { error } = await supabase.from("itinerary_items").insert({
            day_plan_id: planRow.id,
            title: payload.title,
            category: payload.category,
            start_time: startIso,
            address: payload.address,
            currency: "HUF",
            status: "planned",
            owner_id: payload.participantIds[0] ?? currentUserId,
            duration_min: payload.durationMin,
            sort_order: ((lastRow?.sort_order as number | undefined) ?? 0) + 10,
          });
          if (error) throw error;
        }
        void queryClient.invalidateQueries({ queryKey: ["today", TRIP_ID] });
        void queryClient.invalidateQueries({ queryKey: ["route", TRIP_ID] });
      }
      pushToast({ message: t("today.editor.saved"), type: "success" });
      setSheetOpen(false);
      setEditingId(null);
      onPrefilledConsumed?.();
    } catch {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      pushToast({
        message: offline ? t("today.editor.queuedOffline") : t("today.editor.saveFailed"),
        type: offline ? "info" : "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!editingId) return;
    try {
      const supabase = getSupabaseBrowserClient();
      const table = scope === "personal" ? "personal_items" : "itinerary_items";
      const { error } = await supabase.from(table).delete().eq("id", editingId);
      if (error) throw error;
      pushToast({ message: t("today.editor.saved"), type: "success" });
      setSheetOpen(false);
      setEditingId(null);
      if (scope === "personal") void queryClient.invalidateQueries({ queryKey: personalKey });
      else {
        void queryClient.invalidateQueries({ queryKey: ["today", TRIP_ID] });
      }
    } catch {
      pushToast({ message: t("today.editor.saveFailed"), type: "danger" });
    }
  }

  const editingTile = editingId ? visibleTiles.find((tile) => tile.id === editingId) ?? null : null;
  const editingPayload = editingTile
    ? {
        id: editingTile.id,
        title: editingTile.title,
        description: editingTile.description ?? "",
        address: editingTile.address ?? "",
        links: [],
        costs: [],
        participantIds: [],
        responsibility: "",
        dayNumber,
        startTimeHHMM: hhmmFromIso(editingTile.startTime),
        durationMin: editingTile.durationMin ?? null,
        category: editingTile.category,
        imageUrl: editingTile.imageUrl ?? "",
        imageSource: editingTile.imageSource ?? "",
        imageFetchedAt: editingTile.imageFetchedAt ?? null,
        status: editingTile.status,
      }
    : undefined;

  return (
    <section aria-label={t("today.sub.schedule")} className="flex flex-col gap-3">
      <GroupPersonalToggle
        value={scope}
        onChange={setScope}
        groupLabel={t("today.schedule.group")}
        personalLabel={t("today.schedule.personal")}
        ariaLabel={t("today.schedule.scopeLabel")}
      />

      {dayNumber === 5 && (
        <div
          role={anchorConflict ? "alert" : undefined}
          className="rounded-xl border border-border bg-surface p-3 text-sm text-text-secondary"
        >
          <p className="font-bold text-text-primary">
            <span dir="ltr" className="ltr-iso tnum">10:25 HU</span>
          </p>
          {anchorConflict && <p className="mt-1 font-semibold text-danger">{t("today.editor.anchorWarning")}</p>}
        </div>
      )}

      {visibleTiles.length === 0 ? (
        <EmptyState
          illustration="calendar"
          title={scope === "group" ? t("today.schedule.emptyGroupTitle") : t("today.schedule.emptyPersonalTitle")}
          hint={scope === "group" ? t("today.schedule.emptyGroupHint") : t("today.schedule.emptyPersonalHint")}
          ctaLabel={t("today.schedule.addItem")}
          onCta={() => {
            setEditingId(null);
            setSheetOpen(true);
          }}
        />
      ) : (
        <ScheduleTiles
          items={visibleTiles}
          pendingIds={pendingIds}
          onOpen={openTile}
          onReorder={(ids) => void handleReorder(ids)}
        />
      )}

      <Button block icon={<Plus aria-hidden size={18} />} onClick={() => { setEditingId(null); setSheetOpen(true); }}>
        {t("today.schedule.addItem")}
      </Button>

      <ScheduleItemSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setEditingId(null);
          onPrefilledConsumed?.();
        }}
        kind={scope}
        dayNumber={dayNumber}
        members={members}
        currentUserId={currentUserId}
        isOwner={isOwner}
        initial={editingPayload}
        prefilledPlace={editingId ? null : (prefilledPlace ?? null)}
        onSave={handleSave}
        onDelete={editingId ? handleDelete : undefined}
        saving={saving}
      />

      {editingId && currentUserId && (
        <div className="rounded-2xl border border-border bg-surface-raised p-3">
          <CommentsThread
            itemId={editingId}
            itemKind={scope === "group" ? "group" : "personal"}
            authorId={currentUserId}
          />
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function hhmmFromIso(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Budapest",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return "";
  }
}

const TRIP_DATES = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];

function dayDateForPayload(dayNumber: number, hhmm: string): string | null {
  const date = TRIP_DATES[dayNumber - 1];
  if (!date) return null;
  return wallToIso(date, hhmm);
}

function wallToIso(dateIso: string, hhmm: string): string {
  // Europe/Budapest is UTC+2 on trip dates (DST-aware Intl would agree;
  // fixed +02:00 keeps this client helper dependency-free and testable).
  return `${dateIso}T${hhmm}:00+02:00`;
}
