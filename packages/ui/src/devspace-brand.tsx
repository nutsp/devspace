import type { SVGProps } from "react";
import { DEVSPACE_MARK } from "./devspace-mark-data";
import { cn } from "./utils";

/** Shared product identity; workspace avatars remain independently configured. */
export function DevspaceMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 72 72" fill="none" role="img" aria-label="DevSpace" {...props}>
      <image href={DEVSPACE_MARK} width="72" height="72" />
    </svg>
  );
}

export function DevspaceLogo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="DevSpace"
      className={cn("inline-flex items-center gap-2 font-semibold text-primary", className)}
    >
      <DevspaceMark className="size-8 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">DevSpace</span>
    </span>
  );
}
