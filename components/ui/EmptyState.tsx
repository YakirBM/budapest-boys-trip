import clsx from "clsx";
import type { ReactNode } from "react";

export type EmptyIllustration =
  | "compass"
  | "box"
  | "list"
  | "map"
  | "money"
  | "media"
  | "calendar"
  | "poll";

export interface EmptyStateProps {
  illustration?: EmptyIllustration | ReactNode;
  title: string;
  hint?: string;
  ctaLabel?: string;
  onCta?: () => void;
  ctaHref?: string;
  className?: string;
}

/** Minimal line-art illustrations, 120px, stroke = currentColor (doc 05 §7). */
function Illustration({ kind }: { kind: EmptyIllustration }) {
  const common = {
    width: 120,
    height: 120,
    viewBox: "0 0 120 120",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (kind) {
    case "compass":
      return (
        <svg {...common}>
          <circle cx="60" cy="60" r="40" />
          <path d="M75 45 65 65 45 75l10-20z" />
          <circle cx="60" cy="60" r="3" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <path d="M25 45 60 30l35 15v35L60 95 25 80z" />
          <path d="M25 45l35 15 35-15M60 60v35" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <rect x="30" y="25" width="60" height="75" rx="8" />
          <path d="M45 45h30M45 60h30M45 75h18" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path d="M25 35l23-8 24 8 23-8v58l-23 8-24-8-23 8z" />
          <path d="M48 27v58M72 35v58" />
        </svg>
      );
    case "money":
      return (
        <svg {...common}>
          <circle cx="60" cy="60" r="35" />
          <circle cx="60" cy="60" r="22" />
          <path d="M60 48v24M53 54c0-3 3-6 7-6s7 3 7 6-3 5-7 6-7 3-7 6 3 6 7 6 7-3 7-6" />
        </svg>
      );
    case "media":
      return (
        <svg {...common}>
          <rect x="25" y="30" width="70" height="55" rx="8" />
          <path d="M52 47l18 10-18 10z" />
          <path d="M35 100h50" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="25" y="30" width="70" height="65" rx="8" />
          <path d="M25 50h70M40 22v16M80 22v16" />
          <path d="M45 65h10M55 75h10M65 65h10" />
        </svg>
      );
    case "poll":
      return (
        <svg {...common}>
          <path d="M30 90V50M60 90V30M90 90V65" />
          <path d="M20 98h80" />
        </svg>
      );
  }
}

/**
 * EmptyState — centered line illustration + title + hint + brand CTA.
 * Every list screen must define one (doc 05 §7, §11).
 */
export function EmptyState({
  illustration = "compass",
  title,
  hint,
  ctaLabel,
  onCta,
  ctaHref,
  className,
}: EmptyStateProps) {
  return (
    <div className={clsx("flex flex-col items-center gap-3 py-12 text-center", className)}>
      <div className="text-text-muted" aria-hidden>
        {typeof illustration === "string" ? (
          <Illustration kind={illustration as EmptyIllustration} />
        ) : (
          illustration
        )}
      </div>
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      {hint && <p className="max-w-xs text-sm leading-6 text-text-muted">{hint}</p>}
      {ctaLabel &&
        (ctaHref ? (
          <a
            href={ctaHref}
            className="mt-2 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-contrast transition-opacity active:opacity-80"
          >
            {ctaLabel}
          </a>
        ) : (
          onCta && (
            <button
              type="button"
              onClick={onCta}
              className="mt-2 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-contrast transition-opacity active:opacity-80"
            >
              {ctaLabel}
            </button>
          )
        ))}
    </div>
  );
}
