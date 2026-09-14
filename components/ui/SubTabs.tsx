"use client";

import clsx from "clsx";
import Link from "next/link";

export interface SubTab {
  id: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
}

export interface SubTabsProps {
  tabs: SubTab[];
  activeId: string;
  ariaLabel: string;
  className?: string;
  /** Optional client-side selection for panes that already have their data. */
  onSelect?: (id: string) => void;
}

/**
 * SubTabs — sticky secondary navigation bar (Tab 1 schedule/discover/map,
 * media views, lists groups). Equal tabs, 48px targets, brand underline for
 * the active tab. Links (not buttons) so every view is deep-linkable.
 */
export function SubTabs({ tabs, activeId, ariaLabel, className, onSelect }: SubTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={clsx(
        "sticky top-[calc(env(safe-area-inset-top,0px)+8rem)] z-20 -mx-4 mb-3 flex border-b border-border bg-background/95 px-4 backdrop-blur",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            role="tab"
            aria-selected={active}
            onClick={(event) => {
              if (!onSelect || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onSelect(tab.id);
            }}
            className={clsx(
              "relative flex min-h-12 flex-1 items-center justify-center gap-1.5 px-2 text-sm",
              "transition-colors",
              active ? "font-bold text-brand" : "font-medium text-text-muted active:text-text-secondary",
            )}
          >
            {tab.icon}
            <span className="truncate">{tab.label}</span>
            {active && (
              <span aria-hidden className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-brand" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
