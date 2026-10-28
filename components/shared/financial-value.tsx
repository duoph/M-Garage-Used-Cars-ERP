"use client";
import { cn } from "@/lib/utils/cn";
import { formatINR, formatINRCompact } from "@/lib/utils/money";
import { useAuth } from "@/hooks/use-auth";
import type { Permission } from "@/lib/permissions";

/**
 * Renders a rupee amount. When `permission` is given and the current role lacks it,
 * nothing is rendered (not even a masked value), so restricted figures never reach the DOM.
 */
export function FinancialValue({
  paise,
  permission,
  compact = false,
  signed = false,
  className,
}: {
  paise: number | null | undefined;
  permission?: Permission;
  compact?: boolean;
  signed?: boolean;
  className?: string;
}) {
  const { can } = useAuth();
  if (permission && !can(permission)) return null;
  if (paise === null || paise === undefined) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const text = compact ? formatINRCompact(paise) : formatINR(paise);
  return (
    <span
      className={cn(
        "tabular",
        signed && paise > 0 && "text-success",
        signed && paise < 0 && "text-destructive",
        className,
      )}
    >
      {signed && paise > 0 ? "+" : ""}
      {text}
    </span>
  );
}
