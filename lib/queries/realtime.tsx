"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * TanStack Query provider + one Realtime channel per trip (docs/02 §Realtime plan).
 * Events only invalidate query keys — never hand-merge payloads into cache.
 */
const TABLE_TO_KEYS: Record<string, string[]> = {
  expenses: ["expenses", "balances"],
  checklist_items: ["checklists", "my-items"],
  polls: ["polls"],
  poll_options: ["polls"],
  votes: ["polls"],
  media_items: ["media"],
  media_reactions: ["media"],
  itinerary_items: ["today", "route"],
  places: ["places", "route"],
  flight_passengers: ["flights"],
  accommodations: ["stay"],
  day_notes: ["day-feed"],
  safety_notices: ["safety"],
};

export function QueryProvider({
  children,
  tripId,
}: {
  children: React.ReactNode;
  tripId: string;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 24 * 60 * 60_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(`trip:${tripId}`);

    for (const [table, keys] of Object.entries(TABLE_TO_KEYS)) {
      channel.on(
        "postgres_changes" as const,
        { event: "*", schema: "public", table },
        (payload) => {
          for (const key of keys) {
            void queryClient.invalidateQueries({ queryKey: [key, tripId] });
          }
          if (payload.errors?.length) console.error("realtime payload errors", payload.errors);
        },
      );
    }

    void channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        // Token refresh can drop channels — resubscribe.
        void supabase.removeChannel(channel);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, tripId]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
