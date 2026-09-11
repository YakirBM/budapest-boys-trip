"use client";

import clsx from "clsx";

export type ScopeValue = "group" | "personal";

export interface GroupPersonalToggleProps {
  value: ScopeValue;
  onChange: (next: ScopeValue) => void;
  groupLabel: string;
  personalLabel: string;
  ariaLabel: string;
  className?: string;
}

/**
 * GroupPersonalToggle — segmented group/personal switch shared by the schedule
 * pane and the lists sub-filter. Two 48px segments, radiogroup semantics.
 */
export function GroupPersonalToggle({
  value,
  onChange,
  groupLabel,
  personalLabel,
  ariaLabel,
  className,
}: GroupPersonalToggleProps) {
  const options: { id: ScopeValue; label: string }[] = [
    { id: "group", label: groupLabel },
    { id: "personal", label: personalLabel },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx("grid grid-cols-2 gap-1 rounded-xl bg-surface-raised p-1", className)}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={clsx(
              "inline-flex min-h-12 items-center justify-center rounded-lg px-3 text-sm transition-colors",
              active ? "bg-surface font-bold text-brand shadow-sm" : "font-medium text-text-muted",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
