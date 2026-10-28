"use client";
import Link from "next/link";
import { ArrowRight, CarFront } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { useUiStore } from "@/lib/store/ui";
import { activeVehicles, inventoryCounts, monthlySeries, outstandingBalances, periodSummary, vehicleView } from "@/lib/calculations/selectors";
import { describeRange, inRange } from "@/lib/utils/dates";
import { formatINR, formatINRCompact, sumPaise } from "@/lib/utils/money";
import { vehicleTitle } from "@/lib/utils/labels";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ChartCard } from "@/components/shared/chart-card";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { VehicleStatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { GLOSSARY } from "@/components/shared/info-tip";
import { SalesPerformanceChart } from "./charts";
import { NeedsAttention } from "./needs-attention";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * The home screen answers three questions only: how are we doing, what needs doing, what just arrived.
 * Deeper breakdowns (expenses, stock mix, activity) live on their own pages.
 */
export function DashboardPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const range = useUiStore((s) => s.dashboardRange);
  const setRange = useUiStore((s) => s.setDashboardRange);

  const counts = inventoryCounts(ds, idx);
  const period = periodSummary(ds, idx, range);
  const outstanding = outstandingBalances(ds, idx);
  const series = monthlySeries(ds, idx, 6);
  const rangeLabel = describeRange(range).toLowerCase();
  const recent = activeVehicles(ds).slice(0, 5).map((v) => vehicleView(v, idx));
  const mySales = ds.sales.filter((s) => s.status === "completed" && s.soldBy === user.id && inRange(s.saleDate, range));
  const canProfit = can("finance.viewProfit");

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={`Here's how the showroom is doing ${rangeLabel}.`}
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="In stock"
          info={GLOSSARY.inStock}
          value={counts.inStock}
          hint={`${counts.available} available · ${counts.reserved} reserved`}
          href="/inventory"
        />
        <StatCard
          label="Sales"
          value={formatINRCompact(period.revenuePaise)}
          hint={`${period.soldCount} car${period.soldCount === 1 ? "" : "s"} sold`}
          href={can("sales.view") ? "/sales" : undefined}
        />
        {canProfit ? (
          <StatCard
            label="Profit"
            info={GLOSSARY.grossProfit}
            value={formatINRCompact(period.grossProfitPaise)}
            tone={period.grossProfitPaise < 0 ? "danger" : "neutral"}
            hint={`${formatINRCompact(period.netContributionPaise)} after running costs`}
            href="/reports"
          />
        ) : (
          <StatCard label="My sales" value={mySales.length} hint={formatINRCompact(sumPaise(mySales.map((s) => s.salePricePaise)))} href="/sales" />
        )}
        {can("sales.viewAll") ? (
          <StatCard
            label="To collect"
            info={GLOSSARY.outstanding}
            value={formatINRCompact(outstanding.totalPaise)}
            tone={outstanding.totalPaise > 0 ? "warning" : "neutral"}
            hint={outstanding.count ? `From ${outstanding.count} buyer${outstanding.count > 1 ? "s" : ""}` : "All paid"}
            href="/sales?payment=unsettled"
          />
        ) : (
          <StatCard label="Ready to sell" value={counts.available} hint="Available now" href="/inventory" />
        )}
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <ChartCard title="Sales by month" description="Last 6 months" className="lg:col-span-2">
          <SalesPerformanceChart data={series} showProfit={canProfit} />
        </ChartCard>
        <NeedsAttention />
      </div>

      <Card className="mt-3">
        <CardHeader>
          <CardTitle>Recently added</CardTitle>
          <Link href="/inventory" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            All cars <ArrowRight className="size-3" />
          </Link>
        </CardHeader>
        {recent.length === 0 ? (
          <EmptyState
            icon={CarFront}
            title="No vehicles yet"
            description="Record your first purchase to add a car to stock."
            action={can("purchases.manage") && <Button asChild size="sm"><Link href="/purchases/new">Add purchase</Link></Button>}
          />
        ) : (
          <ul className="divide-y border-t">
            {recent.map((v) => (
              <li key={v.vehicle.id}>
                <Link href={`/inventory/${v.vehicle.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 focus-visible:bg-muted outline-none">
                  <VehicleImage image={v.cover} alt={vehicleTitle(v.vehicle)} className="h-10 w-14 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {v.vehicle.year} {vehicleTitle(v.vehicle)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{v.vehicle.registrationNumber}</div>
                  </div>
                  <div className="hidden text-sm tabular sm:block">{formatINR(v.vehicle.askingPricePaise)}</div>
                  <VehicleStatusBadge status={v.vehicle.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
