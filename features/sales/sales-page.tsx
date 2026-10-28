"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Plus, Receipt, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { saleView } from "@/lib/calculations/selectors";
import { formatDate, inRange, resolvePreset, todayISO, type DateRange } from "@/lib/utils/dates";
import { formatINR, formatINRCompact, sumPaise } from "@/lib/utils/money";
import { PAYMENT_STATUS_LABELS, SALE_STATUS_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { csvRupees, downloadCsv } from "@/lib/utils/csv";
import type { PaymentStatus, SaleStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { FilterBar, ListRow, LoadMore, RowCell, StickyBar, usePagedRows } from "@/components/shared/list";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { EmptyState } from "@/components/shared/empty-state";
import { PaymentStatusBadge, SaleStatusBadge } from "@/components/shared/status-badge";

export function SalesPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const [search, setSearch] = React.useState("");
  const [range, setRange] = React.useState<DateRange>(resolvePreset("all"));
  const params = useSearchParams();
  const [payment, setPayment] = React.useState<"all" | "unsettled" | PaymentStatus>(() =>
    params.get("payment") === "unsettled" ? "unsettled" : "all",
  );
  const [status, setStatus] = React.useState<"all" | SaleStatus>("completed");
  const viewAll = can("sales.viewAll");

  const all = React.useMemo(
    () => ds.sales.filter((s) => viewAll || s.soldBy === user.id).map((s) => saleView(s, idx)),
    [ds.sales, idx, viewAll, user.id],
  );

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((r) => status === "all" || r.sale.status === status)
      .filter((r) => payment === "all" || (r.sale.status === "completed" && (payment === "unsettled" ? r.totals.paymentStatus !== "paid" : r.totals.paymentStatus === payment)))
      .filter((r) => inRange(r.sale.saleDate, range))
      .filter((r) => {
        if (!q) return true;
        return `${r.sale.reference} ${r.customer?.name} ${r.customer?.phone} ${r.vehicle?.make} ${r.vehicle?.model} ${r.vehicle?.registrationNumber} ${r.vehicle?.registrationNumber.replace(/\s/g, "")}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.sale.saleDate.localeCompare(a.sale.saleDate) || b.sale.createdAt.localeCompare(a.sale.createdAt));
  }, [all, search, range, payment, status]);

  const completed = rows.filter((r) => r.sale.status === "completed");
  const summary = {
    revenue: sumPaise(completed.map((r) => r.sale.salePricePaise)),
    received: sumPaise(completed.map((r) => r.totals.receivedPaise)),
    due: sumPaise(completed.map((r) => r.totals.balancePaise)),
  };

  const paged = usePagedRows(rows, `${search}|${payment}|${status}|${range.from}|${range.to}`);
  const coverOf = (vehicleId: string) => {
    const imgs = idx.imagesByVehicle.get(vehicleId);
    return imgs?.find((i) => i.id === idx.vehicles.get(vehicleId)?.coverImageId) ?? imgs?.[0];
  };

  function exportCsv() {
    downloadCsv(`sales-${todayISO()}.csv`, rows, [
      { header: "Sale Ref", value: (r) => r.sale.reference },
      { header: "Sale Date", value: (r) => r.sale.saleDate },
      { header: "Vehicle", value: (r) => (r.vehicle ? `${r.vehicle.year} ${vehicleTitle(r.vehicle)} ${r.vehicle.variant}` : "") },
      { header: "Registration", value: (r) => r.vehicle?.registrationNumber },
      { header: "Buyer", value: (r) => r.customer?.name },
      { header: "Buyer Phone", value: (r) => r.customer?.phone },
      { header: "Sale Price (INR)", value: (r) => csvRupees(r.sale.salePricePaise) },
      { header: "Received (INR)", value: (r) => csvRupees(r.totals.receivedPaise) },
      { header: "Balance (INR)", value: (r) => csvRupees(r.sale.status === "completed" ? r.totals.balancePaise : 0) },
      { header: "Payment Status", value: (r) => PAYMENT_STATUS_LABELS[r.totals.paymentStatus] },
      { header: "Sale Status", value: (r) => SALE_STATUS_LABELS[r.sale.status] },
      { header: "Sold By", value: (r) => r.soldBy?.name },
    ]);
    toast.success(`Exported ${rows.length} sales`);
  }

  return (
    <>
      <PageHeader
        title="Sales"
        description={viewAll ? "All vehicle sales, payments and balances." : "Sales you have recorded."}
        actions={
          <>
            {can("data.export") && (
              <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}><Download /> Export</Button>
            )}
            {can("sales.create") && (
              <Button asChild><Link href="/sales/new"><Plus /> Record sale</Link></Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Cars sold", String(completed.length)],
          ["Revenue", formatINRCompact(summary.revenue)],
          ["Amount received", formatINRCompact(summary.received)],
          ["Outstanding", formatINRCompact(summary.due)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="mt-0.5 text-lg font-semibold tabular">{v}</div>
          </div>
        ))}
      </div>
      <Card>
        <StickyBar>
          <FilterBar
            search={<SearchInput value={search} onChange={setSearch} placeholder="Search ref, buyer, vehicle…" className="sm:w-full" size="sm" />}
            end={<DateRangePicker value={range} onChange={setRange} size="sm" />}
          >
            <Select value={payment} onValueChange={(v) => setPayment(v as typeof payment)}>
              <SelectTrigger className="h-8 w-[150px]" aria-label="Payment status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="unsettled">Balance due</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partially paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="h-8 w-[140px]" aria-label="Sale status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="all">All sales</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>
        </StickyBar>
        {all.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No sales yet"
            description="Completed sales and their payments will be listed here."
            action={can("sales.create") && <Button asChild><Link href="/sales/new"><Plus /> Record sale</Link></Button>}
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title="No sales match" description="Adjust the search, dates or filters." />
        ) : (
          <>
            <ul className="divide-y">
              {paged.visible.map((r) => {
                const done = r.sale.status === "completed";
                const due = done ? r.totals.balancePaise : 0;
                const badge = done ? <PaymentStatusBadge status={r.totals.paymentStatus} /> : <SaleStatusBadge status={r.sale.status} />;
                return (
                  <ListRow
                    key={r.sale.id}
                    href={`/sales/${r.sale.id}`}
                    leading={<VehicleImage image={coverOf(r.sale.vehicleId)} alt="" className="h-12 w-[72px] shrink-0 rounded-md" />}
                    title={r.vehicle ? `${r.vehicle.year} ${vehicleTitle(r.vehicle)}` : r.sale.reference}
                    subtitle={
                      <>
                        {r.customer?.name ?? "Buyer"} · {formatDate(r.sale.saleDate)} · {r.sale.reference}
                        {viewAll && r.soldBy && <> · by {r.soldBy.name}</>}
                      </>
                    }
                    mobile={
                      <>
                        <span className="text-sm font-semibold tabular">{formatINR(r.sale.salePricePaise)}</span>
                        {badge}
                      </>
                    }
                    aside={
                      <>
                        <RowCell className="w-28 text-right">
                          <div className="text-sm font-semibold tabular">{formatINR(r.sale.salePricePaise)}</div>
                          {due > 0 ? (
                            <div className="text-[11px] text-warning tabular">Due {formatINR(due)}</div>
                          ) : done ? (
                            <div className="text-[11px] text-muted-foreground">Fully paid</div>
                          ) : null}
                        </RowCell>
                        <RowCell className="w-28 text-right">{badge}</RowCell>
                      </>
                    }
                  />
                );
              })}
            </ul>
            <LoadMore shown={paged.visible.length} total={paged.total} hasMore={paged.hasMore} onLoadMore={paged.loadMore} />
          </>
        )}
      </Card>
    </>
  );
}
