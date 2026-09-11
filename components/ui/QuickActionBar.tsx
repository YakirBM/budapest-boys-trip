"use client";

import clsx from "clsx";
import { Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export type QuickActionState = "default" | "loading" | "sent";

export interface QuickAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  state?: QuickActionState;
  disabled?: boolean;
}

export interface QuickActionBarProps {
  itemId: string;
  actions: QuickAction[];
  className?: string;
}

/**
 * QuickActionBar — horizontal 48px action row on itinerary detail
 * (נווט / כרטיס / יצאנו / מאחר ב-X — doc 05 §7). Per-button loading spinner
 * and success ("sent") flash.
 */
export function QuickActionBar({ itemId, actions, className }: QuickActionBarProps) {
  return (
    <div role="toolbar" aria-label={itemId} className={clsx("flex gap-2 overflow-x-auto", className)}>
      {actions.map((action) => {
        const state = action.state ?? "default";
        return (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled || state === "loading"}
            className={clsx(
              "inline-flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold",
              "transition-[background-color,opacity,color] duration-150 ease-out active:opacity-80",
              "disabled:cursor-not-allowed disabled:opacity-60",
              state === "sent"
                ? "border-transparent bg-success/12 text-success"
                : "border-border bg-surface text-text-secondary",
            )}
          >
            {state === "loading" ? (
              <Loader2 aria-hidden size={16} className="animate-spin" />
            ) : state === "sent" ? (
              <Check aria-hidden size={16} />
            ) : (
              action.icon && <span aria-hidden className="inline-flex">{action.icon}</span>
            )}
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
