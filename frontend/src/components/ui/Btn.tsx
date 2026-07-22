import type { ButtonHTMLAttributes, ReactNode } from "react";

export type BtnVariant = "primary" | "ghost" | "subtle" | "danger" | "success";
export type BtnSize = "sm" | "md";

const SIZES: Record<BtnSize, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

const VARIANTS: Record<BtnVariant, string> = {
  primary: "bg-[var(--ocean-500)] text-white hover:bg-[var(--ocean-600)] shadow-sm",
  ghost: "bg-white text-[var(--ink-600)] border border-[var(--line)] hover:bg-slate-50",
  subtle: "bg-[var(--ocean-100)] text-[var(--ocean-700)] hover:bg-[var(--ocean-100)]/70",
  danger: "bg-white text-[var(--coral-500)] border border-[var(--coral-100)] hover:bg-[var(--coral-100)]",
  success: "bg-[var(--teal-500)] text-white hover:opacity-90",
};

interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  children: ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
}

export function Btn({ children, variant = "primary", size = "md", className = "", disabled, ...rest }: BtnProps) {
  return (
    <button
      disabled={disabled}
      className={`focus-ring rounded-lg font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
