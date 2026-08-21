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
  // UI redesign (phan hoi Codex 2026-08-19, muc P1 "loading state ro rang tren button") - optional,
  // KHONG doi hanh vi cac noi goi cu chua truyen prop nay. Khi true: hien spinner nho canh label (giu
  // nguyen text, tranh nhay chu) + tu dong disable, khong can noi goi tu lam ca 2 viec.
  loading?: boolean;
}

export function Btn({ children, variant = "primary", size = "md", className = "", disabled, loading, ...rest }: BtnProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`focus-ring inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && (
        <svg className="h-3.5 w-3.5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
