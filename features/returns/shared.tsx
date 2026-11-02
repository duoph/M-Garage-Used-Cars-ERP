"use client";
import { Badge } from "@/components/ui/badge";
import type { ReturnStatus } from "@/types";

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  none: "Not returned",
  partial: "Partially Returned",
  returned: "Returned",
};

/** Nothing is shown for records with no return. */
export function ReturnStatusBadge({ status }: { status: ReturnStatus | undefined }) {
  if (!status || status === "none") return null;
  return <Badge tone={status === "returned" ? "danger" : "warning"}>{RETURN_STATUS_LABELS[status]}</Badge>;
}

/** "Refund pending ₹40,000" / "Refund settled". */
export function RefundBadge({ pendingPaise, duePaise, format }: { pendingPaise: number; duePaise: number; format: (p: number) => string }) {
  if (duePaise <= 0) return <Badge tone="neutral">No refund</Badge>;
  if (pendingPaise <= 0) return <Badge tone="success">Refund settled</Badge>;
  return <Badge tone="warning">Refund pending {format(pendingPaise)}</Badge>;
}
