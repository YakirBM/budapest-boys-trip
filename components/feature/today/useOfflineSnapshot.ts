"use client";

import { useEffect, useState } from "react";
import { cacheSnapshot, readSnapshot } from "@/lib/offline/db";

/**
 * Offline snapshot helper for the planning screens (docs/07 §offline data layer).
 * - `cacheSnapshot` mirrors the latest query data into IndexedDB on every change.
 * - `fetchWithOfflineFallback` serves the last cached snapshot when the device is
 *   offline and the network query fails (TanStack keeps `initialData` meanwhile).
 * - The hook exposes `isOffline` + `syncedAt` so screens can render the
 *   "עודכן לאחרונה" caption (common.updatedAt) required by the offline spec.
 */

export function useOfflineSnapshot<T>(key: string, data: T): { isOffline: boolean; syncedAt: number | null } {
  const [isOffline, setIsOffline] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  // Connection state.
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Latest synced_at from a previous session's snapshot (before overwriting it).
  useEffect(() => {
    let cancelled = false;
    void readSnapshot<unknown>(key).then((snap) => {
      if (!cancelled && snap) setSyncedAt((prev) => prev ?? snap.synced_at);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Persist the current data on every change.
  useEffect(() => {
    void cacheSnapshot(key, data);
    setSyncedAt(Date.now());
  }, [key, data]);

  return { isOffline, syncedAt };
}

/** Runs the network query; on failure while offline, falls back to the snapshot. */
export async function fetchWithOfflineFallback<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (typeof navigator !== "undefined" && navigator.onLine) throw err;
    const snap = await readSnapshot<T>(key);
    if (snap) return snap.data;
    throw err;
  }
}
