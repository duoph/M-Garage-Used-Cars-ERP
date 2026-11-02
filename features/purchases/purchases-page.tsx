"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Plus, SearchX, ShoppingCart, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { purchaseBalance, purchasePaymentStatus } from "@/lib/calculations/finance";
import { inRange, resolvePreset, todayISO, formatDate, type DateRange } from "@/lib/utils/dates";
import { formatINR, formatINRCompact, sumPaise } from "@/lib/utils/money";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, VEHICLE_STATUS_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { csvRupees, downloadCsv } from "@/lib/utils/csv";
import type { PaymentStatus, Purchase, Vehicle, VehicleImage as VehicleImageRecord } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { FilterBar, ListRow, LoadMore, RowCell, StickyBar, usePagedRows } from "@/components/shared/list";
import { EmptyState } from "@/components/shared/empty-state";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { PaymentStatusBadge, PurchaseStatusBadge, VehicleStatusBadge } from "@/components/shared/status-badge";

interface PurchaseRow {
  purchase: Purchase;
  vehicle: Vehicle | undefined;
  cover: VehicleImageRecord | undefined;
  status: PaymentStatus;
}

export function PurchasesPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const [search, setSearch] = React.useState("");
  const [range, setRange] = React.useState<DateRange>(resolvePreset("all"));
  const params = useSearchParams();
  const [payment, setPayment] = React.useState<"all" | "unsettled" | PaymentStatus>(() =>
    params.get("payment") === "unsettled" ? "unsettled" : "all",
  );
  const [state, setState] = React.useState<"active" | "cancelled" | "all">("active");
  const canCost = can("finance.viewCost");

  const all = React.useMemo<PurchaseRow[]>(
    () =>
      ds.purchases.map((p) => {
        const vehicle = idx.vehicles.get(p.vehicleId);
        const imgs = idx.imagesByVehicle.get(p.vehicleId);
        return { purchase: p, vehicle, cover: imgs?.find((i) => i.id === vehicle?.coverImageId) ?? imgs?.[0], status: purchasePaymentStatus(p) };
      }),
    [ds.purchases, idx],
  );

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((r) => (state === "all" ? true : r.purchase.status === state))
      .filter((r) => inRange(r.purchase.purchaseDate, range))
      .filter((r) => payment === "all" || (payment === "unsettled" ? r.status !== "paid" : r.status === payment))
      .filter((r) => {
        if (!q) return true;
        const v = r.vehicle;
        return `${r.purchase.reference} ${r.purchase.sellerName} ${r.purchase.sellerContact} ${v?.make} ${v?.model} ${v?.registrationNumber} ${v?.registrationNumber.replace(/\s/g, "")}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.purchase.purchaseDate.localeCompare(a.purchase.purchaseDate) || b.purchase.createdAt.localeCompare(a.purchase.createdAt));
  }, [all, search, range, payment, state]);

  const totals = {
    count: rows.length,
    cost: sumPaise(rows.filter((r) => r.purchase.status === "active").map((r) => r.purchase.purchasePricePaise)),
    due: sumPaise(rows.filter((r) => r.purchase.status === "active").map((r) => purchaseBalance(r.purchase))),
  };

  const paged = usePagedRows(rows, `${search}|${payment}|${state}|${range.from}|${range.to}`);

  function exportCsv() {
    downloadCsv(`purchases-${todayISO()}.csv`, rows, [
      { header: "Reference", value: (r) => r.purchase.reference },
      { header: "Purchase Date", value: (r) => r.purchase.purchaseDate },
      { header: "Vehicle", value: (r) => (r.vehicle ? `${r.vehicle.year} ${vehicleTitle(r.vehicle)} ${r.vehicle.variant}` : "") },
      { header: "Registration", value: (r) => r.vehicle?.registrationNumber },
      { header: "Seller", value: (r) => r.purchase.sellerName },
      { header: "Seller Contact", value: (r) => r.purchase.sellerContact },
      { header: "Purchase Price (INR)", value: (r) => csvRupees(r.purchase.purchasePricePaise) },
      { header: "Amount Paid (INR)", value: (r) => csvRupees(r.purchase.amountPaidPaise) },
      { header: "Balance (INR)", value: (r) => csvRupees(purchaseBalance(r.purchase)) },
      { header: "Payment Status", value: (r) => PAYMENT_STATUS_LABELS[r.status] },
      { header: "Payment Method", value: (r) => PAYMENT_METHOD_LABELS[r.purchase.paymentMethod] },
      { header: "Inventory Status", value: (r) => (r.purchase.status === "cancelled" ? "Cancelled" : r.vehicle ? VEHICLE_STATUS_LABELS[r.vehicle.status] : "") },
    ]);
    toast.success(`Exported ${rows.length} purchases`);
  }

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Vehicles acquired by the showroom and what was paid for them."
        actions={
          <>
            <Button variant="outline" asChild><Link href="/purchases/returns"><Undo2 /> Returns</Link></Button>
            {can("data.export") && canCost && (
              <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
                <Download /> Export
              </Button>
            )}
            {can("purchases.manage") && (
              <Button asChild>
                <Link href="/purchases/new"><Plus /> New purchase</Link>
              </Button>
            )}
          </>
        }
      />
      {canCost && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            ["Purchases", String(totals.count)],
            ["Acquisition cost", formatINRCompact(totals.cost)],
            ["Owed to sellers", formatINRCompact(totals.due)],
          ].map(([k, val]) => (
            <div key={k} className="rounded-xl border bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="mt-0.5 text-lg font-semibold tabular">{val}</div>
            </div>
          ))}
        </div>
      )}
      <Card>
        <StickyBar>
          <FilterBar
            search={<SearchInput value={search} onChange={setSearch} placeholder="Search reference, seller, vehicle…" className="sm:w-full" size="sm" />}
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
            <Select value={state} onValueChange={(v) => setState(v as typeof state)}>
              <SelectTrigger className="h-8 w-[140px]" aria-label="Record status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="all">All records</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>
        </StickyBar>
        {ds.purchases.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="No purchases yet"
            description="Record a purchase to add a vehicle to stock."
            action={can("purchases.manage") && <Button asChild><Link href="/purchases/new"><Plus /> New purchase</Link></Button>}
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title="No purchases match" description="Adjust the search, dates or filters." />
        ) : (
          <>
            <ul className="divide-y">
              {paged.visible.map((r) => {
                const due = purchaseBalance(r.purchase);
                return (
                  <ListRow
                    key={r.purchase.id}
                    href={`/purchases/${r.purchase.id}`}
                    leading={<VehicleImage image={r.cover} alt="" className="h-12 w-[72px] shrink-0 rounded-md" />}
                    title={r.vehicle ? `${r.vehicle.year} ${vehicleTitle(r.vehicle)}` : r.purchase.reference}
                    subtitle={
                      <>
                        {r.vehicle && <span className="font-mono text-foreground/80">{r.vehicle.registrationNumber} · </span>}
                        {r.purchase.sellerName} · {formatDate(r.purchase.purchaseDate)} · {r.purchase.reference}
                      </>
                    }
                    mobile={
                      <>
                        {canCost && <span className="text-sm font-semibold tabular">{formatINR(r.purchase.purchasePricePaise)}</span>}
                        <PaymentStatusBadge status={r.status} />
                      </>
                    }
                    aside={
                      <>
                        {canCost && (
                          <RowCell className="w-28 text-right">
                            <div className="text-sm font-semibold tabular">{formatINR(r.purchase.purchasePricePaise)}</div>
                            {r.purchase.status === "active" && due > 0 && <div className="text-[11px] text-warning tabular">Due {formatINR(due)}</div>}
                          </RowCell>
                        )}
                        <RowCell className="w-28 text-right"><PaymentStatusBadge status={r.status} /></RowCell>
                        <RowCell from="md" className="w-24 text-right">
                          {r.purchase.status === "cancelled" ? <PurchaseStatusBadge status="cancelled" /> : r.vehicle ? <VehicleStatusBadge status={r.vehicle.status} /> : null}
                        </RowCell>
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
