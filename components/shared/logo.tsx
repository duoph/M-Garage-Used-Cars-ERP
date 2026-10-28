import { cn } from "@/lib/utils/cn";

/** Follows the active colour theme; `inverted` draws it white-on-colour for dark backgrounds. */
export function LogoMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  const bg = inverted ? "#fff" : "var(--primary)";
  const fg = inverted ? "var(--primary)" : "#fff";
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" style={{ fill: bg }} />
      <path
        d="M7 19.5 9.2 14a3 3 0 0 1 2.8-1.9h8a3 3 0 0 1 2.8 1.9L25 19.5v3a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-11v1a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"
        style={{ fill: fg }}
      />
      <circle cx="11" cy="18.6" r="1.3" style={{ fill: bg }} />
      <circle cx="21" cy="18.6" r="1.3" style={{ fill: bg }} />
      <path d="M11 15.8h10" style={{ stroke: bg }} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, dark = false, tagline = false }: { className?: string; dark?: boolean; tagline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" inverted={dark} />
      <div className="leading-tight">
        <div className={cn("text-[15px] font-semibold tracking-tight", dark ? "text-white" : "text-foreground")}>DealerOS</div>
        {tagline && <div className={cn("text-[11px]", dark ? "text-sidebar-muted" : "text-muted-foreground")}>by Duoph Technologies</div>}
      </div>
    </div>
  );
}
