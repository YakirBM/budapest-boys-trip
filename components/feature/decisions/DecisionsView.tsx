"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gavel, History, Plus, Share2, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { EstimateBadge } from "@/components/ui/EstimateBadge";
import { Fab } from "@/components/ui/FAB";
import { formatMoney } from "@/components/ui/MoneyAmount";
import { VoteBar } from "@/components/ui/VoteBar";
import { useCountdown, type Countdown } from "@/components/ui/CountdownCard";
import { pushToast } from "@/components/ui/Toast";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cacheSnapshot, readSnapshot } from "@/lib/offline/db";
import { createPollAction, convertDecisionAction, type ConvertDecisionInput } from "@/lib/actions/decisions";
import type {
  DecisionBoard,
  DayPlanRow,
  PollOptionRow,
  PollRow,
  VoteRow,
} from "@/lib/data/decisions";
import type { TripMember } from "@/lib/data/trip";
import { whatsappShare } from "@/lib/utils/deeplinks";
import { CURRENCIES, type Currency } from "@/lib/utils/money";

export interface DecisionsViewProps {
  tripId: string;
  initial: DecisionBoard;
  members: TripMember[];
  userId: string;
}

interface PollsPayload {
  polls: PollRow[];
  options: PollOptionRow[];
  votes: VoteRow[];
  dayPlans: DayPlanRow[];
  stale: boolean;
}

const POLLS_CACHE_KEY = "polls";

async function fetchPolls(tripId: string): Promise<PollsPayload> {
  const supabase = getSupabaseBrowserClient();
  try {
    const pollsRes = await supabase
      .from("polls")
      .select(
        "id,question,status,deadline,quorum_rule,anonymous_until_close,created_by,decided_option_id,decision_note,closed_at,closed_reason,winner_item_id",
      )
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (pollsRes.error) throw pollsRes.error;
    const polls = ((pollsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      question: String(row["question"]),
      status: (row["status"] === "closed" ? "closed" : "open") as PollRow["status"],
      deadline: String(row["deadline"]),
      quorum_rule: (row["quorum_rule"] === "unanimous" ? "unanimous" : "majority") as PollRow["quorum_rule"],
      anonymous_until_close: Boolean(row["anonymous_until_close"]),
      created_by: String(row["created_by"]),
      decided_option_id: row["decided_option_id"] === null ? null : String(row["decided_option_id"]),
      decision_note: row["decision_note"] === null ? null : String(row["decision_note"]),
      closed_at: row["closed_at"] === null ? null : String(row["closed_at"]),
      closed_reason: row["closed_reason"] === null ? null : String(row["closed_reason"]),
      winner_item_id: row["winner_item_id"] === null ? null : String(row["winner_item_id"]),
    }));
    const pollIds = polls.map((p) => p.id);

    const [optionsRes, votesRes, dayRes] = await Promise.all([
      pollIds.length > 0
        ? supabase
            .from("poll_options")
            .select(
              "id,poll_id,label,est_cost,currency,travel_min,time_needed_min,availability_note,source,last_verified_at,sort_order",
            )
            .in("poll_id", pollIds)
            .order("sort_order")
        : Promise.resolve({ data: [], error: null }),
      pollIds.length > 0
        ? supabase.from("votes").select("poll_id,option_id,member_id").in("poll_id", pollIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("day_plans").select("id,day_number,date").eq("trip_id", tripId).order("day_number"),
    ]);
    if (optionsRes.error) throw optionsRes.error;
    if (votesRes.error) throw votesRes.error;
    if (dayRes.error) throw dayRes.error;

    const payload: PollsPayload = {
      polls,
      options: ((optionsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        poll_id: String(row["poll_id"]),
        label: String(row["label"]),
        est_cost: row["est_cost"] === null ? null : Number(row["est_cost"]),
        currency: String(row["currency"] ?? "HUF"),
        travel_min: row["travel_min"] === null ? null : Number(row["travel_min"]),
        time_needed_min: row["time_needed_min"] === null ? null : Number(row["time_needed_min"]),
        availability_note: row["availability_note"] === null ? null : String(row["availability_note"]),
        source: row["source"] === null ? null : String(row["source"]),
        last_verified_at: row["last_verified_at"] === null ? null : String(row["last_verified_at"]),
        sort_order: Number(row["sort_order"] ?? 0),
      })),
      votes: ((votesRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        poll_id: String(row["poll_id"]),
        option_id: String(row["option_id"]),
        member_id: String(row["member_id"]),
      })),
      dayPlans: ((dayRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        day_number: Number(row["day_number"]),
        date: String(row["date"]),
      })),
      stale: false,
    };
    await cacheSnapshot(POLLS_CACHE_KEY, payload);
    return payload;
  } catch (err) {
    const snap = await readSnapshot<PollsPayload>(POLLS_CACHE_KEY);
    if (snap) return { ...snap.data, stale: true };
    throw err;
  }
}

