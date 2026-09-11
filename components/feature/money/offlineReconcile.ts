"use client";

import { readSnapshot, getDb } from "@/lib/offline/db";
import { attachExpenseSplitsAction, type SplitsAttachment, type SplitPlan } from "@/lib/actions/money";

/**
 * Reconnect reconcile for offline-entered expenses (docs/07 §Background sync).
 * The generic outbox replay inserts the expense row only — this helper attaches
 * the split plan that was persisted next to the op (keyed by op id, which IS
 * the expense row PK). Idempotent server-side; snapshots are cleaned either way.
 * Only logged failures are surfaced — never silent drops.
 */
export async function reconcileExpenseSplits(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const db = getDb();
  const ops = await db.outbox.where("table").equals("expenses").toArray();
  if (ops.length === 0) return;

  const attachments: SplitsAttachment[] = [];
  const staleKeys: string[] = [];

  for (const op of ops) {
    const snap = await readSnapshot<SplitPlan>(`expense-splits:${op.id}`);
    if (!snap) continue;
    if (op.failed) {
      // The expense was permanently rejected — its split plan is moot.
      staleKeys.push(`expense-splits:${op.id}`);
      continue;
    }
    attachments.push({ expenseId: op.id, plan: snap.data });
  }

  if (staleKeys.length > 0) {
    await db.snapshots.bulkDelete(staleKeys);
  }
  if (attachments.length === 0) return;

  const result = await attachExpenseSplitsAction(attachments);
  if (result.ok) {
    await db.snapshots.bulkDelete(attachments.map((a) => `expense-splits:${a.expenseId}`));
  } else {
    console.error("expense splits attach failed", result.error);
  }
}
