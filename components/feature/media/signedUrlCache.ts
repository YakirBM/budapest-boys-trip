"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * In-memory signed-URL cache (docs/06-features/07 §Signed URL flow).
 * TTL 1h server-side; re-signed when < 5 min remain. NEVER persisted to
 * IndexedDB, localStorage, logs or analytics — memory only, dies with the tab.
 */

const TTL_MS = 55 * 60 * 1000; // treat the 3600s TTL as 55 min for safety
const RENEW_THRESHOLD_MS = 5 * 60 * 1000;

const cache = new Map<string, { url: string; expiresAt: number }>();

function fresh(path: string): boolean {
  const entry = cache.get(path);
  return entry !== undefined && entry.expiresAt - Date.now() > RENEW_THRESHOLD_MS;
}

/** Batch-sign the given storage paths (one createSignedUrls call per batch). */
export async function getSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const missing = [...new Set(paths)].filter((p) => !fresh(p));
  if (missing.length > 0) {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.storage.from("trip-media").createSignedUrls(missing, 3600);
    if (error) throw error;
    const now = Date.now();
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        cache.set(item.path, { url: item.signedUrl, expiresAt: now + TTL_MS });
      }
    }
  }
  const out = new Map<string, string>();
  for (const path of paths) {
    const entry = cache.get(path);
    if (entry) out.set(path, entry.url);
  }
  return out;
}

/** URL known-valid right now, else null (no signing side effect). */
export function peekSignedUrl(path: string): string | null {
  return fresh(path) ? (cache.get(path)?.url ?? null) : null;
}

/** Register a freshly-minted URL (e.g. right after an upload). */
export function primeSignedUrl(path: string, url: string): void {
  cache.set(path, { url, expiresAt: Date.now() + TTL_MS });
}
