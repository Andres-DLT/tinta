import Link from "next/link";
import type { ComponentProps } from "react";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const buttonStyles = {
  base: "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50",
  primary: "bg-brand px-4 py-2 text-brand-fg hover:opacity-90",
  secondary: "border border-line bg-surface px-4 py-2 text-fg hover:bg-surface-2",
  ghost: "px-3 py-2 text-muted hover:bg-surface-2 hover:text-fg",
  danger: "px-3 py-2 text-danger hover:bg-danger/10",
};

type Variant = Exclude<keyof typeof buttonStyles, "base">;

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cn(buttonStyles.base, buttonStyles[variant], className)} {...props} />;
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight text-fg">
      <span className="grid size-8 place-items-center rounded-lg bg-brand text-brand-fg">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M12 3c3 4 6 7.2 6 10.5A6 6 0 0 1 6 13.5C6 10.2 9 7 12 3Z" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-lg">Tinta</span>
    </Link>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({
  name,
  color,
  size = "md",
  className,
  title,
}: {
  name: string;
  color: string;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? name}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-surface select-none",
        size === "sm" ? "size-7 text-[0.65rem]" : "size-9 text-xs",
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </span>
  );
}
