"use client";

import clsx from "clsx";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { t } from "@/lib/i18n";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Destructive sheets require an explicit button press — no swipe-down dismiss. */
  destructive?: boolean;
  className?: string;
}

const DISMISS_THRESHOLD_PX = 96;

/**
 * BottomSheet — slides up, 16px top radius, drag handle, max-height 85dvh,
 * backdrop 40% black (doc 05 §7). Focus trap + Escape close + swipe-down
 * dismiss (disabled for destructive sheets). Used for confirms, filters,
 * estimate details.
 */
export function BottomSheet({ open, onClose, title, children, destructive = false, className }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Focus trap, escape close, body scroll lock.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.documentElement.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    (focusables()[0] ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.documentElement.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (destructive) return;
      dragStartY.current = event.clientY;
      setDragging(true);
    },
    [destructive],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragStartY.current === null) return;
      const delta = event.clientY - dragStartY.current;
      setDragY(Math.max(0, delta));
    },
    [],
  );

  const onPointerUp = useCallback(() => {
    if (dragStartY.current === null) return;
    dragStartY.current = null;
    setDragging(false);
    if (dragY > DISMISS_THRESHOLD_PX) {
      setDragY(0);
      onClose();
    } else {
      setDragY(0);
    }
  }, [dragY, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div className="anim-fade-in absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          "absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-surface-raised pb-safe outline-none",
          !dragging && "anim-sheet-in",
          className,
        )}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        {/* Drag handle */}
        <div
          className={clsx("flex cursor-grab touch-none flex-col items-center pt-2", destructive && "pointer-events-none")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-4 pb-2 pt-1">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("a11y.closeSheet")}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-text-muted transition-opacity active:opacity-80"
          >
            <span aria-hidden className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}
