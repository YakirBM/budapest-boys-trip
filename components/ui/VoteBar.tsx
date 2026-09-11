import clsx from "clsx";
import { Check } from "lucide-react";
import { t } from "@/lib/i18n";

export interface VoteOption {
  id: string;
  label: string;
  votes: number;
}

export interface VoteBarProps {
  options: VoteOption[];
  /** Total eligible voters, for "N הצביעו" display. */
  totalVoters?: number;
  anonymousUntilClose?: boolean;
  closesAt?: string;
  state?: "open" | "closed";
  className?: string;
}

/** Distinct fills cycled per option, from semantic tokens. */
const segmentColors = [
  "var(--color-brand)",
  "var(--color-cat-food)",
  "var(--color-cat-attraction)",
  "var(--color-cat-transit)",
  "var(--color-cat-nightlife)",
  "var(--color-cat-rest)",
];

/**
 * VoteBar — stacked horizontal bar with per-option legend (doc 05 §7).
 * While `anonymousUntilClose` and open: counts hidden, only "N הצביעו".
 * Closed: winner highlighted with success + check.
 */
export function VoteBar({
  options,
  totalVoters,
  anonymousUntilClose = false,
  closesAt,
  state = "open",
  className,
}: VoteBarProps) {
  const totalVotes = options.reduce((sum, option) => sum + option.votes, 0);
  const winnerVotes = state === "closed" ? Math.max(...options.map((o) => o.votes), 0) : -1;
  const hideCounts = state === "open" && anonymousUntilClose;

  return (
    <div className={clsx("flex flex-col gap-3", className)}>
      <div
        role="img"
        aria-label={hideCounts ? t("decisions.votes", { count: totalVotes }) : undefined}
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface-raised"
      >
        {totalVotes > 0 &&
          options.map((option, index) => (
            <span
              key={option.id}
              className="h-full"
              style={{
                width: `${(option.votes / totalVotes) * 100}%`,
                backgroundColor: segmentColors[index % segmentColors.length],
              }}
            />
          ))}
      </div>

      <ul className="flex flex-col gap-2">
        {options.map((option, index) => {
          const isWinner = state === "closed" && option.votes === winnerVotes && winnerVotes > 0;
          return (
            <li
              key={option.id}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                isWinner && "bg-success/12 font-semibold",
              )}
            >
              <span
                aria-hidden
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: segmentColors[index % segmentColors.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-text-primary">{option.label}</span>
              {isWinner && <Check aria-hidden size={16} className="shrink-0 text-success" />}
              <span dir="ltr" className="ltr-iso tnum shrink-0 text-text-muted">
                {hideCounts ? "•" : option.votes}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>
          {hideCounts
            ? t("decisions.votes", { count: totalVoters ?? totalVotes })
            : t("decisions.votes", { count: totalVotes })}
        </span>
        {state === "open" && anonymousUntilClose && <span>{t("decisions.anonymousHint")}</span>}
        {state === "closed" && closesAt && (
          <span dir="ltr" className="ltr-iso tnum">
            {closesAt}
          </span>
        )}
      </div>
    </div>
  );
}
