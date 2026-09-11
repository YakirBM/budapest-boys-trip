"use client";

import { useEffect } from "react";
import { flushOutbox, pendingCount } from "@/lib/offline/db";

/**
 * Flush triggers (docs/07 §Background sync):
 * - Background Sync `outbox-flush` wakes the SW → it messages this client.
 * - `online` event + app foreground (visibilitychange) — the iOS fallback.
 * Replays are ordered and idempotent (client-generated PKs).
 */
export function useOutboxSync(onChange?: (pending: number) => void): void {
  useEffect(() => {
    let cancelled = false;

    const notify = async () => {
      const count = await pendingCount();
      if (!cancelled) onChange?.(count);
    };

    const trigger = () => {
      void flushOutbox().then(notify);
    };

    void notify();
    window.addEventListener("online", trigger);
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") trigger();
    });

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "outbox-flush") trigger();
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    return () => {
      cancelled = true;
      window.removeEventListener("online", trigger);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
