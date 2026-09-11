"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ExternalLink } from "lucide-react";
import { t } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchTodayData,
  fetchTodayFeed,
  toFeasibilityInput,
  TRIP_ID,
  type TodayData,
  type TodayFeedData,
} from "@/lib/data/today";
import { resolveNextUp } from "@/lib/utils/feasibility";
import { updateItemStatusAction } from "@/lib/actions/today";
import { useOutboxSync } from "@/lib/offline/useOutboxSync";
import { pushToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { CountdownCard } from "@/components/ui/CountdownCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useOfflineSnapshot, fetchWithOfflineFallback } from "./useOfflineSnapshot";
import { postDayNote } from "./postDayNote";
import { StatusStrip } from "./StatusStrip";
import { DaySelector } from "./DaySelector";
import { NextUpCard } from "./NextUpCard";
import { TodayTimeline } from "./TodayTimeline";
import { FeasibilityPanel } from "./FeasibilityPanel";
import { DayFeed } from "./DayFeed";
import { EmergencySheet } from "./EmergencySheet";

export interface TodayViewProps {
  dayNumber: number;
  /** Day mapped from "now" (clamped) — default selection + jump-back target. */
  defaultDay: number;
  isPreTrip: boolean;
  isPostTrip: boolean;
  tripStartIso: string;
  tripEndIso: string;
  /** Days remaining to the accommodation-booking deadline (server-computed). */
  accommodationDaysLeft: number;
  initialToday: TodayData;
  initialFeed: TodayFeedData;
}

/**
 * TodayView — interactive root of the dashboard (doc 00). RSC passes server
 * data as `initialData`; TanStack Query + realtime keep it fresh; IndexedDB
 * snapshots keep it renderable offline; writes are optimistic.
 */
export function TodayView({
  dayNumber,
  defaultDay,
  isPreTrip,
  isPostTrip,
  tripStartIso,
  tripEndIso,
  accommodationDaysLeft,
  initialToday,
  initialFeed,
}: TodayViewProps) {
  const queryClient = useQueryClient();
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const todayKey = ["today", TRIP_ID, dayNumber] as const;
  const feedKey = ["day-feed", TRIP_ID, dayNumber] as const;
  const snapshotKey = `today-day-${dayNumber}`;

  const todayQuery = useQuery({
    queryKey: todayKey,
    queryFn: () =>
      fetchWithOfflineFallback(`snapshot:${snapshotKey}`, () =>
        fetchTodayData(getSupabaseBrowserClient(), dayNumber),
      ),
    initialData: initialToday,
    staleTime: 60_000,
  });
  const feedQuery = useQuery({
    queryKey: feedKey,
    queryFn: () =>
      fetchWithOfflineFallback(`snapshot:feed-${dayNumber}`, () =>
        fetchTodayFeed(getSupabaseBrowserClient(), dayNumber),
      ),
    initialData: initialFeed,
    staleTime: 60_000,
  });

  const data = todayQuery.data ?? initialToday;
  const feed = feedQuery.data ?? initialFeed;
  const { isOffline, syncedAt } = useOfflineSnapshot(snapshotKey, data);
  const [pendingNotes, setPendingNotes] = useState(0);
  useOutboxSync((count) => setPendingNotes(count));

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    void getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data: { user } }) => setCurrentUserId(user?.id ?? null));
  }, []);

  const isOwner = data.members.some((m) => m.id === currentUserId && m.role === "owner" && m.active);
  const authorId = currentUserId ?? data.members[0]?.id ?? "";

  // Next Up resolves client-side (time-dependent); the server value seeds the
  // first render so there is no hydration mismatch.
  const [nextUpId, setNextUpId] = useState<string | null>(initialToday.nextUpId);
  const [lateShiftMin, setLateShiftMin] = useState(0);
  useEffect(() => {
    const recompute = () => {
      const inputs = data.items.map((item) => {
        const input = toFeasibilityInput(item);
        if (lateShiftMin > 0) input.startTime += lateShiftMin * 60_000;
        return input;
      });
      setNextUpId(resolveNextUp(inputs, Date.now())?.id ?? null);
    };
    recompute();
    const id = window.setInterval(recompute, 60_000);
    return () => window.clearInterval(id);
  }, [data.items, lateShiftMin]);
  const nextUp = data.items.find((item) => item.id === nextUpId) ?? null;

  const statusMutation = useMutation({
    mutationFn: async ({ itemId, next }: { itemId: string; next: string }) => {
      const result = await updateItemStatusAction({
        itemId,
        status: next as Parameters<typeof updateItemStatusAction>[0]["status"],
      });
      if (!result.ok) throw new Error(result.error?.code ?? "statusFailed");
    },
    onMutate: async ({ itemId, next }) => {
      await queryClient.cancelQueries({ queryKey: todayKey });
      const previous = queryClient.getQueryData<TodayData>(todayKey);
      if (previous) {
        queryClient.setQueryData<TodayData>(todayKey, {
          ...previous,
          items: previous.items.map((item) =>
            item.id === itemId ? { ...item, status: next as typeof item.status } : item,
          ),
        });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(todayKey, context.previous);
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      pushToast({
        message:
          err.message === "invalid_transition"
            ? t("today.errors.invalidTransition")
            : err.message === "owner_only"
              ? t("today.errors.ownerOnly")
              : offline
                ? t("today.errors.queuedOffline")
                : t("today.errors.statusFailed"),
        type: "danger",
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["today", TRIP_ID] });
      void queryClient.invalidateQueries({ queryKey: ["route", TRIP_ID] });
    },
  });

  const noteMutation = useMutation({
    mutationFn: async ({ body, noteKind }: { body: string; noteKind: "user" | "system" }) => {
      if (!data.dayPlan) throw new Error("noDay");
      return postDayNote({ dayPlanId: data.dayPlan.id, authorId, body, noteKind });
    },
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({ queryKey: feedKey });
      const previous = queryClient.getQueryData<TodayFeedData>(feedKey);
      if (previous) {
        const optimistic: TodayFeedData = {
          ...previous,
          notes: [
            {
              id: `local-${Date.now()}`,
              body,
              noteKind: "system",
              authorId,
              authorName: data.members.find((m) => m.id === authorId)?.fullName ?? null,
              createdAt: new Date().toISOString(),
              pending: true,
            },
            ...previous.notes,
          ],
        };
        queryClient.setQueryData<TodayFeedData>(feedKey, optimistic);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(feedKey, context.previous);
      pushToast({ message: t("today.errors.noteFailed"), type: "danger" });
    },
    onSuccess: (result) => {
      if (result.pending) {
        pushToast({ message: t("today.errors.queuedOffline"), type: "info" });
        setLateShiftMin(0);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["day-feed", TRIP_ID] });
    },
  });

  const handleWeLeft = () => {
    if (!currentUserId) return; // never attribute a note before auth resolves
    const time = new Intl.DateTimeFormat("he-IL", {
      timeZone: "Europe/Budapest",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    noteMutation.mutate({ body: `${t("common.weLeft")} ${time}`, noteKind: "system" });
  };

  const handleLatePreset = (minutes: number) => {
    if (!currentUserId) return;
    setLateShiftMin(minutes);
    noteMutation.mutate({ body: t("common.runningLate", { minutes }), noteKind: "system" });
  };

  const allSkipped =
    data.items.length > 0 && data.items.every((i) => i.status === "skipped" || i.status === "cancelled");

  // Countdown target: the verified outbound departure when known, else trip start.
  const tripStartTarget = data.outboundDeparture ?? `${tripStartIso}T13:35:00Z`;

  return (
    <>
      <StatusStrip
        dayNumber={dayNumber}
        dateIso={data.dayPlan?.date ?? "2026-10-04"}
        dayTitle={data.dayPlan?.title ?? null}
        weather={data.weather}
        checkinDone={data.checkinDone}
        checkinTotal={data.checkinTotal}
        onEmergency={() => setEmergencyOpen(true)}
      />

      {isOffline && syncedAt !== null && (
        <p className="mb-2 text-xs text-text-muted">
          {t("common.updatedAt", { time: new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" }).format(syncedAt) })}
        </p>
      )}

      <DaySelector selected={dayNumber} defaultDay={defaultDay} />

      {!data.accommodation.booked && !isPostTrip && (
        <Card className="mb-4 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-2">
            <CalendarClock aria-hidden size={20} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-danger">{t("today.critical.accommodationTitle")}</p>
              <p className="text-sm text-text-secondary">
                {t("today.critical.accommodationBody", { days: accommodationDaysLeft })}
              </p>
            </div>
            <a
              href="/stay"
              aria-label={t("stay.title")}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-danger"
            >
              <ExternalLink aria-hidden size={18} />
            </a>
          </div>
        </Card>
      )}

      {isPreTrip && !isPostTrip && (
        <CountdownCard
          targetDateTime={tripStartTarget}
          endDateTime={`${tripEndIso}T21:00:00Z`}
          title={t("today.countdownToTrip")}
          className="mb-4"
        />
      )}

      {isPostTrip ? (
        <Card className="mb-4">
          <p className="text-base font-semibold text-text-primary">{t("today.tripDone")}</p>
        </Card>
      ) : (
        <NextUpCard
          item={nextUp}
          dayNumber={dayNumber}
          onWeLeft={handleWeLeft}
          onLatePreset={handleLatePreset}
        />
      )}

      {lateShiftMin > 0 && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-xl bg-warning/12 px-3 py-2 text-sm text-warning">
          <span className="flex-1">{t("today.lateBanner")}</span>
          <Button variant="ghost" onClick={() => setLateShiftMin(0)}>
            {t("today.lateClear")}
          </Button>
        </div>
      )}

      {data.items.length === 0 ? (
        <EmptyState
          illustration="calendar"
          title={t("today.noItemsTitle")}
          hint={t("today.noItemsHint")}
          ctaLabel={t("today.buildDay")}
          ctaHref="/route"
          className="mb-4"
        />
      ) : (
        <>
          <FeasibilityPanel items={data.items} dayNumber={dayNumber} lateShiftMin={lateShiftMin} />
          {allSkipped && (
            <div className="mb-4 rounded-xl bg-info/12 px-3 py-2 text-sm font-medium text-info">
              {t("today.rainPlan")}
            </div>
          )}
          <TodayTimeline
            items={data.items}
            isOwner={isOwner}
            onStatusChange={(itemId, next) => statusMutation.mutateAsync({ itemId, next })}
          />
        </>
      )}

      <DayFeed
        notes={feed.notes}
        openPolls={feed.openPolls}
        pendingCount={pendingNotes}
        onAddNote={(body) => {
          if (!currentUserId) return;
          noteMutation.mutate({ body, noteKind: "user" });
        }}
      />

      <EmergencySheet
        open={emergencyOpen}
        onClose={() => setEmergencyOpen(false)}
        accommodation={data.accommodation}
      />
    </>
  );
}
