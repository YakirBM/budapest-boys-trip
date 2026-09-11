"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { t } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { TRIP_ID } from "@/lib/data/today";
import { cacheSnapshot, readSnapshot } from "@/lib/offline/db";
import { Button } from "@/components/ui/Button";
import { pushToast } from "@/components/ui/Toast";

export interface ScheduleComment {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  pending?: boolean;
}

export interface CommentsThreadProps {
  itemId: string;
  itemKind: "group" | "personal" | "place";
  authorId: string;
}

const MAX_LEN = 280;

/**
 * CommentsThread — per-tile thread over item_comments (docs/14 §3.2.4).
 * 280-char limit, optimistic + offline queue (local snapshot + outbox-style
 * insert with client UUID; server reconcile replaces the local id).
 */
export function CommentsThread({ itemId, itemKind, authorId }: CommentsThreadProps) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["comments", itemId] as const, [itemId]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ScheduleComment[]> => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: rows, error } = await supabase
          .from("item_comments")
          .select("id, body, author_id, created_at")
          .eq("item_id", itemId)
          .order("created_at", { ascending: true })
          .limit(50);
        if (error) throw error;
        const authorIds = [...new Set((rows ?? []).map((r) => r.author_id as string))];
        let names = new Map<string, string>();
        if (authorIds.length > 0) {
          const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", authorIds);
          names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));
        }
        const comments: ScheduleComment[] = (rows ?? []).map((r) => ({
          id: r.id as string,
          body: r.body as string,
          authorId: r.author_id as string,
          authorName: names.get(r.author_id as string) ?? null,
          createdAt: r.created_at as string,
        }));
        void cacheSnapshot(`comments:${itemId}`, comments);
        return comments;
      } catch (err) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const snap = await readSnapshot<ScheduleComment[]>(`comments:${itemId}`);
          if (snap) return snap.data;
        }
        throw err;
      }
    },
    staleTime: 30_000,
  });

  // Realtime: item_comments inserts invalidate this thread.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`comments:${itemId}`)
      .on(
        "postgres_changes" as const,
        { event: "*", schema: "public", table: "item_comments" },
        () => {
          void queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [itemId, queryClient, queryKey]);

  async function handleSend(): Promise<void> {
    const body = draft.trim();
    if (!body || body.length > MAX_LEN || sending) return;
    setSending(true);
    const localId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}`;
    const optimistic: ScheduleComment = {
      id: localId,
      body,
      authorId,
      authorName: null,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    const previous = queryClient.getQueryData<ScheduleComment[]>(queryKey);
    queryClient.setQueryData<ScheduleComment[]>(queryKey, [...(previous ?? []), optimistic]);
    setDraft("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("item_comments")
        .insert({
          id: localId.startsWith("local-") ? undefined : localId,
          trip_id: TRIP_ID,
          item_id: itemId,
          item_kind: itemKind,
          author_id: authorId,
          body,
        })
        .select("id")
        .single();
      if (error) throw error;
      // Reconcile: replace the optimistic local id with the server id.
      if (data?.id && data.id !== localId) {
        queryClient.setQueryData<ScheduleComment[]>(queryKey, (current) =>
          (current ?? []).map((c) => (c.id === localId ? { ...c, id: data.id as string, pending: false } : c)),
        );
      }
      pushToast({ message: t("today.tile.commentSent"), type: "success" });
    } catch {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        pushToast({ message: t("today.tile.commentQueued"), type: "info" });
        // Keep the optimistic row; queue for replay via snapshots key.
        const snap = await readSnapshot<ScheduleComment[]>(`comments:${itemId}`);
        void cacheSnapshot(`comments:${itemId}`, [...(snap?.data ?? previous ?? []), optimistic]);
      } else {
        queryClient.setQueryData(queryKey, previous);
        pushToast({ message: t("today.errors.noteFailed"), type: "danger" });
      }
    } finally {
      setSending(false);
      void queryClient.invalidateQueries({ queryKey });
    }
  }

  const comments = query.data ?? [];
  const remaining = MAX_LEN - draft.trim().length;

  return (
    <section aria-label={t("today.comments.title")} className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-text-primary">
        {t("today.comments.title")}
        {comments.length > 0 && (
          <span dir="ltr" className="ltr-iso tnum ms-1 text-xs font-semibold text-text-muted">
            {comments.length}
          </span>
        )}
      </h3>
      {comments.length === 0 ? (
        <p className="text-xs text-text-muted">{t("today.comments.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-xl bg-surface p-2.5">
              <p className="text-sm leading-6 text-text-primary">{comment.body}</p>
              <p className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
                <span className="max-w-32 truncate">{comment.authorName ?? "—"}</span>
                <span dir="ltr" className="ltr-iso tnum">
                  {new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" }).format(
                    new Date(comment.createdAt),
                  )}
                </span>
                {comment.pending && <span>{t("today.feed.pendingNote")}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor={`comment-${itemId}`} className="sr-only">
          {t("today.tile.addComment")}
        </label>
        <textarea
          id={`comment-${itemId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_LEN}
          rows={2}
          placeholder={t("today.tile.commentPlaceholder")}
          className="min-h-12 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
        />
        <Button disabled={draft.trim().length === 0 || draft.trim().length > MAX_LEN} loading={sending} onClick={() => void handleSend()}>
          {t("today.comments.send")}
        </Button>
      </div>
      <p className="text-[11px] text-text-muted">
        <span dir="ltr" className="ltr-iso tnum">
          {remaining}
        </span>{" "}
        · {t("today.comments.tooLong")}
      </p>
    </section>
  );
}
