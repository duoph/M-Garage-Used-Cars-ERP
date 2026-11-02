"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, FileText, HandCoins, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { reportError } from "@/hooks/use-commands";
import { dealerService } from "@/lib/services/dealer-service";
import { refundState } from "@/lib/calculations/returns";
import { describeRange, formatDate, inRange, resolvePreset, type DateRange } from "@/lib/utils/dates";
import { formatINR, sumPaise } from "@/lib/utils/money";
import { PAYMENT_METHOD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { paiseToWords } from "@/lib/utils/words";
import type { PurchaseReturn, ReturnRefund, SalesReturn, Vehicle } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { FilterBar, ListRow, LoadMore, RowCell, StickyBar, usePagedRows } from "@/components/shared/list";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { VehicleStatusBadge } from "@/components/shared/status-badge";
import { AmountRows, DocumentNotFound, Letterhead, PrintPage, Signature, usePrintGate } from "@/features/documents/print-layout";
import { accountLabel } from "@/features/accounts/shared";
import { RefundBadge } from "./shared";
import { RefundDialog } from "./refund-dialog";

type Kind = "sales" | "purchase";

const carText = (v: Vehicle | undefined) => (v ? `${v.year} ${vehicleTitle(v)} · ${v.registrationNumber}` : "—");

/** The return records of one kind, with the names a list needs. */
function useReturnRows(kind: Kind) {
  const { ds, idx } = useData();
  return React.useMemo(() => {
    const list: (SalesReturn | PurchaseReturn)[] = kind === "sales" ? ds.salesReturns : ds.purchaseReturns;
    return list
      .map((r) => {
        const sale = "saleId" in r ? idx.sales.get(r.saleId) : undefined;
        const purchase = "purchaseId" in r ? idx.purchases.get(r.purchaseId) : undefined;
        return {
          ret: r,
          original: sale?.reference ?? purchase?.reference ?? "—",
          party: "customerId" in r ? idx.customers.get(r.customerId)?.name ?? "—" : (r as PurchaseReturn).sellerName,
          vehicle: idx.vehicles.get(r.vehicleId),
          refund: refundState(r, idx.refundsByReturn),
        };
      })
      .sort((a, b) => b.ret.date.localeCompare(a.ret.date) || b.ret.number.localeCompare(a.ret.number));
  }, [kind, ds, idx]);
}

export function ReturnsListPage({ kind }: { kind: Kind }) {
  const all = useReturnRows(kind);
  const [range, setRange] = React.useState<DateRange>(resolvePreset("this_fy"));
  const [search, setSearch] = React.useState("");
  const sales = kind === "sales";
  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((r) => inRange(r.ret.date, range))
      .filter((r) => !q || `${r.ret.number} ${r.original} ${r.party} ${r.vehicle?.registrationNumber ?? ""} ${r.vehicle?.make ?? ""} ${r.vehicle?.model ?? ""}`.toLowerCase().includes(q));
  }, [all, range, search]);
  const paged = usePagedRows(rows, `${search}|${range.from}|${range.to}`);
  const total = sumPaise(rows.map((r) => r.ret.returnAmountPaise));
  const pending = sumPaise(rows.map((r) => r.refund.pendingPaise));
  const base = sales ? "/sales/returns" : "/purchases/returns";

  return (
    <>
      <PageHeader
        title={sales ? "Sales returns" : "Purchase returns"}
        description={sales ? "Cars and amounts handed back by buyers, with credit notes and refunds." : "Cars sent back to their sellers, with debit notes and refunds received."}
        breadcrumbs={[{ label: sales ? "Sales" : "Purchases", href: sales ? "/sales" : "/purchases" }, { label: "Returns" }]}
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:gap-4">
        <StatCard label="Returns" value={String(rows.length)} icon={Undo2} hint={describeRange(range)} />
        <StatCard label="Return amount" value={formatINR(total)} icon={Undo2} tone="brand" />
        <StatCard label={sales ? "Refund still to pay" : "Refund still to receive"} value={formatINR(pending)} icon={HandCoins} tone={pending ? "danger" : "neutral"} />
      </div>
      <Card className="mt-4">
        <StickyBar>
          <FilterBar search={<SearchInput value={search} onChange={setSearch} placeholder="Search return, invoice, party, car…" className="sm:w-full" size="sm" />} />
        </StickyBar>
        {rows.length === 0 ? (
          <EmptyState
            icon={Undo2}
            title={all.length === 0 ? "No returns yet" : "No returns in this view"}
            description={sales ? "Open a completed sale and choose Sales return." : "Open a purchase and choose Purchase return."}
          />
        ) : (
          <>
            <ul className="divide-y">
              {paged.visible.map((r) => (
                <ListRow
                  key={r.ret.id}
                  href={`${base}/${r.ret.id}`}
                  title={<>{r.ret.number} <span className="font-normal text-muted-foreground">· {r.party}</span></>}
                  subtitle={<>{formatDate(r.ret.date)} · {r.original} · {carText(r.vehicle)}</>}
                  mobile={<span className="text-sm font-semibold tabular">{formatINR(r.ret.returnAmountPaise)}</span>}
                  aside={
                    <>
                      <RowCell from="md" className="w-44 text-right"><RefundBadge pendingPaise={r.refund.pendingPaise} duePaise={r.refund.duePaise} format={formatINR} /></RowCell>
                      <RowCell className="w-28 text-right text-sm font-semibold tabular">{formatINR(r.ret.returnAmountPaise)}</RowCell>
                    </>
                  }
                />
              ))}
            </ul>
            <LoadMore shown={paged.visible.length} total={paged.total} hasMore={paged.hasMore} onLoadMore={paged.loadMore} />
          </>
        )}
      </Card>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children || "—"}</dd>
    </div>
  );
}

