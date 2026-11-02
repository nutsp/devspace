import type { SVGProps } from "react";
import { cn } from "./utils";

/** Shared product identity; workspace avatars remain independently configured. */
export function DevspaceMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 72 72" fill="none" role="img" aria-label="Devspace" {...props}>
      <rect width="72" height="72" rx="18" fill="#096A9D" />
      <path
        d="M22 22h14a14 14 0 0 1 0 28H22z"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DevspaceLogo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Devspace"
      className={cn("inline-flex items-center gap-2 font-semibold text-primary", className)}
    >
      <DevspaceMark className="size-7 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">Devspace</span>
    </span>
  );
}
