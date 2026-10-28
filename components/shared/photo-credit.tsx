import { cn } from "@/lib/utils/cn";
import type { PhotoAttribution } from "@/types";

/** Licence credit for third-party photos (required by Creative Commons attribution terms). */
export function PhotoCredit({ attribution: a, className, dark = false }: { attribution: PhotoAttribution; className?: string; dark?: boolean }) {
  const link = cn("underline-offset-2 hover:underline", dark ? "text-white/80" : "text-foreground/70");
  return (
    <p className={cn("truncate text-[11px]", dark ? "text-white/60" : "text-muted-foreground", className)}>
      Photo: {a.author} ·{" "}
      <a href={a.licenseUrl} target="_blank" rel="noopener noreferrer" className={link}>
        {a.license}
      </a>{" "}
      ·{" "}
      <a href={a.source} target="_blank" rel="noopener noreferrer" className={link}>
        Wikimedia Commons
      </a>{" "}
      · Demo photo, not the actual vehicle
    </p>
  );
}
