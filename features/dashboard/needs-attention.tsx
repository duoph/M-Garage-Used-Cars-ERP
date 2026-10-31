"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, FileWarning, HandCoins, ImageOff, Hourglass, Landmark, type LucideIcon } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { activeVehicles, saleView, vehicleView } from "@/lib/calculations/selectors";
import { purchaseBalance } from "@/lib/calculations/finance";
import { paperAlerts } from "@/lib/calculations/papers";
import { daysSince } from "@/lib/utils/dates";
import { formatINR, formatINRCompact, sumPaise } from "@/lib/utils/money";
import { vehicleTitle } from "@/lib/utils/labels";
import { cn } from "@/lib/utils/cn";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const AGING_DAYS = 60;
const STALE_RESERVATION_DAYS = 7;

interface Task {
  id: string;
  icon: LucideIcon;
  tone: "warning" | "danger" | "info";
  title: string;
  detail: string;
  href: string;
}

/**
 * A short, role-aware to-do list built from live data: the things a showroom team should act on today.
 */
export function useAttentionTasks(): Task[] {
  const { ds, idx } = useData();
  const { can, user } = useAuth();
  const tasks: Task[] = [];
  const stock = activeVehicles(ds).filter((v) => v.status !== "sold").map((v) => vehicleView(v, idx));

  const aging = stock.filter((v) => v.stockAgeDays > AGING_DAYS).sort((a, b) => b.stockAgeDays - a.stockAgeDays);
  if (aging.length)
    tasks.push({
      id: "aging",
      icon: Hourglass,
      tone: "warning",
      title: `${aging.length} car${aging.length > 1 ? "s" : ""} in stock over ${AGING_DAYS} days`,
      detail: `Oldest: ${vehicleTitle(aging[0].vehicle)} · ${aging[0].stockAgeDays} days. Consider a price review.`,
      href: "/inventory?status=in_stock&sort=oldest",
    });

  const stale = ds.reservations
    .filter((r) => r.status === "active" && daysSince(r.reservationDate) > STALE_RESERVATION_DAYS)
    .sort((a, b) => a.reservationDate.localeCompare(b.reservationDate));
  for (const r of stale.slice(0, 2)) {
    const v = idx.vehicles.get(r.vehicleId);
    const c = idx.customers.get(r.customerId);
    if (!v) continue;
    tasks.push({
      id: `res-${r.id}`,
      icon: Clock,
      tone: "warning",
      title: `Reservation waiting ${daysSince(r.reservationDate)} days`,
      detail: `${vehicleTitle(v)} for ${c?.name ?? "buyer"} — complete the sale or release it.`,
      href: `/inventory/${v.id}`,
    });
  }

  if (can("sales.view")) {
    const due = ds.sales
      .filter((s) => s.status === "completed" && (can("sales.viewAll") || s.soldBy === user?.id))
      .map((s) => saleView(s, idx))
      .filter((s) => s.totals.balancePaise > 0)
      .sort((a, b) => b.totals.balancePaise - a.totals.balancePaise);
    if (due.length === 1)
      tasks.push({
        id: `due-${due[0].sale.id}`,
        icon: HandCoins,
        tone: "danger",
        title: `${formatINR(due[0].totals.balancePaise)} due from ${due[0].customer?.name ?? "buyer"}`,
        detail: `${due[0].sale.reference} · ${due[0].vehicle ? vehicleTitle(due[0].vehicle) : ""}`,
        href: `/sales/${due[0].sale.id}`,
      });
    else if (due.length > 1)
      tasks.push({
        id: "due",
        icon: HandCoins,
        tone: "danger",
        title: `${formatINRCompact(sumPaise(due.map((d) => d.totals.balancePaise)))} still to collect from ${due.length} buyers`,
        detail: `Largest: ${formatINR(due[0].totals.balancePaise)} from ${due[0].customer?.name ?? "buyer"} (${due[0].sale.reference}).`,
        href: "/sales?payment=unsettled",
      });
  }

  if (can("finance.viewCost")) {
    const owed = ds.purchases.filter((p) => p.status === "active" && purchaseBalance(p) > 0);
    if (owed.length)
      tasks.push({
        id: "owed",
        icon: Landmark,
        tone: "info",
        title: `${formatINRCompact(sumPaise(owed.map(purchaseBalance)))} owed to ${owed.length} seller${owed.length > 1 ? "s" : ""}`,
        detail: `Balance on purchases not yet fully paid.`,
        href: "/purchases?payment=unsettled",
      });
  }

  // Insurance / PUC / RC running out on cars in stock, and hypothecated cars still waiting for the bank NOC.
  const papers = stock.map((v) => ({ v, alerts: paperAlerts(v.vehicle) })).filter((x) => x.alerts.length);
  if (papers.length) {
    const expired = papers.filter((x) => x.alerts.some((a) => a.status === "expired")).length;
    const first = papers[0];
    tasks.push({
      id: "papers",
      icon: FileWarning,
      tone: expired ? "danger" : "warning",
      title: `${papers.length} car${papers.length > 1 ? "s" : ""} with papers to renew`,
      detail: `${vehicleTitle(first.v.vehicle)} (${first.v.vehicle.registrationNumber}): ${first.alerts
        .map((a) => (a.key === "noc" ? `${a.label} pending` : `${a.label} ${a.status === "expired" ? "expired" : `expires in ${a.days} days`}`))
        .join(", ")}.`,
      href: papers.length === 1 ? `/inventory/${first.v.vehicle.id}` : "/inventory?papers=attention",
    });
  }

  if (can("inventory.photos")) {
    const noPhotos = stock.filter((v) => v.images.length === 0);
    if (noPhotos.length)
      tasks.push({
        id: "photos",
        icon: ImageOff,
        tone: "info",
        title: `${noPhotos.length} car${noPhotos.length > 1 ? "s" : ""} without photos`,
        detail: `${vehicleTitle(noPhotos[0].vehicle)} (${noPhotos[0].vehicle.registrationNumber}) needs photos for sales staff.`,
        href: `/inventory/${noPhotos[0].vehicle.id}`,
      });
  }
  return tasks;
}

const TONE: Record<Task["tone"], string> = {
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-muted-foreground/50",
};

export function NeedsAttention({ className }: { className?: string }) {
  const tasks = useAttentionTasks();
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <div>
          <CardTitle>To do</CardTitle>
          <CardDescription className="mt-0.5">Things to follow up on</CardDescription>
        </div>
      </CardHeader>
      {tasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 text-center">
          <CheckCircle2 className="mb-2 size-6 text-success" />
          <p className="text-sm font-medium">All caught up</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Nothing needs follow-up right now.</p>
        </div>
      ) : (
        <ul className="divide-y border-t">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link href={t.href} title={t.detail} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted outline-none">
                <span className={cn("size-2 shrink-0 rounded-full", TONE[t.tone])} aria-hidden />
                <div className="min-w-0 flex-1 text-sm leading-snug">{t.title}</div>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
