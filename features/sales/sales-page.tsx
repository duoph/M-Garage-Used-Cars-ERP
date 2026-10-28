"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Plus, Receipt, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { saleView, type SaleView } from "@/lib/calculations/selectors";
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
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PaymentStatusBadge, SaleStatusBadge } from "@/components/shared/status-badge";

export function SalesPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const router = useRouter();
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

  const columns = React.useMemo<ColumnDef<SaleView>[]>(
    () => [
      { id: "ref", header: "Sale ref.", accessorFn: (r) => r.sale.reference, cell: ({ row: { original: r } }) => <Link href={`/sales/${r.sale.id}`} className="font-medium hover:underline">{r.sale.reference}</Link> },
      {
        id: "vehicle",
        header: "Vehicle",
        accessorFn: (r) => (r.vehicle ? vehicleTitle(r.vehicle) : ""),
        cell: ({ row: { original: r } }) =>
          r.vehicle ? (
            <div>
              <div>{r.vehicle.year} {vehicleTitle(r.vehicle)}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{r.vehicle.registrationNumber}</div>
            </div>
          ) : "—",
      },
      { id: "buyer", header: "Buyer", accessorFn: (r) => r.customer?.name ?? "" },
      { id: "date", header: "Sale date", accessorFn: (r) => r.sale.saleDate, cell: ({ row: { original: r } }) => formatDate(r.sale.saleDate) },
      { id: "amount", header: "Sale amount", accessorFn: (r) => r.sale.salePricePaise, cell: ({ row: { original: r } }) => <span className="font-medium">{formatINR(r.sale.salePricePaise)}</span>, meta: { align: "right" } },
      { id: "received", header: "Received", accessorFn: (r) => r.totals.receivedPaise, cell: ({ row: { original: r } }) => formatINR(r.totals.receivedPaise), meta: { align: "right" } },
      {
        id: "balance",
        header: "Balance due",
        accessorFn: (r) => (r.sale.status === "completed" ? r.totals.balancePaise : 0),
        cell: ({ row: { original: r } }) =>
          r.sale.status === "completed" ? <span className={r.totals.balancePaise > 0 ? "font-medium text-warning" : "text-muted-foreground"}>{formatINR(r.totals.balancePaise)}</span> : "—",
        meta: { align: "right" },
      },
      { id: "payment", header: "Payment", accessorFn: (r) => r.totals.paymentStatus, cell: ({ row: { original: r } }) => (r.sale.status === "completed" ? <PaymentStatusBadge status={r.totals.paymentStatus} /> : null) },
      { id: "status", header: "Status", accessorFn: (r) => r.sale.status, cell: ({ row: { original: r } }) => <SaleStatusBadge status={r.sale.status} /> },
      { id: "actions", enableSorting: false, header: () => <span className="sr-only">Actions</span>, cell: ({ row: { original: r } }) => <Button variant="ghost" size="sm" asChild><Link href={`/sales/${r.sale.id}`}>View</Link></Button> },
    ],
    [],
  );

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
          <div key={k} className="rounded-xl border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="mt-0.5 text-lg font-semibold tabular">{v}</div>
          </div>
        ))}
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b p-3 sm:p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search ref, buyer, vehicle…" className="lg:w-80" />
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Select value={payment} onValueChange={(v) => setPayment(v as typeof payment)}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Payment status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="unsettled">Balance due</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partially paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="h-9 w-[140px]" aria-label="Sale status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="all">All sales</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
        {all.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No sales yet"
            description="Completed sales and their payments will be listed here."
            action={can("sales.create") && <Button asChild><Link href="/sales/new"><Plus /> Record sale</Link></Button>}
          />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(r) => r.sale.id}
            resetPageKey={`${search}|${payment}|${status}|${range.from}|${range.to}`}
            onRowClick={(r) => router.push(`/sales/${r.sale.id}`)}
            empty={<EmptyState icon={SearchX} title="No sales match" description="Adjust the search, dates or filters." />}
            renderMobileCard={(r) => (
              <Link href={`/sales/${r.sale.id}`} className="block px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.vehicle ? `${r.vehicle.year} ${vehicleTitle(r.vehicle)}` : r.sale.reference}</span>
                  <span className="text-sm font-semibold tabular">{formatINR(r.sale.salePricePaise)}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{r.sale.reference} · {r.customer?.name} · {formatDate(r.sale.saleDate)}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  {r.sale.status === "completed" ? <PaymentStatusBadge status={r.totals.paymentStatus} /> : <SaleStatusBadge status={r.sale.status} />}
                  {r.totals.balancePaise > 0 && r.sale.status === "completed" && <span className="text-xs text-warning">Due {formatINR(r.totals.balancePaise)}</span>}
                </div>
              </Link>
            )}
          />
        )}
      </Card>
    </>
  );
}
