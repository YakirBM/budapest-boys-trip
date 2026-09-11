"use client";

import { TRIP_ID } from "@/lib/data/today";
import { addDayNoteAction } from "@/lib/actions/today";
import { enqueue } from "@/lib/offline/db";

/**
 * Feed-note posting for the Today quick actions ("יצאנו", "מאחר ב-X דק'", notes).
 * Online → server action (realtime refetch follows). Offline → optimistic outbox
 * row for `day_notes`; the note renders immediately with a pending flag.
 */
export async function postDayNote(opts: {
  dayPlanId: string;
  authorId: string;
  body: string;
  noteKind: "user" | "system";
}): Promise<{ pending: boolean }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueue("day_notes", "insert", {
      trip_id: TRIP_ID,
      day_plan_id: opts.dayPlanId,
      author_id: opts.authorId,
      body: opts.body,
      note_kind: opts.noteKind,
    });
    return { pending: true };
  }

  const result = await addDayNoteAction({
    dayPlanId: opts.dayPlanId,
    body: opts.body,
    noteKind: opts.noteKind,
  });
  if (!result.ok) {
    throw new Error(result.error?.code ?? "noteFailed");
  }
  return { pending: false };
}
