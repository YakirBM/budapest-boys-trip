import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

export interface HeaderAction {
  icon: LucideIcon;
  /** Hebrew aria-label (a11y.*) — the action is icon-only. */
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface HeaderProps {
  title: string;
  subtitle?: string;
  /** One context action at the end edge, 48px target (doc 05 §6). */
  action?: HeaderAction;
  className?: string;
}

/**
 * Header — page title (h1, text-start) + optional single context action at the
 * end edge. The global shell owns stickiness; page titles scroll naturally so
 * they never cover the live console or secondary tabs.
 */
export function Header({ title, subtitle, action, className }: HeaderProps) {
  return (
    <header
      className={clsx(
        "-mx-4 mb-4 flex min-h-16 items-center gap-2 border-b border-border bg-surface/55 px-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1 py-2">
        <h1 className="truncate text-2xl font-extrabold tracking-tight text-text-primary">
          {title}
        </h1>
        {subtitle && <p className="truncate text-sm text-text-muted">{subtitle}</p>}
      </div>
      {action &&
        (action.href ? (
          <a
            href={action.href}
            aria-label={action.label}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-text-secondary transition-opacity active:opacity-80"
          >
            <action.icon aria-hidden size={22} />
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            aria-label={action.label}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-text-secondary transition-opacity active:opacity-80"
          >
            <action.icon aria-hidden size={22} />
          </button>
        ))}
    </header>
  );
}
