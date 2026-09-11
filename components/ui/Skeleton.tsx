import clsx from "clsx";

/**
 * Skeleton — shimmer block matching the final layout shape (doc 05 §7, §11).
 * Composition happens via className (e.g. h-4 w-24, rounded-full).
 * Shimmer is disabled (static gray) under prefers-reduced-motion via globals.css.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("skeleton-shimmer rounded-lg", className)} />;
}
