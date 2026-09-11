import clsx from "clsx";
import type { HTMLAttributes } from "react";

/**
 * Card — 12px radius surface container (doc 05 §6). Hero/sheet containers use
 * rounded-2xl via className when needed.
 */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("rounded-xl border border-border bg-surface p-4", className)}
      {...rest}
    />
  );
}
