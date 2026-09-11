"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Library, Plus, TriangleAlert } from "lucide-react";
import { t } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchRouteData, TRIP_ID, type LibraryPlace, type RouteData } from "@/lib/data/route";
import { bufferForDay, toFeasibilityInput } from "@/lib/data/today";
import { evaluateDayFeasibility } from "@/lib/utils/feasibility";
import type { ItineraryStatus } from "@/components/ui/types";
import {
  addItemAction,
  attachBackupAction,
  quickAddPlaceAction,
  rainPlanAction,
  reorderItemAction,
  setPlaceStatusAction,
} from "@/lib/actions/route";
import { updateItemStatusAction } from "@/lib/actions/today";
import { pushToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Fab } from "@/components/ui/FAB";
import { useOfflineSnapshot, fetchWithOfflineFallback } from "@/components/feature/today/useOfflineSnapshot";
import { DayTabs } from "./DayTabs";import { DayCostRollup } from "./DayCostRollup";
import { RouteItemList } from "./RouteItemList";
import { AddItemSheet } from "./AddItemSheet";
import { BackupAttachSheet } from "./BackupAttachSheet";
import { RainPlanControl } from "./RainPlanControl";
import { PlacesInbox } from "./PlacesInbox";

export interface RouteViewProps {
  selectedDay: number;
  defaultDay: number;
  tab: "day" | "places";
  initialData: RouteData;
}

function actionErrorToast(err: unknown, fallbackKey: string) {
  const code = err instanceof Error && err.message ? err.message : "";
  const key =
    code === "invalid_transition"
      ? "today.errors.invalidTransition"
      : code === "owner_only"
        ? "today.errors.ownerOnly"
        : code === "place_scheduled"
          ? "route.errors.placeScheduled"
          : code === "reason_required"
            ? "route.errors.reasonRequired"
            : (typeof navigator !== "undefined" && !navigator.onLine) || code === "network"
              ? "route.errors.network"
              : fallbackKey;
  pushToast({ message: t(key as never), type: "danger" });
}

/**
 * RouteView — route builder + places inbox (docs/06-features/01). The two tabs
 * share one query (whole-trip data is tiny) so the library and builder never
 * disagree; day switching stays server-rendered via links.
 */