function countdownText(c: Countdown): string {
  if (c.days > 0) return t("today.daysLeft", { count: c.days });
  if (c.hours > 0) return t("today.hoursLeft", { count: c.hours });
  if (c.minutes > 1) return t("today.minutesLeft", { count: c.minutes });
  return t("today.oneMinuteLeft");
}

const deadlineFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });

/** Local datetime-local string for now (deadline input min/value). */
function localInput(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Mirrors the DB enum itinerary_category (docs/03 §3). */
const CONVERT_CATEGORIES = [
  "food",
  "attraction",
  "walk",
  "transit",
  "rest",
  "nightlife",
  "flight",
  "accommodation",
  "other",
] as const;

const CONVERT_CATEGORY_LABELS: Record<(typeof CONVERT_CATEGORIES)[number], string> = {
  food: t("categories.food"),
  attraction: t("categories.attraction"),
  walk: t("categories.walk"),
  transit: t("categories.transit"),
  rest: t("categories.rest"),
  nightlife: t("categories.nightlife"),
  flight: t("categories.flight"),
  accommodation: t("categories.accommodation"),
  other: t("categories.other"),
};

/**
 * Decisions & polls (docs/06-features/09): open polls with deadline countdown
 * and turnout, voting (direct upsert — requires connection; deferred offline),
 * the composer, WhatsApp share, and the append-only decision log with one-tap
 * idempotent conversion into the itinerary.
 */
export function DecisionsView({ tripId, initial, members, userId }: DecisionsViewProps) {
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [convertPollId, setConvertPollId] = useState<string | null>(null);

  const pollsQ = useQuery({
    queryKey: ["polls", tripId],
    queryFn: () => fetchPolls(tripId),
    initialData: {
      polls: initial.polls,
      options: initial.options,
      votes: initial.votes,
      dayPlans: initial.dayPlans,
      stale: false,
    },
  });

  const openPolls = pollsQ.data.polls.filter((p) => p.status === "open");
  const closedPolls = pollsQ.data.polls.filter((p) => p.status === "closed");
  const optionsOf = (pollId: string): PollOptionRow[] =>
    pollsQ.data.options.filter((o) => o.poll_id === pollId);
  const votesOf = (pollId: string): VoteRow[] => pollsQ.data.votes.filter((v) => v.poll_id === pollId);

  function saveVote(poll: PollRow, optionId: string): void {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      pushToast({ message: t("decisions.requiresConnection"), type: "danger" });
      return;
    }
    queryClient.setQueryData<PollsPayload>(["polls", tripId], (old) =>
      old
        ? {
            ...old,
            votes: [
              ...old.votes.filter((v) => !(v.poll_id === poll.id && v.member_id === userId)),
              { poll_id: poll.id, option_id: optionId, member_id: userId },
            ],
          }
        : old,
    );
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("votes").upsert(
        { trip_id: tripId, poll_id: poll.id, option_id: optionId, member_id: userId },
        { onConflict: "poll_id,member_id" },
      );
      if (error) {
        void queryClient.invalidateQueries({ queryKey: ["polls", tripId] });
        pushToast({
          message: typeof error.code === "string" && error.code.startsWith("4")
            ? t("decisions.errors.deadlinePassed")
            : t("decisions.errors.generic"),
          type: "danger",
        });
        return;
      }
      pushToast({ message: t("decisions.voteSavedToast"), type: "success" });
    })();
  }

  const convertPoll = convertPollId !== null ? pollsQ.data.polls.find((p) => p.id === convertPollId) ?? null : null;

  return (
    <>
      {/* Open polls */}
      <section aria-label={t("decisions.openPolls")} className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-text-primary">
          <Gavel aria-hidden size={18} className="text-brand" />
          {t("decisions.openPolls")} ({openPolls.length})
        </h2>
        {openPolls.length === 0 ? (
          <EmptyState illustration="poll" title={t("decisions.empty")} hint={t("decisions.emptyHint")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {openPolls.map((poll) => (
              <li key={poll.id}>
                <Card>
                  <OpenPollCard
                    poll={poll}
                    options={optionsOf(poll.id)}
                    votes={votesOf(poll.id)}
                    activeCount={members.filter((m) => m.status === "active").length}
                    userId={userId}
                    onSaveVote={(optionId) => saveVote(poll, optionId)}
                  />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Decision log */}
      <section aria-label={t("decisions.decisionLog")}>
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-text-primary">
          <History aria-hidden size={18} className="text-brand" />
          {t("decisions.decisionLog")}
        </h2>
        {closedPolls.length === 0 ? (
          <EmptyState illustration="poll" title={t("decisions.emptyLog")} hint={t("decisions.emptyLogHint")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {closedPolls.map((poll) => (
              <li key={poll.id}>
                <Card>
                  <ClosedPollCard
                    poll={poll}
                    options={optionsOf(poll.id)}
                    votes={votesOf(poll.id)}
                    nameOf={new Map(members.map((m) => [m.user_id, m.full_name]))}
                    onConvert={() => setConvertPollId(poll.id)}
                  />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Fab label={t("decisions.createPollAria")} onClick={() => setComposerOpen(true)} />

      <PollComposerSheet
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPublished={() => void queryClient.invalidateQueries({ queryKey: ["polls", tripId] })}
      />

      {convertPoll && (
        <ConvertSheet
          poll={convertPoll}
          options={optionsOf(convertPoll.id)}
          dayPlans={pollsQ.data.dayPlans}
          onClose={() => setConvertPollId(null)}
          onConverted={() => void queryClient.invalidateQueries({ queryKey: ["polls", tripId] })}
        />
      )}
    </>
  );
}

function OpenPollCard({
  poll,
  options,
  votes,
  activeCount,
  userId,
  onSaveVote,
}: {
  poll: PollRow;
  options: PollOptionRow[];
  votes: VoteRow[];
  activeCount: number;
  userId: string;
  onSaveVote: (optionId: string) => void;
}) {
  const countdown = useCountdown(poll.deadline, 30_000);
  const myVote = votes.find((v) => v.member_id === userId)?.option_id ?? null;
  const [selected, setSelected] = useState<string | null>(myVote);
  useEffect(() => {
    setSelected(myVote);
  }, [myVote]);

  const shareText = t("decisions.shareTemplate", {
    question: poll.question,
    options: options.map((o, i) => `${i + 1}. ${o.label}`).join("\n"),
  });

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-bold text-text-primary">{poll.question}</h3>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
        <span>
          {t("decisions.closesAt", { time: deadlineFormatter.format(new Date(poll.deadline)) })}
          {countdown !== null && countdownSuffix(countdown)}
        </span>
        <span aria-hidden>·</span>
        <span>{QUORUM_LABELS[poll.quorum_rule]}</span>
        <span aria-hidden>·</span>
        <span>{t("decisions.turnout", { count: votes.length, total: activeCount })}</span>
        {poll.anonymous_until_close && (
          <>
            <span aria-hidden>·</span>
            <span>{t("decisions.anonymousHint")}</span>
          </>
        )}
      </div>

      {myVote !== null && (
        <p className="text-xs font-bold text-success">
          {t("decisions.myVote", { label: options.find((o) => o.id === myVote)?.label ?? "" })}
        </p>
      )}

      <div role="radiogroup" aria-label={poll.question} className="flex flex-col gap-1.5">
        {options.map((option) => {
          const optionVotes = poll.anonymous_until_close ? null : votes.filter((v) => v.option_id === option.id).length;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected === option.id}
              onClick={() => setSelected(option.id)}
              className={
                selected === option.id
                  ? "flex min-h-12 flex-col items-start gap-0.5 rounded-xl border-2 border-brand bg-brand-soft px-3 py-2 text-start"
                  : "flex min-h-12 flex-col items-start gap-0.5 rounded-xl border border-border bg-surface px-3 py-2 text-start active:opacity-80"
              }
            >
              <span className="flex w-full items-center gap-2">
                <span
                  aria-hidden
                  className={
                    selected === option.id
                      ? "h-4 w-4 shrink-0 rounded-full border-[5px] border-brand"
                      : "h-4 w-4 shrink-0 rounded-full border-2 border-border"
                  }
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                  {option.label}
                </span>
                {optionVotes !== null && (
                  <span className="tnum shrink-0 text-xs font-bold text-text-muted" dir="ltr">
                    {optionVotes}
                  </span>
                )}
              </span>
              {(option.est_cost !== null || option.travel_min !== null || option.time_needed_min !== null) && (
                <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-text-muted ps-6">
                  {option.est_cost !== null && (
                    <span dir="ltr" className="tnum font-semibold">
                      {t("decisions.optionEstimated", {
                        cost: formatMoney(option.est_cost, (CURRENCIES as readonly string[]).includes(option.currency) ? (option.currency as Currency) : "HUF"),
                      })}
                    </span>
                  )}
                  {option.source && option.last_verified_at ? (
                    <EstimateBadge source={option.source} lastVerifiedAt={option.last_verified_at} />
                  ) : option.est_cost !== null ? (
                    <span className="font-bold text-warning">{t("common.unverified")}</span>
                  ) : null}
                  {option.travel_min !== null && <span>{t("decisions.travelMin", { min: option.travel_min })}</span>}
                  {option.time_needed_min !== null && <span>{t("decisions.timeNeeded", { min: option.time_needed_min })}</span>}
                </span>
              )}
              {option.availability_note && (
                <span className="ps-6 text-[11px] text-text-muted">
                  {t("decisions.availability", { note: option.availability_note })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => selected !== null && onSaveVote(selected)}
          disabled={selected === null}
          className="flex-1"
        >
          {t("decisions.saveVote")}
        </Button>
        <a
          href={whatsappShare(shareText)}
          target="_blank"
          rel="noreferrer"
          aria-label={t("decisions.shareAria")}
          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-bold text-text-secondary transition-opacity active:opacity-80"
        >
          <Share2 aria-hidden size={16} />
          {t("decisions.sharePoll")}
        </a>
      </div>
    </div>
  );
}

/** Deadline countdown suffix, e.g. " (בעוד 3 דק')". */
function countdownSuffix(countdown: Countdown): string {
  return ` (${countdownText(countdown)})`;
}

function ClosedPollCard({
  poll,
  options,
  votes,
  nameOf,
  onConvert,
}: {
  poll: PollRow;
  options: PollOptionRow[];
  votes: VoteRow[];
  nameOf: Map<string, string>;
  onConvert: () => void;
}) {
  const decided = options.find((o) => o.id === poll.decided_option_id) ?? null;
  void nameOf;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-text-primary">{poll.question}</h3>
      {poll.closed_at && (
        <p className="text-xs text-text-muted">
          {t("decisions.closesAt", { time: deadlineFormatter.format(new Date(poll.closed_at)) })} ·{" "}
          {t("decisions.votes", { count: votes.length })}
        </p>
      )}
      <VoteBar
        options={options.map((o) => ({ id: o.id, label: o.label, votes: votes.filter((v) => v.option_id === o.id).length }))}
        state="closed"
      />
      {decided ? (
        <p className="text-sm text-text-primary">
          <span className="font-bold">{t("decisions.log.winner")}: </span>
          {decided.label}
        </p>
      ) : (
        <p className="text-sm font-bold text-text-secondary">{t("decisions.log.noWinner")}</p>
      )}
      {poll.decision_note && (
        <p className="text-sm text-text-secondary">
          <span className="font-bold">{t("decisions.log.decisionNote")}</span> {poll.decision_note}
        </p>
      )}
      {poll.decided_option_id !== null &&
        (poll.winner_item_id ? (
          <p className="rounded-lg bg-success/12 px-3 py-2 text-xs font-bold text-success">
            {t("decisions.log.convertedShort")}
          </p>
        ) : (
          <Button variant="secondary" block onClick={onConvert}>
            {t("decisions.log.convert")}
          </Button>
        ))}
    </div>
  );
}

function PollComposerSheet({
  open,
  onClose,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<{ label: string; cost: string; currency: Currency }[]>([
    { label: "", cost: "", currency: "HUF" },
    { label: "", cost: "", currency: "HUF" },
  ]);
  const [deadline, setDeadline] = useState<string>("");
  const [quorum, setQuorum] = useState<"majority" | "unanimous">("majority");
  const [anonymous, setAnonymous] = useState(false);
  const [errCode, setErrCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const minDeadline = localInput(new Date(Date.now() + 15 * 60_000));

  function updateOption(index: number, patch: Partial<{ label: string; cost: string; currency: Currency }>): void {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function publish(): void {
    setErrCode(null);
    if (question.trim() === "") return setErrCode("decisions.composer.errQuestion");
    const valid = options.filter((o) => o.label.trim() !== "");
    if (valid.length < 2 || valid.length > 5) {
      return setErrCode("decisions.composer.errOptions");
    }
    const deadlineMs = deadline === "" ? NaN : new Date(deadline).getTime();
    if (!Number.isFinite(deadlineMs) || deadlineMs < Date.now() + 15 * 60_000) {
      return setErrCode("decisions.composer.errDeadline");
    }

    setSaving(true);
    void createPollAction({
      question: question.trim(),
      options: valid.map((o) => ({
        label: o.label.trim(),
        estCost: o.cost.trim() === "" ? null : Number(o.cost.replace(",", ".")) || null,
        currency: o.currency,
      })),
      deadlineIso: new Date(deadlineMs).toISOString(),
      quorumRule: quorum,
      anonymousUntilClose: anonymous,
    })
      .then((result) => {
        setSaving(false);
        if (!result.ok) {
          setErrCode(
            result.error === "decisions.composer.errDeadline"
              ? "decisions.composer.errDeadline"
              : result.error === "decisions.errors.forbidden"
                ? "decisions.errors.forbidden"
                : "decisions.errors.generic",
          );
          return;
        }
        pushToast({ message: t("decisions.composer.publishedToast"), type: "success" });
        onPublished();
        setQuestion("");
        setOptions([
          { label: "", cost: "", currency: "HUF" },
          { label: "", cost: "", currency: "HUF" },
        ]);
        setDeadline("");
        onClose();
      })
      .catch(() => {
        setSaving(false);
        setErrCode("decisions.errors.generic");
      });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("decisions.composer.title")}>
      <div className="flex flex-col gap-4 pb-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("decisions.composer.questionLabel")}</span>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("decisions.composer.questionPlaceholder")}
            className="min-h-12 rounded-xl border border-border bg-surface px-4 text-text-primary outline-none focus:border-brand"
          />
        </label>

        <div>
          <p className="mb-1 text-xs font-semibold text-text-muted">{t("decisions.composer.optionsLabel")}</p>
          <div className="flex flex-col gap-2">
            {options.map((option, index) => (
              <div key={index} className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-2">
                <div className="flex items-center gap-2">
                  <span className="tnum shrink-0 text-xs font-bold text-text-muted" dir="ltr">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    value={option.label}
                    onChange={(e) => updateOption(index, { label: e.target.value })}
                    placeholder={t("decisions.composer.optionLabelPlaceholder")}
                    aria-label={`${t("decisions.composer.optionLabelPlaceholder")} ${index + 1}`}
                    className="min-h-12 flex-1 rounded-lg border border-border bg-surface-raised px-3 text-sm text-text-primary outline-none focus:border-brand"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      aria-label={t("decisions.composer.removeOption")}
                      onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                      className="inline-flex min-h-12 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted active:text-danger"
                    >
                      <X aria-hidden size={16} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 ps-6">
                  <input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    value={option.cost}
                    onChange={(e) => updateOption(index, { cost: e.target.value })}
                    placeholder={t("decisions.composer.optionCostLabel")}
                    aria-label={`${t("decisions.composer.optionCostLabel")} ${index + 1}`}
                    className="tnum min-h-10 w-32 rounded-lg border border-border bg-surface-raised px-2 text-xs text-text-primary outline-none focus:border-brand"
                  />
                  <select
                    value={option.currency}
                    onChange={(e) => updateOption(index, { currency: e.target.value as Currency })}
                    aria-label={`${option.currency}`}
                    className="min-h-10 rounded-lg border border-border bg-surface-raised px-2 text-xs text-text-primary outline-none focus:border-brand"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
          {options.length < 5 && (
            <Button
              variant="ghost"
              icon={<Plus aria-hidden size={16} />}
              onClick={() => setOptions((prev) => [...prev, { label: "", cost: "", currency: "HUF" }])}
              className="mt-1"
            >
              {t("decisions.composer.addOption")}
            </Button>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">{t("decisions.composer.deadlineLabel")}</span>
          <input
            type="datetime-local"
            value={deadline === "" ? minDeadline : deadline}
            min={minDeadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="min-h-12 rounded-xl border border-border bg-surface px-4 text-text-primary outline-none focus:border-brand"
          />
        </label>

        <div>
          <p className="mb-1 text-xs font-semibold text-text-muted">{t("decisions.composer.quorumLabel")}</p>
          <div role="radiogroup" aria-label={t("decisions.composer.quorumLabel")} className="grid grid-cols-2 gap-1 rounded-xl bg-surface-raised p-1">
            {(["majority", "unanimous"] as const).map((q) => (
              <button
                key={q}
                type="button"
                role="radio"
                aria-checked={quorum === q}
                onClick={() => setQuorum(q)}
                className={
                  quorum === q
                    ? "min-h-12 rounded-lg bg-brand px-2 text-sm font-bold text-brand-contrast"
                    : "min-h-12 rounded-lg px-2 text-sm font-bold text-text-secondary"
                }
              >
                {QUORUM_LABELS[q]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="h-6 w-6 accent-[var(--color-brand)]"
          />
          {t("decisions.composer.anonymousLabel")}
        </label>

        <p className="text-xs leading-5 text-text-muted">{t("decisions.composer.tieBreakNote")}</p>

        {errCode && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {COMPOSER_ERROR_LABELS[errCode] ?? t("decisions.errors.generic")}
          </p>
        )}

        <Button block onClick={publish} loading={saving}>
          {t("decisions.composer.publish")}
        </Button>
      </div>
    </BottomSheet>
  );
}

const QUORUM_LABELS: Record<"majority" | "unanimous", string> = {
  majority: t("decisions.quorum.majority"),
  unanimous: t("decisions.quorum.unanimous"),
};

const COMPOSER_ERROR_LABELS: Record<string, string> = {
  "decisions.composer.errQuestion": t("decisions.composer.errQuestion"),
  "decisions.composer.errOptions": t("decisions.composer.errOptions"),
  "decisions.composer.errDeadline": t("decisions.composer.errDeadline"),
  "decisions.errors.forbidden": t("decisions.errors.forbidden"),
  "decisions.errors.generic": t("decisions.errors.generic"),
};

function ConvertSheet({
  poll,
  options,
  dayPlans,
  onClose,
  onConverted,
}: {
  poll: PollRow;
  options: PollOptionRow[];
  dayPlans: DayPlanRow[];
  onClose: () => void;
  onConverted: () => void;
}) {
  const decided = options.find((o) => o.id === poll.decided_option_id) ?? null;
  const [day, setDay] = useState<number>(dayPlans[0]?.day_number ?? 1);
  const [time, setTime] = useState("19:30");
  const [category, setCategory] = useState<(typeof CONVERT_CATEGORIES)[number]>("food");
  const [status, setStatus] = useState<"confirmed" | "planned">("planned");
  const [saving, setSaving] = useState(false);
  const [errCode, setErrCode] = useState<string | null>(null);

  function convert(): void {
    const input: ConvertDecisionInput = { pollId: poll.id, dayNumber: day, timeHHmm: time, category, status };
    setSaving(true);
    void convertDecisionAction(input)
      .then((result) => {
        setSaving(false);
        if (!result.ok) {
          setErrCode(result.error === "decisions.errors.forbidden" ? "decisions.errors.forbidden" : "decisions.errors.generic");
          return;
        }
        pushToast({
          message: result.existing ? t("decisions.log.convertedExistingToast") : t("decisions.log.convertedToast"),
          type: "success",
        });
        onConverted();
        onClose();
      })
      .catch(() => {
        setSaving(false);
        setErrCode("decisions.errors.generic");
      });
  }

  return (
    <BottomSheet open onClose={onClose} title={t("decisions.log.convertTitle")}>
      <div className="flex flex-col gap-4 pb-4">
        <p className="rounded-lg bg-surface px-3 py-2 text-sm text-text-primary">
          <span className="font-bold">{decided?.label ?? t("decisions.log.noWinner")}</span>
          {poll.decision_note && <span className="block text-xs text-text-muted">{poll.decision_note}</span>}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text-muted">{t("decisions.log.convertDay")}</span>
            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className="min-h-12 rounded-xl border border-border bg-surface px-4 text-text-primary outline-none focus:border-brand"
            >
              {dayPlans.map((d) => (
                <option key={d.id} value={d.day_number}>
                  {t("money.dayGroup", { day: d.day_number })}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text-muted">{t("decisions.log.convertTime")}</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="min-h-12 rounded-xl border border-border bg-surface px-4 text-text-primary outline-none focus:border-brand"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text-muted">{t("decisions.log.convertCategory")}</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CONVERT_CATEGORIES)[number])}
              className="min-h-12 rounded-xl border border-border bg-surface px-4 text-text-primary outline-none focus:border-brand"
            >
              {CONVERT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CONVERT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="mb-1 text-xs font-semibold text-text-muted">{t("decisions.log.convertStatus")}</p>
            <div role="radiogroup" aria-label={t("decisions.log.convertStatus")} className="grid grid-cols-2 gap-1 rounded-xl bg-surface-raised p-1">
              {(["confirmed", "planned"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={status === s}
                  onClick={() => setStatus(s)}
                  className={
                    status === s
                      ? "min-h-12 rounded-lg bg-brand px-1 text-xs font-bold text-brand-contrast"
                      : "min-h-12 rounded-lg px-1 text-xs font-bold text-text-secondary"
                  }
                >
                  {s === "confirmed" ? t("decisions.log.statusConfirmed") : t("decisions.log.statusPlanned")}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-xs text-text-muted">{t("decisions.log.tzChip")}</p>

        {errCode && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {t("decisions.errors.generic")}
          </p>
        )}

        <Button block onClick={convert} loading={saving}>
          {t("decisions.log.convertConfirm")}
        </Button>
      </div>
    </BottomSheet>
  );
}