function RefundTable({ refunds, kind }: { refunds: ReturnRefund[]; kind: Kind }) {
  const { ds, idx } = useData();
  if (refunds.length === 0) return <p className="px-4 pb-5 text-[13px] text-muted-foreground">No refund {kind === "sales" ? "paid" : "received"} yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Number</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead>{kind === "sales" ? "Paid from" : "Received into"}</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {refunds.map((f) => {
          const a = idx.accounts.get(f.accountId);
          return (
            <TableRow key={f.id}>
              <TableCell className="font-medium">{f.number}</TableCell>
              <TableCell>{formatDate(f.date)}</TableCell>
              <TableCell>{PAYMENT_METHOD_LABELS[f.method]}</TableCell>
              <TableCell className="text-muted-foreground">{a ? accountLabel(a, ds.branches) : "—"}</TableCell>
              <TableCell className="text-muted-foreground">{f.reference || "—"}</TableCell>
              <TableCell className="text-right font-medium tabular">{formatINR(f.amountPaise)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function ReturnDetailPage({ kind }: { kind: Kind }) {
  const { id } = useParams<{ id: string }>();
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const [refunding, setRefunding] = React.useState(false);
  const sales = kind === "sales";
  const ret = sales ? ds.salesReturns.find((r) => r.id === id) : ds.purchaseReturns.find((r) => r.id === id);
  if (!ret)
    return <EmptyState icon={Undo2} title="Return not found" action={<Button asChild variant="outline"><Link href={sales ? "/sales/returns" : "/purchases/returns"}>Back to returns</Link></Button>} className="py-24" />;

  const sale = "saleId" in ret ? idx.sales.get(ret.saleId) : undefined;
  const purchase = "purchaseId" in ret ? idx.purchases.get(ret.purchaseId) : undefined;
  const sr = sales ? (ret as SalesReturn) : undefined;
  const vehicle = idx.vehicles.get(ret.vehicleId);
  const party = sr ? idx.customers.get(sr.customerId)?.name : (ret as PurchaseReturn).sellerName;
  const refunds = idx.refundsByReturn.get(ret.id) ?? [];
  const state = refundState(ret, idx.refundsByReturn);
  const canRefund = state.pendingPaise > 0 && can(sales ? "payments.record" : "purchases.manage");
  const loan = sr?.financePaymentId ? ds.payments.find((p) => p.id === sr.financePaymentId) : undefined;

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2.5">{ret.number} <RefundBadge pendingPaise={state.pendingPaise} duePaise={state.duePaise} format={formatINR} /></span>}
        description={`${sales ? "Sales return" : "Purchase return"} on ${formatDate(ret.date)} · ${party ?? ""}`}
        breadcrumbs={[{ label: sales ? "Sales returns" : "Purchase returns", href: sales ? "/sales/returns" : "/purchases/returns" }, { label: ret.number }]}
        actions={
          <>
            {vehicle?.status === "returned_inspection" && can("inventory.edit") && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await dealerService.backToStock(user, vehicle.id);
                    toast.success("Car is back in available stock");
                  } catch (e) {
                    reportError(e);
                  }
                }}
              >
                <CheckCircle2 /> Inspected — back to stock
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/${sales ? "credit-note" : "debit-note"}/${ret.id}`} target="_blank"><FileText /> {sales ? "Credit note" : "Debit note"}</Link>
            </Button>
            {canRefund && <Button onClick={() => setRefunding(true)}><HandCoins /> {sales ? "Pay refund" : "Refund received"}</Button>}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-1"><CardTitle>Return</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <dl className="divide-y">
                <Row label="Return amount">{formatINR(ret.returnAmountPaise)}</Row>
                <Row label="Deduction">{formatINR(ret.deductionPaise)}</Row>
                {sr && sr.financeAdjustmentPaise > 0 && <Row label={`Loan cancelled with ${loan?.lenderName ?? "lender"}`}>{formatINR(sr.financeAdjustmentPaise)}</Row>}
                <Row label={sales ? "Refund due to buyer" : "Refund due from seller"}>{formatINR(state.duePaise)}</Row>
                <Row label={sales ? "Refund paid" : "Refund received"}>{formatINR(state.paidPaise)}</Row>
                <Row label="Refund pending"><span className={state.pendingPaise ? "text-warning" : ""}>{formatINR(state.pendingPaise)}</span></Row>
              </dl>
              <dl className="divide-y">
                <Row label={sales ? "Original sale" : "Original purchase"}>
                  {sale ? <Link href={`/sales/${sale.id}`} className="text-primary hover:underline">{sale.reference}</Link> : purchase ? <Link href={`/purchases/${purchase.id}`} className="text-primary hover:underline">{purchase.reference}</Link> : "—"}
                </Row>
                <Row label={sales ? "Customer" : "Seller"}>{party}</Row>
                <Row label="Vehicle">{carText(vehicle)}</Row>
                <Row label="Stock status">{vehicle ? <VehicleStatusBadge status={vehicle.status} /> : "—"}</Row>
                {sr && <Row label="Car returned">{sr.vehicleReturned ? "Yes" : "No — price adjustment"}</Row>}
                <Row label="Entered by">{idx.users.get(ret.createdBy)?.name}</Row>
              </dl>
            </div>
            <p className="mt-3 rounded-lg bg-muted/60 p-3 text-[13px]"><span className="text-muted-foreground">Reason: </span>{ret.reason}{ret.notes && <><br /><span className="text-muted-foreground">Notes: </span>{ret.notes}</>}</p>
          </CardContent>
          <div className="border-t">
            <h3 className="px-4 py-3 text-sm font-semibold">{sales ? "Refunds paid" : "Refunds received"}</h3>
            <RefundTable refunds={refunds} kind={kind} />
          </div>
        </Card>
      </div>
      {canRefund && (
        <RefundDialog
          returnType={kind}
          returnId={ret.id}
          number={ret.number}
          minDate={ret.date}
          branchId={ret.branchId}
          pendingPaise={state.pendingPaise}
          open={refunding}
          onOpenChange={setRefunding}
        />
      )}
    </>
  );
}

/** Printable credit note (sales return) or debit note (purchase return). */
export function ReturnNotePage({ kind }: { kind: Kind }) {
  const { id } = useParams<{ id: string }>();
  const { ds, idx } = useData();
  const gate = usePrintGate(kind === "sales" ? "receipts.print" : "purchases.view");
  if (gate) return gate;
  const sales = kind === "sales";
  const ret = sales ? ds.salesReturns.find((r) => r.id === id) : ds.purchaseReturns.find((r) => r.id === id);
  if (!ret) return <DocumentNotFound icon={FileText} title="Return not found" href={sales ? "/sales/returns" : "/purchases/returns"} label="Back to returns" />;

  const sr = sales ? (ret as SalesReturn) : undefined;
  const sale = sr ? idx.sales.get(sr.saleId) : undefined;
  const purchase = !sales ? idx.purchases.get((ret as PurchaseReturn).purchaseId) : undefined;
  const customer = sr ? idx.customers.get(sr.customerId) : undefined;
  const vehicle = idx.vehicles.get(ret.vehicleId);
  const refunds = idx.refundsByReturn.get(ret.id) ?? [];
  const state = refundState(ret, idx.refundsByReturn);
  const net = ret.returnAmountPaise - ret.deductionPaise;

  return (
    <PrintPage back={{ href: `${sales ? "/sales/returns" : "/purchases/returns"}/${ret.id}`, label: "Back to return" }}>
      <Letterhead title={sales ? "Credit Note" : "Debit Note"}>
        {ret.number}
        <br />
        {formatDate(ret.date, "dd-MM-yyyy")}
        <br />
        Against {sale?.reference ?? purchase?.reference}
      </Letterhead>
      <p className="mt-10">
        {sales ? (
          <>Credited to <strong className="font-semibold">{customer?.name}</strong>{customer?.phone && ` (${customer.phone})`} for the return of </>
        ) : (
          <>Debited to <strong className="font-semibold">{(ret as PurchaseReturn).sellerName}</strong>{purchase?.sellerContact && ` (${purchase.sellerContact})`} for the return of </>
        )}
        <strong className="font-semibold">{carText(vehicle)}</strong>
        {vehicle?.chassisNumber && <>, chassis {vehicle.chassisNumber}</>}. Reason: {ret.reason}.
      </p>
      <div className="mt-8">
        <AmountRows
          rows={[
            { label: "Return amount", value: formatINR(ret.returnAmountPaise) },
            { label: "Less: deduction / charges", value: `− ${formatINR(ret.deductionPaise)}` },
            { label: "Net credit", value: formatINR(net), strong: true, note: paiseToWords(net) },
            ...(sr && sr.financeAdjustmentPaise > 0 ? [{ label: "Adjusted against loan with the lender", value: formatINR(sr.financeAdjustmentPaise) }] : []),
            { label: sales ? "Refund due to buyer" : "Refund due from seller", value: formatINR(state.duePaise), gap: true },
            ...refunds.map((f) => ({
              label: `${sales ? "Refunded" : "Received"} ${formatDate(f.date, "dd-MM-yyyy")} · ${PAYMENT_METHOD_LABELS[f.method]}${f.reference ? `, ${f.reference}` : ""}`,
              value: formatINR(f.amountPaise),
            })),
            { label: "Balance refund pending", value: formatINR(state.pendingPaise), strong: true },
          ]}
        />
      </div>
      {ret.notes && <p className="mt-6 text-[13px]"><span className="text-[#6b7280]">Notes: </span>{ret.notes}</p>}
      <div className="mt-6 text-xs text-[#6b7280]">
        {state.pendingPaise > 0 && <Badge tone="warning">Refund pending</Badge>} {ds.settings.showroomName} · {sales ? "Sales return" : "Purchase return"}
      </div>
      <Signature />
    </PrintPage>
  );
}
