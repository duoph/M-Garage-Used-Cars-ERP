import { can } from "@/lib/permissions";
import { todayISO } from "@/lib/utils/dates";
import type { Quote, User, Vehicle } from "@/types";

/** Open quotes past their validity date. Shown as "Expired" but still editable and sellable. */
export function isExpired(quote: Pick<Quote, "status" | "validUntil">, today = todayISO()): boolean {
  return quote.status === "open" && quote.validUntil < today;
}

export function canEditQuote(quote: Quote, user: User): boolean {
  return can(user.role, "sales.create") && quote.status !== "accepted" && (can(user.role, "sales.viewAll") || quote.createdBy === user.id);
}

/** A sale can start from an open quote while its car is still available. */
export function canSellFromQuote(quote: Quote, vehicle: Vehicle | undefined, user: User): boolean {
  return can(user.role, "sales.create") && quote.status === "open" && !!vehicle && vehicle.status === "available" && !vehicle.archivedAt;
}
