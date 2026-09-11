"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin as MapPinIcon, Pencil, Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { TRIP_ID } from "@/lib/data/today";
import { cacheSnapshot, readSnapshot } from "@/lib/offline/db";
import { fetchWithOfflineFallback } from "@/components/feature/today/useOfflineSnapshot";
import { isMapPinWithinBounds } from "@/components/feature/schedule/schedule-logic";
import { Button } from "@/components/ui/Button";

export type MapPinKind = "custom" | "meeting" | "food" | "warning";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  note: string | null;
  kind: MapPinKind;
  createdBy: string;
  createdAt: string;
  pending?: boolean;
}

export { isMapPinWithinBounds };

const SNAPSHOT_KEY = "snapshot:map-pins";

async function fetchPins(): Promise<MapPin[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("map_pins")
    .select("id, lat, lng, label, note, kind, created_by, created_at")
    .eq("trip_id", TRIP_ID)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as {
    id: string;
    lat: number;
    lng: number;
    label: string;
    note: string | null;
    kind: MapPinKind;
    created_by: string;
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    lat: Number(row.lat),
    lng: Number(row.lng),
    label: row.label,
    note: row.note,
    kind: row.kind,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

/**
 * useMapPins — shared pins (docs/14 §3.3.3). Realtime trip channel, offline
 * optimistic local-id + outbox reconcile (server id replaces local on
 * reconnect, same pattern as reconcileExpenseSplits).
 */
export function useMapPins() {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["map-pins", TRIP_ID] as const, []);

  const query = useQuery({
    queryKey,
    queryFn: () =>
      fetchWithOfflineFallback(SNAPSHOT_KEY, async () => {
        const pins = await fetchPins();
        void cacheSnapshot(SNAPSHOT_KEY, pins);
        return pins;
      }),
    staleTime: 30_000,
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`map-pins:${TRIP_ID}`)
      .on("postgres_changes" as const, { event: "*", schema: "public", table: "map_pins" }, () => {
        void queryClient.invalidateQueries({ queryKey });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, queryKey]);

  // Reconcile offline-created pins on reconnect.
  useEffect(() => {
    function reconcile(): void {
      void (async () => {
        const snap = await readSnapshot<MapPin[]>(`${SNAPSHOT_KEY}:outbox`);
        const pending = snap?.data ?? [];
        if (pending.length === 0 || !navigator.onLine) return;
        const supabase = getSupabaseBrowserClient();
        const remaining: MapPin[] = [];
        for (const pin of pending) {
          if (!isMapPinWithinBounds(pin.lat, pin.lng)) continue;
          try {
            const { data, error } = await supabase
              .from("map_pins")
              .insert({
                trip_id: TRIP_ID,
                lat: pin.lat,
                lng: pin.lng,
                label: pin.label,
                note: pin.note,
                kind: pin.kind,
                created_by: pin.createdBy,
              })
              .select("id")
              .single();
            if (error) throw error;
            void data;
          } catch {
            remaining.push(pin);
          }
        }
        void cacheSnapshot(`${SNAPSHOT_KEY}:outbox`, remaining);
        void queryClient.invalidateQueries({ queryKey });
      })();
    }
    window.addEventListener("online", reconcile);
    void reconcile();
    return () => window.removeEventListener("online", reconcile);
  }, [queryClient, queryKey]);

  return query;
}

export async function createMapPin(input: {
  lat: number;
  lng: number;
  label: string;
  note: string | null;
  kind: MapPinKind;
  authorId: string;
}): Promise<{ ok: boolean; offline?: boolean }> {
  if (!isMapPinWithinBounds(input.lat, input.lng)) return { ok: false };
  const supabase = getSupabaseBrowserClient();
  try {
    const { error } = await supabase.from("map_pins").insert({
      trip_id: TRIP_ID,
      lat: input.lat,
      lng: input.lng,
      label: input.label,
      note: input.note,
      kind: input.kind,
      created_by: input.authorId,
    });
    if (error) throw error;
    return { ok: true };
  } catch {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const snap = await readSnapshot<MapPin[]>(`${SNAPSHOT_KEY}:outbox`);
      const optimistic: MapPin = {
        id: `local-${Date.now()}`,
        lat: input.lat,
        lng: input.lng,
        label: input.label,
        note: input.note,
        kind: input.kind,
        createdBy: input.authorId,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      void cacheSnapshot(`${SNAPSHOT_KEY}:outbox`, [...(snap?.data ?? []), optimistic]);
      return { ok: true, offline: true };
    }
    return { ok: false };
  }
}

/**
 * PinsLayer — accessible pin list (map markers stay in InteractiveMap).
 * Edit/delete gated own-or-owner in the parent via canEdit.
 */
export function PinsLayer({
  pins,
  currentUserId,
  isOwner,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: {
  pins: MapPin[];
  currentUserId: string | null;
  isOwner: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (pin: MapPin) => void;
  onDelete: (pin: MapPin) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (pins.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2" aria-label={t("map.layers.pins")}>
      {pins.map((pin) => {
        const canEdit = currentUserId !== null && (pin.createdBy === currentUserId || isOwner);
        const selected = selectedId === pin.id;
        return (
          <li
            key={pin.id}
            className={`flex items-center gap-2 rounded-xl border p-2.5 ${
              selected ? "border-brand bg-brand-soft" : "border-border bg-surface"
            }`}
          >
            <MapPinIcon aria-hidden size={18} className="shrink-0 text-brand" />
            <button
              type="button"
              onClick={() => onSelect(selected ? null : pin.id)}
              aria-pressed={selected}
              className="min-h-12 min-w-0 flex-1 text-start"
            >
              <span className="block truncate text-sm font-bold text-text-primary">{pin.label}</span>
              <span className="block text-[11px] text-text-muted">
                <span dir="ltr" className="ltr-iso tnum">
                  {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                </span>
                {pin.pending ? ` · ${t("map.pins.offlineQueued")}` : ""}
              </span>
            </button>
            {canEdit && (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={t("map.pins.editTitle")}
                  onClick={() => onEdit(pin)}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-text-muted"
                >
                  <Pencil aria-hidden size={18} />
                </button>
                <button
                  type="button"
                  aria-label={t("map.pins.delete")}
                  onClick={() => setConfirmId(pin.id)}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-danger"
                >
                  <Trash2 aria-hidden size={18} />
                </button>
              </span>
            )}
            {confirmId === pin.id && (
              <span className="flex shrink-0 flex-col gap-1">
                <span className="text-[11px] font-bold text-text-primary">{t("map.pins.deleteConfirm")}</span>
                <span className="flex gap-1">
                  <Button variant="danger" onClick={() => { setConfirmId(null); onDelete(pin); }}>
                    {t("common.confirm")}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmId(null)}>
                    {t("common.cancel")}
                  </Button>
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
