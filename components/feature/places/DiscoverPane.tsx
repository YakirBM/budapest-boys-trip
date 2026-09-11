"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { t } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { TRIP_ID, fetchMembers } from "@/lib/data/today";
import { fetchRouteData, type LibraryPlace } from "@/lib/data/route";
import { cacheSnapshot, readSnapshot } from "@/lib/offline/db";
import { fetchWithOfflineFallback } from "@/components/feature/today/useOfflineSnapshot";
import { pushToast } from "@/components/ui/Toast";
import { PlacesGrid } from "./PlacesGrid";
import { PlaceDetailSheet } from "./PlaceDetailSheet";
import { PlaceFormSheet, type PlaceFormPayload } from "./PlaceFormSheet";

export interface DiscoverPaneProps {
  dayNumber: number;
  currentUserId: string | null;
  onAddToDay: (place: LibraryPlace) => void;
}

/**
 * DiscoverPane — places library (docs/14 §3.4). Grid + filters + detail +
 * form + scrape prefill + add-to-day. Status pipeline preserved
 * (idea→under_review→approved→scheduled, rejected needs reason).
 */
export function DiscoverPane({ dayNumber, currentUserId, onAddToDay }: DiscoverPaneProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<LibraryPlace | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryPlace | null>(null);
  const [saving, setSaving] = useState(false);

  const placesQuery = useQuery({
    queryKey: ["places", TRIP_ID],
    queryFn: () =>
      fetchWithOfflineFallback("snapshot:places", async () => {
        const route = await fetchRouteData(getSupabaseBrowserClient(), dayNumber);
        void cacheSnapshot("snapshot:places", route.places);
        return route.places;
      }),
    staleTime: 60_000,
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`places:${TRIP_ID}`)
      .on("postgres_changes" as const, { event: "*", schema: "public", table: "places" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["places", TRIP_ID] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const places = placesQuery.data ?? [];

  async function handleStatusChange(
    placeId: string,
    status: "idea" | "under_review" | "approved" | "rejected",
    reason?: string,
  ): Promise<void> {
    try {
      const supabase = getSupabaseBrowserClient();
      if (status === "rejected") {
        if (!reason) {
          pushToast({ message: t("route.errors.reasonRequired"), type: "danger" });
          return;
        }
        const { data: refs } = await supabase.from("itinerary_items").select("id").eq("place_id", placeId).limit(1);
        if ((refs ?? []).length > 0) {
          pushToast({ message: t("route.errors.placeScheduled"), type: "danger" });
          return;
        }
        const { data: current } = await supabase.from("places").select("note").eq("id", placeId).maybeSingle();
        const existing = typeof (current as { note?: unknown } | null)?.note === "string"
          ? ((current as { note: string }).note)
          : "";
        const { error } = await supabase
          .from("places")
          .update({ status, note: existing ? `${existing} | ${reason}` : reason })
          .eq("id", placeId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("places").update({ status }).eq("id", placeId);
        if (error) throw error;
      }
      pushToast({ message: t("route.library.statusChanged"), type: "success" });
      void queryClient.invalidateQueries({ queryKey: ["places", TRIP_ID] });
    } catch {
      pushToast({ message: t("route.errors.placeFailed"), type: "danger" });
    }
  }

  async function handleSave(payload: PlaceFormPayload): Promise<void> {
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const lat = payload.lat ? Number(payload.lat) : null;
      const lng = payload.lng ? Number(payload.lng) : null;
      const row = {
        trip_id: TRIP_ID,
        name: payload.name,
        type: payload.type,
        google_maps_url: payload.mapsUrl || null,
        district: payload.district || null,
        address_text: payload.address || null,
        lat: lat !== null && Number.isFinite(lat) ? lat : null,
        lng: lng !== null && Number.isFinite(lng) ? lng : null,
        tags: payload.tags,
        est_price: payload.price ? Number(payload.price) : null,
        price_currency: payload.currency,
        price_source: payload.priceSource ? "api" : "manual",
        source: payload.source || (payload.mapsUrl ? "member pasted link" : "manual entry"),
        last_verified_at: payload.source ? new Date().toISOString() : null,
        opening_hours: payload.hoursNote ? { note: payload.hoursNote } : null,
        needs_reservation: payload.needsReservation,
        note: payload.note || null,
        image_url: payload.cover || null,
        suggested_by: currentUserId,
        status: "idea",
      };
      if (editing) {
        const { error } = await supabase.from("places").update(row).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("places").insert(row);
        if (error) throw error;
      }
      pushToast({ message: t("route.form.saved"), type: "success" });
      setFormOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["places", TRIP_ID] });
    } catch {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      pushToast({
        message: offline ? t("route.errors.network") : t("route.errors.placeFailed"),
        type: offline ? "info" : "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PlacesGrid
        places={places}
        onOpen={setSelected}
        onAdd={() => {
          setEditing(null);
          setFormOpen(true);
        }}
      />

      <PlaceDetailSheet
        place={selected}
        currentUserId={currentUserId}
        onClose={() => setSelected(null)}
        onStatusChange={(id, status, reason) => void handleStatusChange(id, status, reason)}
        onEdit={(place) => {
          setEditing(place);
          setSelected(null);
          setFormOpen(true);
        }}
        onAddToDay={(place) => {
          setSelected(null);
          onAddToDay(place);
        }}
      />

      <PlaceFormSheet
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        initial={editing}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}

// Re-exported so TodayDashboard can warm the members cache without touching lib.
export async function warmMembersCache(): Promise<void> {
  try {
    const members = await fetchMembers(getSupabaseBrowserClient());
    void readSnapshot("snapshot:members-warm");
    void cacheSnapshot("snapshot:members-warm", members);
  } catch {
    // Best effort only.
  }
}
