import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ui/card";
import { InfoTip } from "./info-tip";

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  info,
}: {
  label: string;
  value: React.ReactNode;
  /** Kept for call-site compatibility; stat cards are text-only for a calmer layout. */
  icon?: LucideIcon;
  hint?: React.ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger";
  href?: string;
  /** Plain-language explanation shown in an ⓘ tooltip. */
  info?: string;
}) {
  // Colour only the number, and only when it signals something (good or needs action).
  const valueClass = {
    neutral: "",
    brand: "",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];
  // The whole card is clickable via a stretched link, while the ⓘ tip stays a separate control.
  return (
    <Card className={cn("relative h-full p-4 transition-colors duration-150", href && "hover:border-foreground/15 focus-within:ring-2 focus-within:ring-ring/30")}>
      <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
        {href ? (
          <Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']">
            {label}
          </Link>
        ) : (
          label
        )}
        {info && <InfoTip text={info} label={`About ${label}`} className="relative z-10" />}
      </p>
      <div className={cn("mt-1.5 text-2xl leading-none font-semibold tracking-tight tabular", valueClass)}>{value}</div>
      {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
