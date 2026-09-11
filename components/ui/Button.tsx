import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Leading icon (visual start side — right under RTL). */
  icon?: ReactNode;
  /** Shows a spinner, disables interaction. */
  loading?: boolean;
  /** Full-width button. */
  block?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-contrast active:opacity-80",
  secondary: "bg-brand-soft text-brand-strong active:opacity-80",
  danger: "bg-danger text-white active:opacity-80",
  ghost: "bg-transparent text-text-secondary active:bg-surface-raised",
};

/**
 * Button — min height 48px (touch target rule, doc 05 §8), rounded-xl (12px),
 * variants per §7. Never flips direction physically; layout uses logical gaps.
 */
export function Button({
  variant = "primary",
  icon,
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? loading}
      className={clsx(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold",
        "transition-[opacity,transform,background-color] duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-50",
        block && "w-full",
        variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden size={20} className="animate-spin" />
      ) : (
        icon && <span aria-hidden className="inline-flex shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
}
