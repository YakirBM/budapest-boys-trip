"use client";

import { useState, type FormEvent } from "react";
import { Vote } from "lucide-react";
import { t } from "@/lib/i18n";
import { formatInTz } from "@/lib/utils/time";
import { TZ_BUDAPEST } from "@/lib/utils/time";
import type { DayNoteInfo, OpenPollInfo } from "@/lib/data/today";
import { Card } from "@/components/ui/Card";
import { PendingSyncBadge } from "@/components/ui/PendingSyncBadge";
import { MemberAvatar } from "@/components/ui/MemberAvatar";

export interface DayFeedProps {
  notes: DayNoteInfo[];
  openPolls: OpenPollInfo[];
  pendingCount: number;
  onAddNote: (body: string) => void;
}

/**
 * DayFeed — "שינויים והחלטות" (doc 00): quick notes from the group (not a chat),
 * the offline-pending badge, and an open-polls shortcut card. Reactions are a
 * later increment (see BUILD_STATUS T-012 notes).
 */
export function DayFeed({ notes, openPolls, pendingCount, onAddNote }: DayFeedProps) {
  const [draft, setDraft] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    onAddNote(body);
    setDraft("");
  };

  const totalVotes = openPolls.reduce((sum, poll) => sum + poll.votes, 0);

  return (
    <section aria-label={t("today.feedTitle")} className="mb-6 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-text-primary">{t("today.feedTitle")}</h2>
        <PendingSyncBadge count={pendingCount} />
      </div>

      {openPolls.length > 0 && (
        <Card className="flex items-center gap-3 bg-brand-soft">
          <Vote aria-hidden size={20} className="shrink-0 text-brand-strong" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-brand-strong">{t("today.feed.openPolls")}</p>
            <p className="truncate text-xs text-text-secondary">
              {openPolls.map((poll) => poll.question).join(" · ")}
            </p>
          </div>
          <span className="shrink-0 text-xs text-text-muted">
            {t("today.feed.openPollsHint", { count: openPolls.length, votes: totalVotes })}
          </span>
        </Card>
      )}

      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("today.feed.addPlaceholder")}
          aria-label={t("today.feed.addPlaceholder")}
          maxLength={280}
          className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={draft.trim().length === 0}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-contrast disabled:opacity-50"
        >
          {t("today.feed.add")}
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="rounded-xl bg-surface p-3 text-sm text-text-muted">{t("today.feed.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id}>
              <Card className="flex items-start gap-2.5 p-3">
                {note.authorName && <MemberAvatar name={note.authorName} size={32} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-bold text-text-secondary">
                      {note.authorName ?? "—"}
                      {note.noteKind === "system" && (
                        <span className="ms-1 rounded-full bg-info/12 px-1.5 py-0.5 text-[10px] font-bold text-info">
                          {t("today.feed.systemBadge")}
                        </span>
                      )}
                    </span>
                    <span dir="ltr" className="tnum shrink-0 text-[11px] text-text-muted">
                      {formatInTz(new Date(note.createdAt), TZ_BUDAPEST)}
                    </span>
                  </div>
                  <p className="mt-0.5 break-words text-sm text-text-primary">
                    {note.body}
                    {note.pending && (
                      <span className="ms-2 inline-block rounded-full bg-info/12 px-1.5 py-0.5 text-[10px] font-bold text-info">
                        {t("today.feed.pendingNote")}
                      </span>
                    )}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