export function RouteView({ selectedDay, defaultDay, tab, initialData }: RouteViewProps) {
  const queryClient = useQueryClient();
  const routeKey = ["route", TRIP_ID] as const;
  const snapshotKey = "route";

  const query = useQuery({
    queryKey: routeKey,
    queryFn: () =>
      fetchWithOfflineFallback(`snapshot:${snapshotKey}`, () =>
        fetchRouteData(getSupabaseBrowserClient(), selectedDay),
      ),
    initialData: initialData,
    staleTime: 60_000,
  });
  const data = query.data ?? initialData;
  const { isOffline, syncedAt } = useOfflineSnapshot(snapshotKey, data);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    void getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data: { user } }) => setCurrentUserId(user?.id ?? null));
  }, []);
  const isOwner = data.members.some((m) => m.id === currentUserId && m.role === "owner" && m.active);

  const plan = data.dayPlans.find((p) => p.dayNumber === selectedDay) ?? null;
  const dayItems = useMemo(
    () =>
      data.items
        .filter((item) => item.dayNumber === selectedDay)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [data.items, selectedDay],
  );
  const dayCost = data.dayCosts.find((c) => c.dayNumber === selectedDay) ?? {
    dayNumber: selectedDay,
    estimateHuf: 0,
    actualHuf: 0,
    extras: [],
    hasUnverified: false,
  };

  const invalidateRoute = () => {
    void queryClient.invalidateQueries({ queryKey: ["route", TRIP_ID] });
    void queryClient.invalidateQueries({ queryKey: ["today", TRIP_ID] });
    void queryClient.invalidateQueries({ queryKey: ["places", TRIP_ID] });
  };

  /* ---------------- mutations ---------------- */

  const statusMutation = useMutation({
    mutationFn: async ({ itemId, next }: { itemId: string; next: ItineraryStatus }) => {
      const result = await updateItemStatusAction({ itemId, status: next });
      if (!result.ok) throw new Error(result.error?.code ?? "statusFailed");
    },
    onMutate: async ({ itemId, next }) => {
      await queryClient.cancelQueries({ queryKey: routeKey });
      const previous = queryClient.getQueryData<RouteData>(routeKey);
      if (previous) {
        queryClient.setQueryData<RouteData>(routeKey, {
          ...previous,
          items: previous.items.map((item) => (item.id === itemId ? { ...item, status: next } : item)),
        });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(routeKey, context.previous);
      actionErrorToast(err, "route.errors.addFailed");
    },
    onSettled: invalidateRoute,
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ itemId, direction }: { itemId: string; direction: "up" | "down" }) => {
      const result = await reorderItemAction({ itemId, direction });
      if (!result.ok) throw new Error(result.error?.code ?? "reorderFailed");
    },
    onMutate: async ({ itemId, direction }) => {
      await queryClient.cancelQueries({ queryKey: routeKey });
      const previous = queryClient.getQueryData<RouteData>(routeKey);
      if (previous) {
        const ordered = [...dayItems];
        const index = ordered.findIndex((item) => item.id === itemId);
        const neighbor = direction === "up" ? ordered[index - 1] : ordered[index + 1];
        const current = ordered[index];
        if (current && neighbor) {
          const a = { ...current, sortOrder: neighbor.sortOrder };
          const b = { ...neighbor, sortOrder: current.sortOrder };
          const rebuilt = ordered.map((item) =>
            item.id === a.id ? a : item.id === b.id ? b : item,
          );
          const others = previous.items.filter((item) => item.dayNumber !== selectedDay);
          queryClient.setQueryData<RouteData>(routeKey, { ...previous, items: [...others, ...rebuilt] });
        }
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(routeKey, context.previous);
      actionErrorToast(err, "route.errors.reorderFailed");
    },
    onSettled: invalidateRoute,
  });

  const backupMutation = useMutation({
    mutationFn: async ({ itemId, backupItemId }: { itemId: string; backupItemId: string | null }) => {
      const result = await attachBackupAction({ itemId, backupItemId });
      if (!result.ok) throw new Error(result.error?.code ?? "backupFailed");
    },
    onError: (err) => actionErrorToast(err, "route.errors.backupFailed"),
    onSettled: invalidateRoute,
  });

  const addMutation = useMutation({
    mutationFn: async (input: Parameters<typeof addItemAction>[0]) => {
      const result = await addItemAction(input);
      if (!result.ok) throw new Error(result.error?.code ?? "addFailed");
    },
    onError: (err) => actionErrorToast(err, "route.errors.addFailed"),
    onSuccess: () => pushToast({ message: t("route.saved"), type: "success" }),
    onSettled: invalidateRoute,
  });

  const placeMutation = useMutation({
    mutationFn: async ({
      placeId,
      status,
      reason,
    }: {
      placeId: string;
      status: "idea" | "under_review" | "approved" | "rejected";
      reason?: string;
    }) => {
      const result = await setPlaceStatusAction({ placeId, status, reason });
      if (!result.ok) throw new Error(result.error?.code ?? "placeFailed");
    },
    onMutate: async ({ placeId, status }) => {
      await queryClient.cancelQueries({ queryKey: routeKey });
      const previous = queryClient.getQueryData<RouteData>(routeKey);
      if (previous) {
        queryClient.setQueryData<RouteData>(routeKey, {
          ...previous,
          places: previous.places.map((place) =>
            place.id === placeId ? { ...place, status, note: status === "rejected" ? place.note : place.note } : place,
          ),
        });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(routeKey, context.previous);
      actionErrorToast(err, "route.errors.placeFailed");
    },
    onSuccess: () => pushToast({ message: t("route.library.statusChanged"), type: "success" }),
    onSettled: invalidateRoute,
  });

  const quickAddMutation = useMutation({
    mutationFn: async (input: { rawUrl: string; name: string; note?: string }) => {
      const result = await quickAddPlaceAction(input);
      if (!result.ok) throw new Error(result.error?.code ?? "placeFailed");
    },
    onError: (err) => actionErrorToast(err, "route.errors.placeFailed"),
    onSuccess: () => pushToast({ message: t("route.library.added"), type: "success" }),
    onSettled: invalidateRoute,
  });

  const rainMutation = useMutation({
    mutationFn: async ({ activate }: { activate: boolean }) => {
      if (!plan) throw new Error("noDay");
      const result = await rainPlanAction({
        dayPlanId: plan.id,
        activate,
        feedBody: activate ? t("route.rainDone") : t("route.rainReverted"),
      });
      if (!result.ok) throw new Error(result.error?.code ?? "rainFailed");
    },
    onError: (err) => actionErrorToast(err, "route.errors.rainFailed"),
    onSuccess: (_data, variables) =>
      pushToast({
        message: variables.activate ? t("route.rainDone") : t("route.rainReverted"),
        type: "success",
      }),
    onSettled: invalidateRoute,
  });

  /* ---------------- sheets ---------------- */

  const [addOpen, setAddOpen] = useState(false);
  const [addPlace, setAddPlace] = useState<LibraryPlace | null>(null);
  const [backupItemId, setBackupItemId] = useState<string | null>(null);

  const backupItem = data.items.find((item) => item.id === backupItemId) ?? null;

  // Rain plan is "activated" when any outdoor item of the day is skipped with a backup.
  const rainActivated = dayItems.some(
    (item) => item.status === "skipped" && item.backupItemId !== null,
  );

  const feasibilityWarnings = useMemo(
    () =>
      evaluateDayFeasibility(
        dayItems.map(toFeasibilityInput),
        bufferForDay(selectedDay),
      ),
    [dayItems, selectedDay],
  );

  return (
    <>
      <DayTabs selected={selectedDay} defaultDay={defaultDay} tab={tab} />

      <nav aria-label={t("route.title")} className="mb-3 flex gap-2">
        <a
          href={`/route?day=${selectedDay}&tab=day`}
          aria-current={tab === "day" ? "page" : undefined}
          className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${
            tab === "day" ? "border-transparent bg-brand text-brand-contrast" : "border-border bg-surface text-text-secondary"
          }`}
        >
          <Plus aria-hidden size={16} />
          {t("route.tabDay")}
        </a>
        <a
          href={`/route?day=${selectedDay}&tab=places`}
          aria-current={tab === "places" ? "page" : undefined}
          className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${
            tab === "places" ? "border-transparent bg-brand text-brand-contrast" : "border-border bg-surface text-text-secondary"
          }`}
        >
          <Library aria-hidden size={16} />
          {t("route.tabLibrary")}
        </a>
      </nav>

      {isOffline && syncedAt !== null && (
        <p className="mb-2 text-xs text-text-muted">
          {t("common.updatedAt", {
            time: new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" }).format(syncedAt),
          })}
        </p>
      )}

      {tab === "day" ? (
        <>
          <DayCostRollup cost={dayCost} activeMemberCount={data.activeMemberCount} />

          {feasibilityWarnings.length > 0 ? (
            <Card className="mb-4 border-warning/40 bg-warning/5">
              <p className="flex items-center gap-2 text-sm font-semibold text-warning">
                <TriangleAlert aria-hidden size={18} className="shrink-0" />
                {t("route.feasibilityChip", { count: feasibilityWarnings.length })}
              </p>
            </Card>
          ) : (
            <Card className="mb-4">
              <p className="text-sm text-text-muted">{t("route.feasibilityOk")}</p>
            </Card>
          )}

          <RainPlanControl
            items={dayItems}
            dayPlanId={plan?.id ?? null}
            activated={rainActivated}
            onActivate={async () => rainMutation.mutateAsync({ activate: true })}
            onRevert={async () => rainMutation.mutateAsync({ activate: false })}
          />

          {dayItems.length === 0 ? (
            <EmptyState
              illustration="map"
              title={t("route.emptyDay")}
              hint={t("today.noItemsHint")}
              ctaLabel={t("route.addItem")}
              onCta={() => {
                setAddPlace(null);
                setAddOpen(true);
              }}
            />
          ) : (
            <RouteItemList
              items={dayItems}
              isOwner={isOwner}
              onReorder={(itemId, direction) => reorderMutation.mutateAsync({ itemId, direction })}
              onStatusChange={(itemId, next) => statusMutation.mutateAsync({ itemId, next })}
              onAttachBackup={(itemId) => setBackupItemId(itemId)}
            />
          )}

          <Fab
            label={t("route.addItem")}
            onClick={() => {
              setAddPlace(null);
              setAddOpen(true);
            }}
          />
        </>
      ) : (
        <PlacesInbox
          places={data.places}
          onTransition={(placeId, status, reason) => placeMutation.mutateAsync({ placeId, status, reason })}
          onSchedule={(place) => {
            setAddPlace(place);
            setAddOpen(true);
          }}
          onQuickAdd={async (input) => {
            await quickAddMutation.mutateAsync(input);
          }}
        />
      )}

      <AddItemSheet
        key={addPlace?.id ?? "manual"}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        fixedPlace={addPlace}
        places={data.places}
        dayPlans={data.dayPlans}
        selectedDay={selectedDay}
        members={data.members}
        currentUserId={currentUserId}
        onSubmit={async (input) => {
          await addMutation.mutateAsync(input);
          setAddOpen(false);
        }}
      />

      <BackupAttachSheet
        open={backupItemId !== null}
        onClose={() => setBackupItemId(null)}
        item={backupItem}
        candidates={data.items}
        onAttach={(targetId) => {
          if (backupItemId) {
            void backupMutation.mutateAsync({ itemId: backupItemId, backupItemId: targetId });
          }
        }}
      />
    </>
  );
}
