import Dexie, { type Table } from "dexie";

/**
 * On-device store (docs/07 §Offline data layer).
 * Supabase stays the source of truth; Dexie mirrors the offline pack and
 * queues mutations. Signed URLs / private documents are NEVER cached here.
 */

export interface CachedSnapshot<T = unknown> {
  key: string;
  data: T;
  synced_at: number;
}

export interface OutboxOp {
  /** Client-generated ULID-ish id — also used as the row PK for idempotent inserts. */
  id: string;
  /** Target table on Supabase. */
  table: "expenses" | "checklist_items" | "votes" | "safety_notices" | "day_notes" | "app_events";
  /** Insert (idempotent via client PK) | update (LWW by updated_at). */
  op: "insert" | "update";
  payload: Record<string, unknown>;
  created_at: number;
  attempts: number;
  last_error?: string;
  failed?: boolean;
}

export interface TodayPlanItem {
  id: string;
  day_number: number;
  item: Record<string, unknown>;
}

export class TripDB extends Dexie {
  snapshots!: Table<CachedSnapshot, string>;
  outbox!: Table<OutboxOp, string>;
  today_plan!: Table<TodayPlanItem, string>;

  constructor() {
    super("budapest-trip");
    this.version(1).stores({
      snapshots: "key, synced_at",
      outbox: "id, created_at, failed",
      today_plan: "id, day_number",
    });
  }
}

let dbInstance: TripDB | undefined;

export function getDb(): TripDB {
  if (!dbInstance) dbInstance = new TripDB();
  return dbInstance;
}

/** Persist a snapshot bundle for offline rendering. */
export async function cacheSnapshot(key: string, data: unknown): Promise<void> {
  await getDb().snapshots.put({ key, data, synced_at: Date.now() });
}

export async function readSnapshot<T>(key: string): Promise<CachedSnapshot<T> | undefined> {
  return (await getDb().snapshots.get(key)) as CachedSnapshot<T> | undefined;
}

function newId(): string {
  // UUID v4 — used as the row PK on insert, so it must be a valid uuid
  // (replay-idempotency depends on it surviving in UUID-PK tables).
  return crypto.randomUUID();
}

/** Queue a mutation (optimistic UI has already been applied by the caller). */
export async function enqueue(
  table: OutboxOp["table"],
  op: OutboxOp["op"],
  payload: Record<string, unknown>,
): Promise<OutboxOp> {
  const record: OutboxOp = { id: newId(), table, op, payload, created_at: Date.now(), attempts: 0 };
  await getDb().outbox.add(record);
  void requestSync();
  return record;
}

export async function pendingCount(): Promise<number> {
  return getDb().outbox.filter((op) => !op.failed).count();
}

/** Ask the platform to flush: Background Sync where available, else immediate. */
export async function requestSync(): Promise<void> {
  if (typeof navigator === "undefined") return;
  try {
    const registration = await navigator.serviceWorker?.ready;
    const sync = (
      registration as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      }
    ).sync;
    if (sync) {
      await sync.register("outbox-flush");
      return;
    }
  } catch {
    // fall through to in-page flush
  }
  // iOS fallback: flush on `online`/`visibilitychange` listeners + now.
  void flushOutbox();
}

/**
 * Ordered outbox replay (docs/07 §Background sync).
 * inserts are idempotent (client PK); updates send updated_at for LWW.
 * Permanent 4xx failures are marked `failed` and surfaced — never dropped silently.
 */
export async function flushOutbox(): Promise<{ flushed: number; failed: number }> {
  const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
  const supabase = getSupabaseBrowserClient();
  const db = getDb();

  const ops = await db.outbox.orderBy("created_at").toArray();
  let flushed = 0;
  let failed = 0;

  for (const op of ops) {
    if (op.failed) {
      failed += 1;
      continue;
    }
    try {
      if (op.op === "insert") {
        const { error } = await supabase.from(op.table).insert({ ...op.payload, id: op.id });
        if (error) throw error;
      } else {
        const id = op.payload["id"];
        const payload = { ...op.payload, updated_at: new Date().toISOString() };
        const { error } = await supabase.from(op.table).update(payload).eq("id", String(id));
        if (error) throw error;
      }
      await db.outbox.delete(op.id);
      flushed += 1;
    } catch (err) {
      const message = String((err as Error).message ?? err);
      const httpStatus = (err as { status?: number }).status;
      const isPermanent = typeof httpStatus === "number" && httpStatus >= 400 && httpStatus < 500;
      const offline = typeof navigator !== "undefined" && !navigator.onLine;

      if (offline) {
        break; // ordered replay — retry on the next sync trigger
      }
      if (isPermanent) {
        // Server definitively rejected (RLS/validation/conflict) — surface, never drop.
        await db.outbox.update(op.id, {
          failed: true,
          attempts: op.attempts + 1,
          last_error: message,
        });
        failed += 1;
        continue;
      }
      // Transient (5xx/network) — backoff via attempts; stop replay at the blocker.
      const attempts = op.attempts + 1;
      await db.outbox.update(op.id, { attempts, last_error: message });
      if (attempts >= 7) {
        await db.outbox.update(op.id, { failed: true });
        failed += 1;
      } else {
        break;
      }
    }
  }

  return { flushed, failed };
}
