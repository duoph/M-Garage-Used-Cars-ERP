import { cn } from "@/lib/utils/cn";

/** Follows the active colour theme; `inverted` draws it colour-on-white for dark backgrounds. */
export function LogoMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  const bg = inverted ? "#fff" : "var(--primary)";
  const fg = inverted ? "var(--primary)" : "#fff";
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" style={{ fill: bg }} />
      <path
        d="M7.2 24.4V8.4h3.2l5.6 8.15L21.6 8.4h3.2v16h-2.9V13.85l-4.5 6.55h-2.8l-4.5-6.55v10.55z"
        style={{ fill: fg }}
      />
    </svg>
  );
}

export function Logo({ className, dark = false, tagline = false }: { className?: string; dark?: boolean; tagline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-8 shrink-0" inverted={dark} />
      <div className="leading-none">
        <div className={cn("text-[15px] font-semibold tracking-tight", dark ? "text-white" : "text-foreground")}>M Garage</div>
        {tagline && (
          <div className={cn("mt-1 text-[10px] font-medium tracking-[0.16em] uppercase", dark ? "text-sidebar-muted" : "text-muted-foreground")}>
            Used Car Dealer
          </div>
        )}
      </div>
    </div>
  );
}
