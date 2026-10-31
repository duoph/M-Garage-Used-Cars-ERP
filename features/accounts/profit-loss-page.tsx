"use client";
import * as React from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { financialPosition, profitAndLoss } from "@/lib/calculations/ledger";
import { describeRange, resolvePreset, todayISO, type DateRange } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { csvRupees, downloadCsv } from "@/lib/utils/csv";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { StatCard } from "@/components/shared/stat-card";
import { useMoneyBook } from "./shared";

interface Line {
  label: string;
  amountPaise: number;
  /** Section heading, subtotal or plain line. */
  kind?: "head" | "total" | "grand";
  indent?: boolean;
  negative?: boolean;
}

function Statement({ lines }: { lines: Line[] }) {
  return (
    <dl className="text-sm">
      {lines.map((l, i) =>
        l.kind === "head" ? (
          <dt key={i} className="mt-4 mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:mt-0">{l.label}</dt>
        ) : (
          <div
            key={i}
            className={cn(
              "flex items-baseline justify-between gap-4 py-1.5",
              l.indent && "pl-4",
              l.kind === "total" && "border-t font-medium",
              l.kind === "grand" && "mt-2 border-t-2 border-foreground/20 pt-2.5 text-base font-semibold",
            )}
          >
            <dt className={cn(!l.kind && "text-muted-foreground")}>{l.label}</dt>
            <dd className={cn("tabular", l.kind === "grand" && (l.amountPaise < 0 ? "text-destructive" : "text-success"))}>
              {l.negative && l.amountPaise ? "(" : ""}
              {formatINR(Math.abs(l.amountPaise))}
              {l.negative && l.amountPaise ? ")" : ""}
              {!l.negative && l.amountPaise < 0 && " Dr"}
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}

/** Trading and profit & loss account for a period, plus where the business stands today. */
export function ProfitLossPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const { entries } = useMoneyBook();
  const [range, setRange] = React.useState<DateRange>(resolvePreset("this_year"));
  const pl = React.useMemo(() => profitAndLoss(ds, idx, range), [ds, idx, range]);
  const pos = React.useMemo(() => financialPosition(ds, idx, entries), [ds, idx, entries]);
  const showProfit = can("finance.viewProfit");

  const plLines: Line[] = [
    { label: "Trading", amountPaise: 0, kind: "head" },
    { label: `Sales of cars (${pl.carsSold})`, amountPaise: pl.salesPaise, indent: true },
    { label: "Less: purchase cost of cars sold", amountPaise: pl.purchaseCostPaise, indent: true, negative: true },
    { label: "Less: repairs & reconditioning of cars sold", amountPaise: pl.reconditioningPaise, indent: true, negative: true },
    { label: "Gross profit", amountPaise: pl.grossProfitPaise, kind: "total" },
    { label: "Other income", amountPaise: 0, kind: "head" },
    ...(pl.otherIncome.length ? pl.otherIncome.map((i) => ({ label: i.label, amountPaise: i.amountPaise, indent: true })) : [{ label: "None", amountPaise: 0, indent: true }]),
    { label: "Total other income", amountPaise: pl.otherIncomePaise, kind: "total" },
    { label: "Showroom expenses", amountPaise: 0, kind: "head" },
    ...(pl.expenses.length ? pl.expenses.map((e) => ({ label: e.label, amountPaise: e.amountPaise, indent: true, negative: true })) : [{ label: "None", amountPaise: 0, indent: true }]),
    { label: "Total expenses", amountPaise: pl.expensesPaise, kind: "total", negative: true },
    { label: pl.netProfitPaise >= 0 ? "Net profit" : "Net loss", amountPaise: pl.netProfitPaise, kind: "grand" },
  ];

  const posLines: Line[] = [
    { label: "What the showroom has", amountPaise: 0, kind: "head" },
    { label: "Cash in hand", amountPaise: pos.cashPaise, indent: true },
    { label: "Bank balances", amountPaise: pos.bankPaise, indent: true },
    { label: "Cars in stock (at landed cost)", amountPaise: pos.stockPaise, indent: true },
    { label: "Due from buyers", amountPaise: pos.receivablesPaise, indent: true },
    { label: "Staff advances", amountPaise: pos.advancesPaise, indent: true },
    { label: "Total assets", amountPaise: pos.assetsPaise, kind: "total" },
    { label: "What the showroom owes", amountPaise: 0, kind: "head" },
    { label: "Due to sellers", amountPaise: pos.payablesPaise, indent: true },
    { label: "Booking advances held", amountPaise: pos.customerAdvancesPaise, indent: true },
    { label: "Loans outstanding", amountPaise: pos.loansPaise, indent: true },
    { label: "Total liabilities", amountPaise: pos.liabilitiesPaise, kind: "total" },
    { label: "Owner's equity", amountPaise: pos.netWorthPaise, kind: "grand" },
  ];

  function exportCsv() {
    const rows = [
      ...plLines.filter((l) => l.kind !== "head").map((l) => ({ section: `Profit & loss (${describeRange(range)})`, ...l })),
      ...posLines.filter((l) => l.kind !== "head").map((l) => ({ section: `Financial position (${todayISO()})`, ...l })),
    ];
    downloadCsv(`profit-and-loss-${todayISO()}.csv`, rows, [
      { header: "Statement", value: (r) => r.section },
      { header: "Line", value: (r) => r.label },
      { header: "Amount (INR)", value: (r) => csvRupees(r.negative ? -r.amountPaise : r.amountPaise) },
    ]);
    toast.success("Statements exported");
  }

  return (
    <>
      <PageHeader
        title="Profit & Loss"
        description="Trading and profit & loss for a period, and the showroom's financial position today."
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            {can("data.export") && <Button variant="outline" onClick={exportCsv}><Download /> Export</Button>}
          </>
        }
      />
      {showProfit && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard label="Sales" value={formatINR(pl.salesPaise)} hint={`${pl.carsSold} cars · ${describeRange(range)}`} />
          <StatCard label="Gross profit" value={formatINR(pl.grossProfitPaise)} tone={pl.grossProfitPaise < 0 ? "danger" : "success"} />
          <StatCard label="Expenses" value={formatINR(pl.expensesPaise)} tone="danger" hint={pl.otherIncomePaise ? `Other income ${formatINR(pl.otherIncomePaise)}` : undefined} />
          <StatCard label={pl.netProfitPaise >= 0 ? "Net profit" : "Net loss"} value={formatINR(pl.netProfitPaise)} tone={pl.netProfitPaise < 0 ? "danger" : "success"} />
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {showProfit ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Profit & loss</CardTitle>
                <CardDescription>{describeRange(range)}. A car&apos;s cost is charged when it is sold; unsold stock is not an expense.</CardDescription>
              </div>
            </CardHeader>
            <CardContent><Statement lines={plLines} /></CardContent>
          </Card>
        ) : (
          <Card className="p-4 text-sm text-muted-foreground">Profit figures are hidden for your account.</Card>
        )}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Financial position</CardTitle>
              <CardDescription>As of today. Equity is what is left for the owner after everything owed.</CardDescription>
            </div>
          </CardHeader>
          <CardContent><Statement lines={showProfit ? posLines : posLines.filter((l) => !l.label.startsWith("Cars in stock") && l.kind !== "grand" && l.label !== "Total assets")} /></CardContent>
        </Card>
      </div>
    </>
  );
}
