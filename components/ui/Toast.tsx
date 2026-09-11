"use client";

import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";

export type ToastType = "success" | "info" | "danger";

export interface ToastInput {
  message: string;
  type?: ToastType;
  /** Undo/action slot (e.g. "בטל" after a destructive op). */
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastInput {
  id: number;
}

const AUTO_DISMISS_MS = 3000;

const typeIcons: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  info: Info,
  danger: AlertTriangle,
};

const typeColors: Record<ToastType, string> = {
  success: "text-success",
  info: "text-info",
  danger: "text-danger",
};

/* ---------------------------------------------------------------- *
 * Module-scoped emitter: `useToast()` works from any client component
 * without context plumbing; ToastProvider subscribes and renders the
 * single visible toast + queue.
 * ---------------------------------------------------------------- */
type Listener = (input: ToastInput) => void;
const listeners = new Set<Listener>();
let nextId = 0;

/** Push a toast from anywhere (client). Stable identity — safe in deps. */
export function pushToast(input: ToastInput): void {
  listeners.forEach((listener) => listener(input));
}

export function useToast(): { push: (input: ToastInput) => void } {
  return { push: pushToast };
}

/**
 * ToastProvider — bottom-anchored above the bottom nav, auto-dismiss 3s,
 * max 1 visible with a queue, role="status" (doc 05 §7, §10). Undo slot for
 * destructive ops.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener: Listener = (input) => {
      nextId += 1;
      setQueue((prev) => [...prev, { ...input, id: nextId }]);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const current = queue[0];

  useEffect(() => {
    if (queue.length === 0) return;
    const id = window.setTimeout(() => {
      setQueue((prev) => prev.slice(1));
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [queue]);

  return (
    <>
      {children}
      {current && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto flex w-full max-w-md justify-center px-4">
          <div
            role="status"
            className="anim-fade-in pointer-events-auto flex w-full items-center gap-2 rounded-xl border border-border bg-surface-raised p-2 shadow-lg"
          >
            {(() => {
              const type: ToastType = current.type ?? "info";
              const Icon = typeIcons[type];
              return <Icon aria-hidden size={20} className={clsx("shrink-0", typeColors[type])} />;
            })()}
            <p className="min-w-0 flex-1 text-sm font-medium text-text-primary">{current.message}</p>
            {current.action && (
              <button
                type="button"
                onClick={() => {
                  current.action?.onClick();
                  setQueue((prev) => prev.slice(1));
                }}
                className="inline-flex min-h-12 items-center rounded-lg px-2 text-sm font-bold text-brand transition-opacity active:opacity-80"
              >
                {current.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
