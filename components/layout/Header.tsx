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
 * end edge. Sticky, blur-backed. Pages compose it; the shell does not.
 */
export function Header({ title, subtitle, action, className }: HeaderProps) {
  return (
    <header
      className={clsx(
        "sticky top-0 z-30 -mx-4 mb-4 flex min-h-14 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur",
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
