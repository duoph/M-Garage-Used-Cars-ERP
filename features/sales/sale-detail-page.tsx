"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ban, CheckCircle2, FileSignature, FileText, Plus, Printer, Receipt, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { saleView, vehicleView } from "@/lib/calculations/selectors";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { PAYMENT_METHOD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { RoleGuard } from "@/components/shared/role-guard";
import { FinancialValue } from "@/components/shared/financial-value";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { PaymentStatusBadge, SaleStatusBadge } from "@/components/shared/status-badge";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { PaymentDialog } from "./payment-dialog";
import { FinanceSettleDialog } from "./finance-dialog";
import { SalesReturnDialog } from "@/features/returns/sales-return-dialog";
import { ReturnStatusBadge } from "@/features/returns/shared";
import { accountLabel } from "@/features/accounts/shared";
import { canReturnSale } from "@/lib/calculations/state";
import { financePending } from "@/lib/calculations/finance";
import { Badge } from "@/components/ui/badge";
import type { SalePayment } from "@/types";
import { DocumentsCard } from "@/features/documents/documents-card";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children || "—"}</dd>
    </div>
  );
}

export function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const [paying, setPaying] = React.useState(false);
  const [returning, setReturning] = React.useState(false);
  const [settling, setSettling] = React.useState<SalePayment | null>(null);
  const [cancelling, setCancelling] = React.useState(false);
  const sale = idx.sales.get(id);

  if (!sale || (!can("sales.viewAll") && sale.soldBy !== user.id))
    return (
      <EmptyState
        icon={Receipt}
        title="Sale not found"
        description="It may not exist, or it isn't visible to your role."
        action={<Button asChild variant="outline"><Link href="/sales">Back to sales</Link></Button>}
        className="py-24"
      />
    );

  const sv = saleView(sale, idx);
  const vv = sv.vehicle ? vehicleView(sv.vehicle, idx) : undefined;
  const { totals } = sv;
  const completed = sale.status === "completed";
  const credited = totals.netPricePaise - totals.balancePaise + totals.refundDuePaise;
  const pct = totals.netPricePaise > 0 ? Math.min(100, Math.round((credited / totals.netPricePaise) * 100)) : 100;
  const latest = sv.payments[sv.payments.length - 1];
  const returns = idx.salesReturnsBySale.get(sale.id) ?? [];
  const canReturn = can("sales.cancel") && canReturnSale(sale).ok;
  const accountName = (accountId: string | null | undefined) => {
    const a = accountId ? idx.accounts.get(accountId) : undefined;
    return a ? accountLabel(a, ds.branches) : "—";
  };

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2.5">{sale.reference} <SaleStatusBadge status={sale.status} /><ReturnStatusBadge status={sale.returnStatus} /></span>}
        description={`Sold on ${formatDate(sale.saleDate)} to ${sv.customer?.name ?? "buyer"}`}
        breadcrumbs={[{ label: "Sales", href: "/sales" }, { label: sale.reference }]}
        actions={
          <>
            {can("sales.cancel") && completed && returns.length === 0 && (
              <Button variant="outline" onClick={() => setCancelling(true)}><Ban /> Cancel sale</Button>
            )}
            {canReturn && (
              <Button variant="outline" onClick={() => setReturning(true)}><Undo2 /> Sales return</Button>
            )}
            {can("receipts.print") && (
              <Button variant="outline" asChild>
                <Link href={`/invoice/${sale.id}`} target="_blank"><FileText /> Invoice</Link>
              </Button>
            )}
            {can("receipts.print") && (
              <Button variant="outline" asChild>
                <Link href={`/sale-letter/${sale.id}`} target="_blank"><FileSignature /> Sale letter</Link>
              </Button>
            )}
            {can("receipts.print") && latest && (
              <Button variant="outline" asChild>
                <Link href={`/receipt/${latest.id}`} target="_blank"><Printer /> Print receipt</Link>
              </Button>
            )}
            {can("payments.record") && completed && totals.balancePaise > 0 && (
              <Button onClick={() => setPaying(true)}><Plus /> Receive payment</Button>
            )}
          </>
        }
      />
      {!completed && (
        <p className="mb-4 rounded-lg border border-[#f6d2cf] bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
          Cancelled on {formatDateTime(sale.cancelledAt)} — {sale.cancelReason}. Payment history is preserved below; record any refund as a payment voucher (Refund to buyer).
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle>Payment summary</CardTitle><PaymentStatusBadge status={totals.paymentStatus} /></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">{totals.netPricePaise !== sale.salePricePaise ? "Sale price after returns" : "Sale price"}</div>
                <div className="text-lg font-semibold tabular">{formatINR(totals.netPricePaise)}</div>
                {totals.netPricePaise !== sale.salePricePaise && <div className="text-[11px] text-muted-foreground tabular">Originally {formatINR(sale.salePricePaise)}</div>}
              </div>
              <div><div className="text-xs text-muted-foreground">Received</div><div className="text-lg font-semibold text-success tabular">{formatINR(totals.receivedPaise)}</div></div>
              <div><div className="text-xs text-muted-foreground">Balance due</div><div className={`text-lg font-semibold tabular ${totals.balancePaise > 0 ? "text-warning" : ""}`}>{formatINR(totals.balancePaise)}</div></div>
            </div>
            {(totals.financePendingPaise > 0 || totals.refundDuePaise > 0) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {totals.financePendingPaise > 0 && <Badge tone="info">Loan pending from lender: {formatINR(totals.financePendingPaise)}</Badge>}
                {totals.refundDuePaise > 0 && <Badge tone="danger">Refund due to buyer: {formatINR(totals.refundDuePaise)}</Badge>}
              </div>
            )}
            <Progress value={pct} className="mt-4 h-2" indicatorClassName={pct >= 100 ? "bg-success" : "bg-primary"} aria-label={`${pct}% received`} />
            <p className="mt-1.5 text-xs text-muted-foreground tabular">{pct}% received</p>
          </CardContent>
          <div className="border-t">
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="text-sm font-semibold">Payment history</h3>
              <span className="text-xs text-muted-foreground">{sv.payments.length} payment{sv.payments.length === 1 ? "" : "s"}</span>
            </div>
            {sv.payments.length === 0 ? (
              <p className="px-4 pb-5 text-[13px] text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Receipt</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead><span className="sr-only">Print</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sv.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.receiptNumber}</div>
                        <div className="text-[11px] text-muted-foreground">{p.kind === "booking" ? "Booking amount" : idx.users.get(p.recordedBy)?.name}</div>
                      </TableCell>
                      <TableCell>{formatDate(p.date)}</TableCell>
                      <TableCell>{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                      <TableCell className="max-w-48 text-muted-foreground">
                        {p.method === "finance" ? (
                          <div className="grid gap-1">
                            <span className="text-foreground">{p.lenderName}{p.loanReference && <span className="text-muted-foreground"> · {p.loanReference}</span>}</span>
                            {p.settledOn ? (
                              <span className="text-[11px]">Received {formatDate(p.settledOn)} into {accountName(p.settledAccountId)}</span>
                            ) : financePending(p) > 0 ? (
                              <span className="flex flex-wrap items-center gap-1.5">
                                <Badge tone="warning">Pending {formatINR(financePending(p))}</Badge>
                                {can("payments.record") && (
                                  <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setSettling(p)}>
                                    <CheckCircle2 /> Mark received
                                  </Button>
                                )}
                              </span>
                            ) : (
                              <span className="text-[11px]">Cancelled on return</span>
                            )}
                          </div>
                        ) : (
                          accountName(p.accountId)
                        )}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-muted-foreground">{p.reference || "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular">{formatINR(p.amountPaise)}</TableCell>
                      <TableCell className="text-right">
                        {can("receipts.print") && (
                          <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={`/receipt/${p.id}`} target="_blank" aria-label={`Print receipt ${p.receiptNumber}`}><Printer /></Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        <div className="grid content-start gap-4">
          {returns.length > 0 && (
            <Card>
              <CardHeader className="pb-1"><CardTitle>Returns</CardTitle><ReturnStatusBadge status={sale.returnStatus} /></CardHeader>
              <CardContent>
                <ul className="divide-y text-[13px]">
                  {returns.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                      <div>
                        <Link href={`/sales/returns/${r.id}`} className="font-medium text-primary hover:underline">{r.number}</Link>
                        <div className="text-xs text-muted-foreground">{formatDate(r.date)}{r.vehicleReturned ? " · car returned" : " · price adjustment"}</div>
                      </div>
                      <span className="font-medium tabular">{formatINR(r.returnAmountPaise)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-1"><CardTitle>Buyer</CardTitle></CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Row label="Name">{sv.customer?.name}</Row>
                <Row label="Phone">{sv.customer?.phone}</Row>
                <Row label="Address">{sv.customer?.address}</Row>
              </dl>
              {sv.customer?.notes && <p className="mt-2 text-[13px] text-muted-foreground">{sv.customer.notes}</p>}
            </CardContent>
          </Card>
          {sv.vehicle && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Vehicle</CardTitle>
                <Link href={`/inventory/${sv.vehicle.id}`} className="text-xs font-medium text-primary hover:underline">Open</Link>
              </CardHeader>
              <CardContent>
                <VehicleImage image={vv?.cover} alt={vehicleTitle(sv.vehicle)} className="mb-3 aspect-[16/9] w-full rounded-lg" />
                <div className="text-sm font-semibold">{sv.vehicle.year} {vehicleTitle(sv.vehicle)}</div>
                <div className="text-xs text-muted-foreground">{sv.vehicle.variant} · {sv.vehicle.registrationNumber}</div>
                <dl className="mt-2 divide-y">
                  <Row label="Asking price">{formatINR(sv.vehicle.askingPricePaise)}</Row>
                  <Row label="Sold by">{sv.soldBy?.name}</Row>
                </dl>
              </CardContent>
            </Card>
          )}
          <RoleGuard permission={["finance.viewCost", "finance.viewProfit"]}>
            <Card>
              <CardHeader className="pb-1"><CardTitle>Profitability</CardTitle></CardHeader>
              <CardContent>
                <dl className="divide-y">
                  <Row label="Sale price">{formatINR(sale.salePricePaise)}</Row>
                  <Row label="Purchase price"><FinancialValue paise={-sv.purchasePricePaise} /></Row>
                  <Row label="Vehicle expenses"><FinancialValue paise={-sv.vehicleExpensesPaise} /></Row>
                  <Row label="Gross profit">
                    <FinancialValue paise={sv.profitPaise} signed className="font-semibold" />
                    {sv.marginPct !== null && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({sv.marginPct}%)</span>}
                  </Row>
                </dl>
                <p className="mt-2 text-[11px] text-muted-foreground">General showroom expenses are not deducted from per-vehicle profit.</p>
              </CardContent>
            </Card>
          </RoleGuard>
        </div>
      </div>

      {sale.notes && (
        <Card className="mt-4 p-4 text-[13px]"><div className="mb-1 text-xs font-medium text-muted-foreground">Sale notes</div>{sale.notes}</Card>
      )}
      <DocumentsCard
        ownerType="sale"
        ownerId={sale.id}
        title="Buyer documents"
        description="Buyer's ID and address proof, PAN for high-value sales, and the signed sale letter / delivery note."
        checklist={["id_proof", "address_proof", "sale_letter"]}
        className="mt-4"
      />
      <Card className="mt-4">
        <CardHeader className="pb-0"><CardTitle>History</CardTitle></CardHeader>
        <div className="px-4"><ActivityFeed limit={20} compact filter={(e) => e.entityId === sale.id || e.href === `/sales/${sale.id}`} /></div>
      </Card>

      {can("payments.record") && (
        <PaymentDialog sale={sale} balancePaise={totals.balancePaise} open={paying} onOpenChange={setPaying} />
      )}
      {settling && <FinanceSettleDialog payment={settling} open onOpenChange={(o) => !o && setSettling(null)} />}
      {canReturn && <SalesReturnDialog sale={sale} open={returning} onOpenChange={setReturning} />}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this sale?"
        description={
          <>
            The sale is kept for the record and marked cancelled; <strong>{formatINR(totals.receivedPaise)}</strong> of recorded payments remain in history.
            The vehicle returns to available stock.
          </>
        }
        confirmLabel="Cancel sale"
        tone="destructive"
        requireReason
        onConfirm={async (reason) => {
          try {
            await dealerService.cancelSale(user, sale.id, reason);
            toast.success("Sale cancelled; vehicle returned to stock");
          } catch (e) {
            reportError(e);
            return false;
          }
        }}
      />
    </>
  );
}
