"use client";
import * as React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import {
  activeVehicles,
  expenseBreakdown,
  inventoryCounts,
  outstandingBalances,
  periodSummary,
  saleView,
  vehicleView,
} from "@/lib/calculations/selectors";
import { grossMarginPct } from "@/lib/calculations/finance";
import { describeRange, formatDate, inRange, resolvePreset, todayISO, type DateRange } from "@/lib/utils/dates";
import { formatINR, sumPaise } from "@/lib/utils/money";
import { EXPENSE_CATEGORY_LABELS, FUEL_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { csvRupees, downloadCsv } from "@/lib/utils/csv";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { BarChart3 } from "lucide-react";
import { ExpenseBreakdownChart, ExpenseLegend } from "@/features/dashboard/charts";

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular ${tone === "pos" ? "text-success" : tone === "neg" ? "text-destructive" : ""}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { can } = useAuth();
  if (!can("data.export")) return null;
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      <Download /> CSV
    </Button>
  );
}

export function ReportsPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const [range, setRange] = React.useState<DateRange>(resolvePreset("last_6_months"));
  const label = describeRange(range);
  const period = periodSummary(ds, idx, range);
  const counts = inventoryCounts(ds, idx);
  const outstanding = outstandingBalances(ds, idx);

  const sales = ds.sales.filter((s) => s.status === "completed" && inRange(s.saleDate, range)).map((s) => saleView(s, idx));
  sales.sort((a, b) => b.sale.saleDate.localeCompare(a.sale.saleDate));
  const purchases = ds.purchases.filter((p) => p.status === "active" && inRange(p.purchaseDate, range)).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  const expenses = ds.expenses.filter((e) => inRange(e.date, range));
  const breakdown = expenseBreakdown(expenses);
  const stock = activeVehicles(ds).filter((v) => v.status !== "sold").map((v) => vehicleView(v, idx));
  const cogs = sumPaise(sales.map((s) => s.purchasePricePaise + s.vehicleExpensesPaise));
  const ageBuckets = [
    { label: "0–30 days", test: (d: number) => d <= 30 },
    { label: "31–60 days", test: (d: number) => d > 30 && d <= 60 },
    { label: "61–90 days", test: (d: number) => d > 60 && d <= 90 },
    { label: "90+ days", test: (d: number) => d > 90 },
  ].map((b) => ({ label: b.label, count: stock.filter((s) => b.test(s.stockAgeDays)).length }));

  const stamp = todayISO();

  return (
    <>
      <PageHeader title="Reports" description="Inventory, sales, purchasing, expenses and profitability." actions={<DateRangePicker value={range} onChange={setRange} />} />

      {can("finance.viewProfit") && (
        <Card className="mb-4">
          <CardHeader>
            <div>
              <CardTitle>Business summary</CardTitle>
              <CardDescription>{label} · gross profit is per-vehicle; operating expenses are shown separately</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric label="Sales revenue" value={formatINR(period.revenuePaise)} hint={`${period.soldCount} cars`} />
              <Metric label="Cost of cars sold" value={formatINR(cogs)} hint="Purchase + vehicle expenses" />
              <Metric label="Gross profit" value={formatINR(period.grossProfitPaise)} tone={period.grossProfitPaise >= 0 ? "pos" : "neg"} hint={`Margin ${grossMarginPct(period.grossProfitPaise, period.revenuePaise) ?? 0}%`} />
              <Metric label="Operating expenses" value={formatINR(period.operatingExpensesPaise)} hint="General showroom costs" />
              <Metric label="Net after operating costs" value={formatINR(period.netContributionPaise)} tone={period.netContributionPaise >= 0 ? "pos" : "neg"} hint="Before tax; indicative only" />
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          {can("finance.viewCost") && <TabsTrigger value="purchases">Purchases</TabsTrigger>}
          {can("expenses.view") && <TabsTrigger value="expenses">Expenses</TabsTrigger>}
          {can("finance.viewProfit") && <TabsTrigger value="profit">Vehicle profitability</TabsTrigger>}
        </TabsList>

        <TabsContent value="inventory" className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric label="Available" value={String(counts.available)} />
            <Metric label="Reserved" value={String(counts.reserved)} />
            <Metric label="Sold (all time)" value={String(counts.sold)} />
            <Metric label="Inventory asking value" value={formatINR(counts.askingValuePaise)} hint="Available + reserved" />
            {can("finance.viewCost") && <Metric label="Inventory acquisition value" value={formatINR(counts.acquisitionValuePaise)} hint="Landed cost of stock" />}
          </div>
          <Card>
            <CardHeader>
              <div><CardTitle>Stock ageing</CardTitle><CardDescription>Days since purchase, current stock</CardDescription></div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {ageBuckets.map((b) => <Metric key={b.label} label={b.label} value={`${b.count} car${b.count === 1 ? "" : "s"}`} />)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div><CardTitle>Current stock</CardTitle><CardDescription>{stock.length} vehicles</CardDescription></div>
              <ExportButton
                disabled={stock.length === 0}
                onClick={() => {
                  downloadCsv(`inventory-summary-${stamp}.csv`, stock, [
                    { header: "Stock No.", value: (r) => r.vehicle.stockNumber },
                    { header: "Vehicle", value: (r) => `${r.vehicle.year} ${vehicleTitle(r.vehicle)} ${r.vehicle.variant}` },
                    { header: "Registration", value: (r) => r.vehicle.registrationNumber },
                    { header: "Status", value: (r) => r.vehicle.status },
                    { header: "Days in stock", value: (r) => r.stockAgeDays },
                    { header: "Asking (INR)", value: (r) => csvRupees(r.vehicle.askingPricePaise) },
                    ...(can("finance.viewCost") ? [{ header: "Landed cost (INR)", value: (r: (typeof stock)[number]) => csvRupees(r.landedCostPaise) }] : []),
                  ]);
                  toast.success("Inventory report exported");
                }}
              />
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Vehicle</TableHead><TableHead>Fuel</TableHead><TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Asking</TableHead>
                  {can("finance.viewCost") && <TableHead className="text-right">Landed cost</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.sort((a, b) => b.stockAgeDays - a.stockAgeDays).map((r) => (
                  <TableRow key={r.vehicle.id}>
                    <TableCell><Link href={`/inventory/${r.vehicle.id}`} className="hover:underline">{r.vehicle.year} {vehicleTitle(r.vehicle)}</Link> <span className="font-mono text-[11px] text-muted-foreground">{r.vehicle.registrationNumber}</span></TableCell>
                    <TableCell>{FUEL_LABELS[r.vehicle.fuelType]}</TableCell>
                    <TableCell className="text-right tabular">{r.stockAgeDays}</TableCell>
                    <TableCell className="text-right tabular">{formatINR(r.vehicle.askingPricePaise)}</TableCell>
                    {can("finance.viewCost") && <TableCell className="text-right tabular">{formatINR(r.landedCostPaise)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Cars sold" value={String(period.soldCount)} hint={label} />
            <Metric label="Revenue" value={formatINR(period.revenuePaise)} />
            <Metric label="Amount received" value={formatINR(period.receivedPaise)} hint="Against sales in period" />
            <Metric label="Outstanding balances" value={formatINR(outstanding.totalPaise)} hint={`${outstanding.count} sales, all time`} />
          </div>
          <Card>
            <CardHeader>
              <div><CardTitle>Sales in period</CardTitle><CardDescription>{sales.length} completed sales</CardDescription></div>
              <ExportButton
                disabled={sales.length === 0}
                onClick={() => {
                  downloadCsv(`sales-summary-${stamp}.csv`, sales, [
                    { header: "Sale Ref", value: (r) => r.sale.reference },
                    { header: "Date", value: (r) => r.sale.saleDate },
                    { header: "Vehicle", value: (r) => (r.vehicle ? `${r.vehicle.year} ${vehicleTitle(r.vehicle)}` : "") },
                    { header: "Buyer", value: (r) => r.customer?.name },
                    { header: "Sale price (INR)", value: (r) => csvRupees(r.sale.salePricePaise) },
                    { header: "Received (INR)", value: (r) => csvRupees(r.totals.receivedPaise) },
                    { header: "Balance (INR)", value: (r) => csvRupees(r.totals.balancePaise) },
                  ]);
                  toast.success("Sales report exported");
                }}
              />
            </CardHeader>
            {sales.length === 0 ? (
              <EmptyState icon={BarChart3} title="No sales in this period" className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Sale</TableHead><TableHead>Vehicle</TableHead><TableHead>Buyer</TableHead>
                    <TableHead className="text-right">Price</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((r) => (
                    <TableRow key={r.sale.id}>
                      <TableCell><Link href={`/sales/${r.sale.id}`} className="font-medium hover:underline">{r.sale.reference}</Link><div className="text-[11px] text-muted-foreground">{formatDate(r.sale.saleDate)}</div></TableCell>
                      <TableCell>{r.vehicle ? `${r.vehicle.year} ${vehicleTitle(r.vehicle)}` : "—"}</TableCell>
                      <TableCell>{r.customer?.name}</TableCell>
                      <TableCell className="text-right tabular">{formatINR(r.sale.salePricePaise)}</TableCell>
                      <TableCell className="text-right tabular">{formatINR(r.totals.receivedPaise)}</TableCell>
                      <TableCell className={`text-right tabular ${r.totals.balancePaise > 0 ? "text-warning" : "text-muted-foreground"}`}>{formatINR(r.totals.balancePaise)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right tabular">{formatINR(period.revenuePaise)}</TableCell>
                    <TableCell className="text-right tabular">{formatINR(period.receivedPaise)}</TableCell>
                    <TableCell className="text-right tabular">{formatINR(sumPaise(sales.map((s) => s.totals.balancePaise)))}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </Card>
        </TabsContent>

        {can("finance.viewCost") && (
          <TabsContent value="purchases" className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Metric label="Cars purchased" value={String(period.purchasesCount)} hint={label} />
              <Metric label="Acquisition cost" value={formatINR(period.acquisitionPaise)} />
              <Metric label="Average purchase price" value={formatINR(period.purchasesCount ? Math.round(period.acquisitionPaise / period.purchasesCount) : 0)} />
            </div>
            <Card>
              <CardHeader>
                <div><CardTitle>Recent purchases</CardTitle><CardDescription>{purchases.length} in period</CardDescription></div>
                <ExportButton
                  disabled={purchases.length === 0}
                  onClick={() => {
                    downloadCsv(`purchase-summary-${stamp}.csv`, purchases, [
                      { header: "Reference", value: (p) => p.reference },
                      { header: "Date", value: (p) => p.purchaseDate },
                      { header: "Vehicle", value: (p) => { const v = idx.vehicles.get(p.vehicleId); return v ? `${v.year} ${vehicleTitle(v)}` : ""; } },
                      { header: "Seller", value: (p) => p.sellerName },
                      { header: "Price (INR)", value: (p) => csvRupees(p.purchasePricePaise) },
                      { header: "Paid (INR)", value: (p) => csvRupees(p.amountPaidPaise) },
                    ]);
                    toast.success("Purchase report exported");
                  }}
                />
              </CardHeader>
              {purchases.length === 0 ? (
                <EmptyState icon={BarChart3} title="No purchases in this period" className="py-8" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent"><TableHead>Purchase</TableHead><TableHead>Vehicle</TableHead><TableHead>Seller</TableHead><TableHead className="text-right">Price</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((p) => {
                      const v = idx.vehicles.get(p.vehicleId);
                      return (
                        <TableRow key={p.id}>
                          <TableCell><Link href={`/purchases/${p.id}`} className="font-medium hover:underline">{p.reference}</Link><div className="text-[11px] text-muted-foreground">{formatDate(p.purchaseDate)}</div></TableCell>
                          <TableCell>{v ? `${v.year} ${vehicleTitle(v)}` : "—"}</TableCell>
                          <TableCell>{p.sellerName}</TableCell>
                          <TableCell className="text-right tabular">{formatINR(p.purchasePricePaise)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        )}

        {can("expenses.view") && (
          <TabsContent value="expenses" className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Metric label="Total expenses" value={formatINR(sumPaise(expenses.map((e) => e.amountPaise)))} hint={label} />
              <Metric label="Vehicle expenses" value={formatINR(period.vehicleExpensesPaise)} />
              <Metric label="General expenses" value={formatINR(period.operatingExpensesPaise)} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>By category</CardTitle><ExpenseLegend /></CardHeader>
                <div className="px-3 pb-4"><ExpenseBreakdownChart data={breakdown} height={320} /></div>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Category breakdown</CardTitle>
                  <ExportButton
                    disabled={breakdown.length === 0}
                    onClick={() => {
                      downloadCsv(`expense-summary-${stamp}.csv`, breakdown, [
                        { header: "Category", value: (b) => EXPENSE_CATEGORY_LABELS[b.category] },
                        { header: "Type", value: (b) => (b.vehicle ? "Vehicle" : "General") },
                        { header: "Amount (INR)", value: (b) => csvRupees(b.amountPaise) },
                      ]);
                      toast.success("Expense report exported");
                    }}
                  />
                </CardHeader>
                <Table>
                  <TableBody>
                    {breakdown.map((b) => (
                      <TableRow key={b.category}>
                        <TableCell>{EXPENSE_CATEGORY_LABELS[b.category]}<span className="ml-2 text-[11px] text-muted-foreground">{b.vehicle ? "Vehicle" : "General"}</span></TableCell>
                        <TableCell className="text-right tabular">{formatINR(b.amountPaise)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </TabsContent>
        )}

        {can("finance.viewProfit") && (
          <TabsContent value="profit">
            <Card>
              <CardHeader>
                <div><CardTitle>Vehicle profitability</CardTitle><CardDescription>Sale price − purchase price − vehicle-specific expenses. General expenses excluded.</CardDescription></div>
                <ExportButton
                  disabled={sales.length === 0}
                  onClick={() => {
                    downloadCsv(`vehicle-profitability-${stamp}.csv`, sales, [
                      { header: "Sale Ref", value: (r) => r.sale.reference },
                      { header: "Sale Date", value: (r) => r.sale.saleDate },
                      { header: "Vehicle", value: (r) => (r.vehicle ? `${r.vehicle.year} ${vehicleTitle(r.vehicle)}` : "") },
                      { header: "Registration", value: (r) => r.vehicle?.registrationNumber },
                      { header: "Sale Price (INR)", value: (r) => csvRupees(r.sale.salePricePaise) },
                      { header: "Purchase Cost (INR)", value: (r) => csvRupees(r.purchasePricePaise) },
                      { header: "Vehicle Expenses (INR)", value: (r) => csvRupees(r.vehicleExpensesPaise) },
                      { header: "Gross Profit (INR)", value: (r) => csvRupees(r.profitPaise) },
                      { header: "Gross Margin %", value: (r) => r.marginPct ?? "" },
                    ]);
                    toast.success("Profitability report exported");
                  }}
                />
              </CardHeader>
              {sales.length === 0 ? (
                <EmptyState icon={BarChart3} title="No sold vehicles in this period" className="py-8" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Sold vehicle</TableHead><TableHead className="text-right">Sale price</TableHead><TableHead className="text-right">Purchase cost</TableHead>
                      <TableHead className="text-right">Vehicle expenses</TableHead><TableHead className="text-right">Gross profit</TableHead><TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((r) => (
                      <TableRow key={r.sale.id}>
                        <TableCell>
                          {r.vehicle ? <Link href={`/inventory/${r.vehicle.id}`} className="hover:underline">{r.vehicle.year} {vehicleTitle(r.vehicle)}</Link> : "—"}
                          <div className="text-[11px] text-muted-foreground">{r.sale.reference} · {formatDate(r.sale.saleDate)}</div>
                        </TableCell>
                        <TableCell className="text-right tabular">{formatINR(r.sale.salePricePaise)}</TableCell>
                        <TableCell className="text-right tabular">{formatINR(r.purchasePricePaise)}</TableCell>
                        <TableCell className="text-right tabular">{formatINR(r.vehicleExpensesPaise)}</TableCell>
                        <TableCell className={`text-right font-medium tabular ${r.profitPaise >= 0 ? "text-success" : "text-destructive"}`}>{formatINR(r.profitPaise)}</TableCell>
                        <TableCell className="text-right tabular">{r.marginPct ?? "—"}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>Total ({sales.length})</TableCell>
                      <TableCell className="text-right tabular">{formatINR(period.revenuePaise)}</TableCell>
                      <TableCell className="text-right tabular">{formatINR(sumPaise(sales.map((s) => s.purchasePricePaise)))}</TableCell>
                      <TableCell className="text-right tabular">{formatINR(sumPaise(sales.map((s) => s.vehicleExpensesPaise)))}</TableCell>
                      <TableCell className="text-right tabular">{formatINR(period.grossProfitPaise)}</TableCell>
                      <TableCell className="text-right tabular">{grossMarginPct(period.grossProfitPaise, period.revenuePaise) ?? "—"}%</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
