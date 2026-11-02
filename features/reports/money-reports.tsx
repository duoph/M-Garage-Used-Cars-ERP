"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftRight, BadgeIndianRupee, Banknote, CalendarRange, ChevronRight, HandCoins, Landmark, Receipt, Scale, ShoppingCart, Undo2, Wallet, type LucideIcon } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import type { Permission } from "@/lib/permissions";
import {
  KIND_GROUP_LABELS,
  balanceSummary,
  bankSummary,
  cashInHandReport,
  dateWiseReport,
  duesReport,
  paymentsReport,
  purchaseReport,
  purchaseReturnReport,
  salesReport,
  salesReturnReport,
  type DateGrouping,
  type DateWiseRow,
  type DueRow,
  type OutgoingRow,
} from "@/lib/calculations/reports";
import type { MoneyEntry } from "@/lib/calculations/ledger";
import { formatDDMMYYYY, todayISO } from "@/lib/utils/dates";
import { formatINR, sumPaise } from "@/lib/utils/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils/labels";
import { format, parseISO } from "date-fns";
import type { SheetData } from "@/lib/utils/spreadsheet";
import type { AccountKind } from "@/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/page-header";
import { DateField } from "@/components/shared/date-field";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { accountLabel, maskedNumber } from "@/features/accounts/shared";
import { ExportButtons, PrintHeader, ReportFilterBar, ReportTable, SummaryTiles, reportHeader, toSheet, useReportFilters, type ReportColumn, type ReportFilters } from "./report-kit";

interface ReportDef {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  permission: Permission;
  Component: React.ComponentType;
}

/** One report screen: header, filters, export, and the printed header with the period and branch. */
function ReportFrame({ title, f, sheets, extra, showRange = true, children }: { title: string; f: ReportFilters; sheets: () => SheetData[]; extra?: React.ReactNode; showRange?: boolean; children: React.ReactNode }) {
  return (
    <div className="print-flat">
      <PageHeader title={title} breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Money reports", href: "/reports/accounts" }, { label: title }]} />
      <PrintHeader title={title} f={f} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <ReportFilterBar f={f} showRange={showRange} extra={extra} />
        <ExportButtons title={title} f={f} sheets={sheets} />
      </div>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      {children}
    </Card>
  );
}

const date = (d: string) => formatDDMMYYYY(d);
const time = (createdAt: string) => (createdAt ? format(parseISO(createdAt), "h:mm a") : "");

// ─── a) Total sales ────────────────────────────────────────────────────────────

function SalesReport() {
  const { ds, idx } = useData();
  const f = useReportFilters("this_month");
  const r = salesReport(ds, idx, f.range, f.branchIds);
  type Row = (typeof r.rows)[number];
  const columns: ReportColumn<Row>[] = [
    { header: "Date", value: (x) => date(x.sale.saleDate) },
    { header: "Invoice no.", value: (x) => x.sale.reference, cell: (x) => <span className="font-medium">{x.sale.reference}</span> },
    { header: "Customer", value: (x) => x.customer },
    { header: "Vehicle", value: (x) => x.vehicle, width: 30 },
    { header: "Sale amount", value: (x) => x.amountPaise, money: true, total: r.grossPaise },
    { header: "Received", value: (x) => x.receivedPaise, money: true, total: r.receivedPaise },
    { header: "Balance due", value: (x) => x.duePaise, money: true, total: r.duePaise },
    { header: "Payment modes", value: (x) => x.modes || "—" },
  ];
  type Mode = (typeof r.byMode)[number];
  const modeColumns: ReportColumn<Mode>[] = [
    { header: "Mode", value: (m) => PAYMENT_METHOD_LABELS[m.method] },
    { header: "Amount", value: (m) => m.amountPaise, money: true, total: sumPaise(r.byMode.map((m) => m.amountPaise)) },
  ];
  const title = "Total Sales Report";
  return (
    <ReportFrame title={title} f={f} sheets={() => [toSheet("Sales", columns, r.rows, reportHeader(title, f, ds.settings.showroomName)), toSheet("By payment mode", modeColumns, r.byMode, reportHeader(`${title} — by payment mode`, f, ds.settings.showroomName))]}>
      <SummaryTiles items={[{ label: "Gross sales", value: formatINR(r.grossPaise) }, { label: "Total received", value: formatINR(r.receivedPaise), tone: "pos" }, { label: "Total due", value: formatINR(r.duePaise), tone: r.duePaise ? "neg" : undefined }, { label: "Cars sold", value: String(r.rows.length) }]} />
      <Section title="Sales" description={`${f.rangeLabel} · ${f.branchLabel}`}>
        <ReportTable columns={columns} rows={r.rows} rowKey={(x) => x.sale.id} href={(x) => `/sales/${x.sale.id}`} empty="No sales in this period." />
      </Section>
      <Section title="Summary by payment mode" description="Loan amounts count as received from the buyer; see Payables & receivables for what lenders still owe.">
        <ReportTable columns={modeColumns} rows={r.byMode} rowKey={(m) => m.method} empty="No payments." />
      </Section>
    </ReportFrame>
  );
}

// ─── b) Sales returns ──────────────────────────────────────────────────────────

function SalesReturnsReport() {
  const { ds, idx } = useData();
  const f = useReportFilters("this_month");
  const r = salesReturnReport(ds, idx, f.range, f.branchIds);
  type Row = (typeof r.rows)[number];
  const columns: ReportColumn<Row>[] = [
    { header: "Date", value: (x) => date(x.ret.date) },
    { header: "Return no.", value: (x) => x.ret.number, cell: (x) => <span className="font-medium">{x.ret.number}</span> },
    { header: "Original invoice", value: (x) => x.invoice },
    { header: "Customer", value: (x) => x.customer },
    { header: "Vehicle", value: (x) => x.vehicle, width: 30 },
    { header: "Return amount", value: (x) => x.ret.returnAmountPaise, money: true, total: r.returnsPaise },
    { header: "Deductions", value: (x) => x.ret.deductionPaise, money: true, total: r.deductionsPaise },
    { header: "Refund paid", value: (x) => x.paidPaise, money: true, total: r.paidPaise },
    { header: "Refund pending", value: (x) => x.pendingPaise, money: true, total: r.pendingPaise },
    { header: "Refund mode / account", value: (x) => x.modes, width: 30 },
  ];
  const title = "Total Sales Return Report";
  return (
    <ReportFrame title={title} f={f} sheets={() => [toSheet("Sales returns", columns, r.rows, [...reportHeader(title, f, ds.settings.showroomName), `Net sales: ${formatINR(r.netSalesPaise)}`])]}>
      <SummaryTiles items={[{ label: "Total sales", value: formatINR(r.salesPaise) }, { label: "Sales returns", value: formatINR(r.returnsPaise), tone: "neg" }, { label: "Net sales", value: formatINR(r.netSalesPaise), tone: "pos" }, { label: "Refunds pending", value: formatINR(r.pendingPaise), tone: r.pendingPaise ? "neg" : undefined }]} />
      <Section title="Sales returns" description={`${f.rangeLabel} · ${f.branchLabel}`}>
        <ReportTable columns={columns} rows={r.rows} rowKey={(x) => x.ret.id} href={(x) => `/sales/returns/${x.ret.id}`} empty="No sales returns in this period." />
      </Section>
    </ReportFrame>
  );
}

// ─── c) Purchases ──────────────────────────────────────────────────────────────

function PurchasesReport() {
  const { ds, idx } = useData();
  const f = useReportFilters("this_month");
  const r = purchaseReport(ds, idx, f.range, f.branchIds);
  type Row = (typeof r.rows)[number];
  const columns: ReportColumn<Row>[] = [
    { header: "Date", value: (x) => date(x.purchase.purchaseDate) },
    { header: "Purchase no.", value: (x) => x.purchase.reference, cell: (x) => <span className="font-medium">{x.purchase.reference}</span> },
    { header: "Supplier", value: (x) => x.purchase.sellerName },
    { header: "Vehicle", value: (x) => x.vehicle, width: 30 },
    { header: "Amount", value: (x) => x.amountPaise, money: true, total: r.amountPaise },
    { header: "Paid", value: (x) => x.paidPaise, money: true, total: r.paidPaise },
    { header: "Balance payable", value: (x) => x.payablePaise, money: true, total: r.payablePaise },
  ];
  const title = "Total Purchase Report";
  return (
    <ReportFrame title={title} f={f} sheets={() => [toSheet("Purchases", columns, r.rows, reportHeader(title, f, ds.settings.showroomName))]}>
      <SummaryTiles items={[{ label: "Total purchases", value: formatINR(r.amountPaise) }, { label: "Paid", value: formatINR(r.paidPaise) }, { label: "Balance payable", value: formatINR(r.payablePaise), tone: r.payablePaise ? "neg" : undefined }, { label: "Cars bought", value: String(r.rows.length) }]} />
      <Section title="Purchases" description={`${f.rangeLabel} · ${f.branchLabel}`}>
        <ReportTable columns={columns} rows={r.rows} rowKey={(x) => x.purchase.id} href={(x) => `/purchases/${x.purchase.id}`} empty="No purchases in this period." />
      </Section>
    </ReportFrame>
  );
}

// ─── d) Purchase returns ───────────────────────────────────────────────────────

function PurchaseReturnsReport() {
  const { ds, idx } = useData();
  const f = useReportFilters("this_month");
  const r = purchaseReturnReport(ds, idx, f.range, f.branchIds);
  type Row = (typeof r.rows)[number];
  const columns: ReportColumn<Row>[] = [
    { header: "Date", value: (x) => date(x.ret.date) },
    { header: "Return no.", value: (x) => x.ret.number, cell: (x) => <span className="font-medium">{x.ret.number}</span> },
    { header: "Original purchase", value: (x) => x.original },
    { header: "Supplier", value: (x) => x.ret.sellerName },
    { header: "Vehicle", value: (x) => x.vehicle, width: 30 },
    { header: "Return amount", value: (x) => x.ret.returnAmountPaise, money: true, total: r.returnsPaise },
    { header: "Deductions", value: (x) => x.ret.deductionPaise, money: true, total: r.deductionsPaise },
    { header: "Refund received", value: (x) => x.receivedPaise, money: true, total: r.receivedPaise },
    { header: "Refund pending", value: (x) => x.pendingPaise, money: true, total: r.pendingPaise },
    { header: "Mode / account", value: (x) => x.modes, width: 30 },
  ];
  const title = "Purchase Return Report";
  return (
    <ReportFrame title={title} f={f} sheets={() => [toSheet("Purchase returns", columns, r.rows, [...reportHeader(title, f, ds.settings.showroomName), `Net purchases: ${formatINR(r.netPurchasesPaise)}`])]}>
      <SummaryTiles items={[{ label: "Total purchases", value: formatINR(r.purchasesPaise) }, { label: "Purchase returns", value: formatINR(r.returnsPaise), tone: "neg" }, { label: "Net purchases", value: formatINR(r.netPurchasesPaise) }, { label: "Refunds pending", value: formatINR(r.pendingPaise), tone: r.pendingPaise ? "neg" : undefined }]} />
      <Section title="Purchase returns" description={`${f.rangeLabel} · ${f.branchLabel}`}>
        <ReportTable columns={columns} rows={r.rows} rowKey={(x) => x.ret.id} href={(x) => `/purchases/returns/${x.ret.id}`} empty="No purchase returns in this period." />
      </Section>
    </ReportFrame>
  );
}

// ─── e, f) Statements ──────────────────────────────────────────────────────────

type StatementRow = { entry: MoneyEntry; balancePaise: number };

function statementColumns(rows: StatementRow[], labels: { in: string; out: string }, withTime = true): ReportColumn<StatementRow>[] {
  return [
    { header: "Date", value: (r) => date(r.entry.date) },
    ...(withTime ? [{ header: "Time", value: (r: StatementRow) => time(r.entry.createdAt) }] : []),
    { header: "Type", value: (r) => r.entry.typeLabel },
    { header: "Reference", value: (r) => r.entry.number, cell: (r) => <span className="font-medium">{r.entry.number}</span> },
    { header: "Party", value: (r) => r.entry.party || "—", width: 24 },
    { header: labels.in, value: (r) => (r.entry.direction === "in" ? r.entry.amountPaise : null), money: true, total: sumPaise(rows.filter((r) => r.entry.direction === "in").map((r) => r.entry.amountPaise)), className: "text-success" },
    { header: labels.out, value: (r) => (r.entry.direction === "out" ? r.entry.amountPaise : null), money: true, total: sumPaise(rows.filter((r) => r.entry.direction === "out").map((r) => r.entry.amountPaise)), className: "text-destructive" },
    { header: "Balance", value: (r) => r.balancePaise, money: true, cell: (r) => formatINR(r.balancePaise), total: rows.at(-1) ? rows.at(-1)!.balancePaise : "" },
  ];
}

function CashInHandReport() {
  const { ds } = useData();
  const f = useReportFilters("this_month");
  const r = cashInHandReport(ds, f.range, f.branchIds);
  const title = "Cash in Hand Report";
  const labels = { in: "Cash in", out: "Cash out" };
  return (
    <ReportFrame
      title={title}
      f={f}
      sheets={() =>
        r.sections.map((s) =>
          toSheet(s.branch.name, statementColumns(s.rows, labels), s.rows, [...reportHeader(`${title} — ${s.branch.name}`, f, ds.settings.showroomName), `Opening ${formatINR(s.openingPaise)} · Closing ${formatINR(s.closingPaise)}`]),
        )
      }
    >
      <SummaryTiles items={[{ label: "Opening cash", value: formatINR(r.openingPaise) }, { label: "Cash in", value: formatINR(r.inPaise), tone: "pos" }, { label: "Cash out", value: formatINR(r.outPaise), tone: "neg" }, { label: "Closing cash", value: formatINR(r.closingPaise) }]} />
      {r.sections.length === 0 && <EmptyState icon={Banknote} title="No cash accounts in this view" />}
      {r.sections.map((s) => (
        <Section key={s.branch.id} title={`${s.branch.name} — cash in hand`} description={`Opening ${formatINR(s.openingPaise)} on ${f.range.from ? date(f.range.from) : "start"} · closing ${formatINR(s.closingPaise)} on ${date(f.range.to ?? todayISO())}`}>
          <ReportTable columns={statementColumns(s.rows, labels)} rows={s.rows} rowKey={(x) => x.entry.key} href={(x) => x.entry.href} empty="No cash movement in this period." totalLabel="Total" />
        </Section>
      ))}
      {r.sections.length > 1 && (
        <Section title="All branches combined">
          <ReportTable
            columns={[
              { header: "Branch", value: (s: (typeof r.sections)[number]) => s.branch.name },
              { header: "Opening", value: (s) => s.openingPaise, money: true, total: r.openingPaise },
              { header: "Cash in", value: (s) => s.inPaise, money: true, total: r.inPaise },
              { header: "Cash out", value: (s) => s.outPaise, money: true, total: r.outPaise },
              { header: "Closing", value: (s) => s.closingPaise, money: true, total: r.closingPaise },
            ]}
            rows={r.sections}
            rowKey={(s) => s.branch.id}
          />
        </Section>
      )}
    </ReportFrame>
  );
}

function CashInBankReport() {
  const { ds } = useData();
  const f = useReportFilters("this_month");
  const [bank, setBank] = React.useState("summary");
  const summary = bankSummary(ds, f.range, f.branchIds);
  type Row = (typeof summary)[number];
  const summaryColumns: ReportColumn<Row>[] = [
    { header: "Bank", value: (s) => s.account.bankName || s.account.name, cell: (s) => <><div className="font-medium">{s.account.bankName || s.account.name}</div><div className="text-xs text-muted-foreground">{s.account.name}</div></> },
    { header: "Account no.", value: (s) => maskedNumber(s.account.accountNumber) || "—" },
    { header: "Opening balance", value: (s) => s.openingPaise, money: true, total: sumPaise(summary.map((s) => s.openingPaise)) },
    { header: "Total in", value: (s) => s.inPaise, money: true, total: sumPaise(summary.map((s) => s.inPaise)) },
    { header: "Total out", value: (s) => s.outPaise, money: true, total: sumPaise(summary.map((s) => s.outPaise)) },
    { header: "Closing balance", value: (s) => s.closingPaise, money: true, total: sumPaise(summary.map((s) => s.closingPaise)) },
  ];
  const labels = { in: "Deposit", out: "Withdrawal" };
  const shown = bank === "summary" ? [] : bank === "all" ? summary : summary.filter((s) => s.account.id === bank);
  // "All banks" groups statements under each bank name.
  const groups = [...new Set(shown.map((s) => s.account.bankName || s.account.name))].map((name) => ({ name, accounts: shown.filter((s) => (s.account.bankName || s.account.name) === name) }));
  const title = "Cash in Bank Report";
  return (
    <ReportFrame
      title={title}
      f={f}
      extra={
        <Select value={bank} onValueChange={setBank}>
          <SelectTrigger className="w-60" aria-label="Bank"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="summary">Summary of all banks</SelectItem>
            <SelectItem value="all">All banks — statements by bank</SelectItem>
            {summary.map((s) => <SelectItem key={s.account.id} value={s.account.id}>{accountLabel(s.account, ds.branches)}</SelectItem>)}
          </SelectContent>
        </Select>
      }
      sheets={() => [
        toSheet("Bank summary", summaryColumns, summary, reportHeader(title, f, ds.settings.showroomName)),
        ...shown.map((s) => toSheet(s.account.name, statementColumns(s.rows, labels, false), s.rows, [...reportHeader(`${title} — ${s.account.name}`, f, ds.settings.showroomName), `Opening ${formatINR(s.openingPaise)} · Closing ${formatINR(s.closingPaise)}`])),
      ]}
    >
      <Section title="Bank accounts" description={`${f.rangeLabel} · ${f.branchLabel} · click a bank for its statement`}>
        <ReportTable columns={summaryColumns} rows={summary} rowKey={(s) => s.account.id} empty="No bank accounts yet." />
        <div className="no-print flex flex-wrap gap-2 border-t px-4 py-3">
          {summary.map((s) => (
            <button key={s.account.id} type="button" onClick={() => setBank(s.account.id)} className="text-xs font-medium text-primary hover:underline">
              {accountLabel(s.account, ds.branches)} statement
            </button>
          ))}
        </div>
      </Section>
      {groups.map((g) => (
        <React.Fragment key={g.name}>
          {g.accounts.map((s) => (
            <Section key={s.account.id} title={`${g.name} — ${s.account.name} ${maskedNumber(s.account.accountNumber)}`} description={`Opening ${formatINR(s.openingPaise)} · closing ${formatINR(s.closingPaise)}`}>
              <ReportTable columns={statementColumns(s.rows, labels, false)} rows={s.rows} rowKey={(x) => x.entry.key} href={(x) => x.entry.href} empty="No movement in this period." />
            </Section>
          ))}
        </React.Fragment>
      ))}
    </ReportFrame>
  );
}

// ─── g) Payments & expenses ────────────────────────────────────────────────────

function PaymentsReport() {
  const { ds, idx } = useData();
  const f = useReportFilters("this_month");
  const r = paymentsReport(ds, idx, f.range, f.branchIds);
  const columns: ReportColumn<OutgoingRow>[] = [
    { header: "Date", value: (x) => date(x.entry.date) },
    { header: "Type / category", value: (x) => x.category },
    { header: "Party", value: (x) => x.entry.party || "—" },
    { header: "Description", value: (x) => `${x.entry.number} · ${x.entry.particulars}`, cell: (x) => <><div className="font-medium">{x.entry.number}</div><div className="max-w-72 truncate text-xs text-muted-foreground">{x.entry.particulars}</div></>, width: 36 },
    { header: "Paid from", value: (x) => x.account },
    { header: "Amount", value: (x) => x.entry.amountPaise, money: true, total: r.totalPaise },
  ];
  const groupColumns = (label: string): ReportColumn<{ label: string; amountPaise: number }>[] => [
    { header: label, value: (g) => g.label },
    { header: "Amount", value: (g) => g.amountPaise, money: true, total: r.totalPaise },
  ];
  const title = "Total Payments & Expenses Report";
  return (
    <ReportFrame
      title={title}
      f={f}
      sheets={() => [
        toSheet("Payments", columns, r.rows, reportHeader(title, f, ds.settings.showroomName)),
        toSheet("By category", groupColumns("Category"), r.byCategory, reportHeader(`${title} — by category`, f, ds.settings.showroomName)),
        toSheet("By account", groupColumns("Paid from"), r.byAccount, reportHeader(`${title} — by account`, f, ds.settings.showroomName)),
      ]}
    >
      <SummaryTiles items={[{ label: "Total paid out", value: formatINR(r.totalPaise), tone: "neg" }, { label: "Payments", value: String(r.rows.length) }, { label: "Largest category", value: r.byCategory[0]?.label ?? "—" }, { label: "Accounts used", value: String(r.byAccount.length) }]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="By category"><ReportTable columns={groupColumns("Category")} rows={r.byCategory} rowKey={(g) => g.label} totalLabel="Grand total" /></Section>
        <Section title="By paid-from account"><ReportTable columns={groupColumns("Paid from")} rows={r.byAccount} rowKey={(g) => g.label} totalLabel="Grand total" /></Section>
      </div>
      <Section title="Every payment" description={`${f.rangeLabel} · ${f.branchLabel}`}>
        <ReportTable columns={columns} rows={r.rows} rowKey={(x) => x.entry.key} href={(x) => x.entry.href} empty="Nothing was paid out in this period." totalLabel="Grand total" />
      </Section>
    </ReportFrame>
  );
}

// ─── h) Payables & receivables ─────────────────────────────────────────────────

function DuesReport() {
  const { ds, idx } = useData();
  const f = useReportFilters("all");
  const [asOf, setAsOf] = React.useState(todayISO());
  const r = duesReport(ds, idx, asOf, f.range, f.branchIds);
  const columns = (rows: DueRow[]): ReportColumn<DueRow>[] => [
    { header: "Party", value: (x) => x.party, cell: (x) => <><div className="font-medium">{x.party}</div><div className="text-xs text-muted-foreground">{x.kind}</div></> },
    { header: "Type", value: (x) => x.kind, className: "hidden print:table-cell" },
    { header: "Reference", value: (x) => x.reference },
    { header: "Original date", value: (x) => date(x.date) },
    { header: "Total amount", value: (x) => x.totalPaise, money: true, total: sumPaise(rows.map((x) => x.totalPaise)) },
    { header: "Paid / received so far", value: (x) => x.settledPaise, money: true, total: sumPaise(rows.map((x) => x.settledPaise)) },
    { header: "Outstanding", value: (x) => x.outstandingPaise, money: true, total: sumPaise(rows.map((x) => x.outstandingPaise)) },
    { header: "Days pending", value: (x) => x.daysPending, align: "right" },
  ];
  const receivables = r.rows.filter((x) => x.side === "receivable");
  const payables = r.rows.filter((x) => x.side === "payable");
  const partyColumns = (total: number): ReportColumn<{ party: string; amountPaise: number }>[] => [
    { header: "Party", value: (p) => p.party },
    { header: "Outstanding", value: (p) => p.amountPaise, money: true, total },
  ];
  const title = "Cash Payable & Receivable Report";
  const fWithAsOf = { ...f, rangeLabel: `As of ${date(asOf)} · created ${f.rangeLabel}` };
  return (
    <ReportFrame
      title={title}
      f={fWithAsOf}
      extra={
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          As of <DateField value={asOf} max={todayISO()} onChange={(e) => e.target.value && setAsOf(e.target.value)} className="w-40" aria-label="As of date" />
        </label>
      }
      sheets={() => [
        toSheet("Receivables", columns(receivables), receivables, reportHeader(`${title} — receivables`, fWithAsOf, ds.settings.showroomName)),
        toSheet("Payables", columns(payables), payables, reportHeader(`${title} — payables`, fWithAsOf, ds.settings.showroomName)),
      ]}
    >
      <SummaryTiles items={[{ label: "Total receivable", value: formatINR(r.receivablePaise), tone: "pos" }, { label: "Total payable", value: formatINR(r.payablePaise), tone: "neg" }, { label: "Net position", value: formatINR(r.netPaise), tone: r.netPaise >= 0 ? "pos" : "neg" }, { label: "Open items", value: String(r.rows.length) }]} />
      <Section title="Receivables — money we should get" description="Buyer balances, loans pending from lenders, refunds due from sellers.">
        <ReportTable columns={columns(receivables)} rows={receivables} rowKey={(x, i) => `${x.reference}-${i}`} href={(x) => x.href} empty="Nothing to receive." totalLabel="Total receivable" />
      </Section>
      <Section title="Payables — money we owe" description="Seller balances, refunds due to buyers, loans taken.">
        <ReportTable columns={columns(payables)} rows={payables} rowKey={(x, i) => `${x.reference}-${i}`} href={(x) => x.href} empty="Nothing to pay." totalLabel="Total payable" />
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Receivable by party"><ReportTable columns={partyColumns(r.receivablePaise)} rows={r.partyTotals("receivable")} rowKey={(p) => p.party} /></Section>
        <Section title="Payable by party"><ReportTable columns={partyColumns(r.payablePaise)} rows={r.partyTotals("payable")} rowKey={(p) => p.party} /></Section>
      </div>
    </ReportFrame>
  );
}

// ─── i) Account balance summary ────────────────────────────────────────────────

function BalanceSummaryReport() {
  const { ds } = useData();
  const f = useReportFilters("all");
  const [asOf, setAsOf] = React.useState(todayISO());
  const r = balanceSummary(ds, asOf, f.branchIds);
  type Row = (typeof r.summaries)[number];
  const kinds: AccountKind[] = ["cash", "bank", "finance", "owner"];
  const columns = (rows: Row[]): ReportColumn<Row>[] => [
    { header: "Account", value: (s) => accountLabel(s.account, ds.branches) },
    { header: "Details", value: (s) => (s.account.kind === "bank" ? [s.account.bankName, maskedNumber(s.account.accountNumber)].filter(Boolean).join(" · ") : s.account.kind === "cash" ? ds.branches.find((b) => b.id === s.account.branchId)?.name ?? "" : "") || "—" },
    { header: "Balance", value: (s) => s.balancePaise, money: true, cell: (s) => <span className={s.balancePaise < 0 ? "text-destructive" : ""}>{formatINR(s.balancePaise)}</span>, total: sumPaise(rows.map((s) => s.balancePaise)) },
  ];
  const title = "Account Balance Summary";
  const fAsOf = { ...f, rangeLabel: `As of ${date(asOf)}` };
  return (
    <ReportFrame
      title={title}
      f={fAsOf}
      showRange={false}
      extra={
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          As of <DateField value={asOf} max={todayISO()} onChange={(e) => e.target.value && setAsOf(e.target.value)} className="w-40" aria-label="As of date" />
        </label>
      }
      sheets={() => [toSheet("Balances", columns(r.summaries), r.summaries, [...reportHeader(title, fAsOf, ds.settings.showroomName), `Grand total (cash + bank + loans due): ${formatINR(r.grandTotalPaise)}`])]}
    >
      <SummaryTiles items={[{ label: "Cash in hand", value: formatINR(r.cashPaise) }, { label: "In bank", value: formatINR(r.bankPaise) }, { label: "Loans due from lenders", value: formatINR(r.financePaise) }, { label: "Grand total", value: formatINR(r.grandTotalPaise), tone: "pos" }]} />
      {kinds.map((k) => {
        const rows = r.summaries.filter((s) => s.account.kind === k);
        if (rows.length === 0) return null;
        return (
          <Section key={k} title={KIND_GROUP_LABELS[k]} description={k === "owner" ? "Handed over to the owner; not counted in the grand total." : undefined}>
            <ReportTable columns={columns(rows)} rows={rows} rowKey={(s) => s.account.id} href={(s) => `/accounts?account=${s.account.id}`} totalLabel="Subtotal" />
          </Section>
        );
      })}
      {r.summaries.some((s) => s.account.id === "unassigned") && (
        <p className="text-xs text-muted-foreground">Unassigned is older expenses with no “Paid from” account. Assign them on the Expenses page.</p>
      )}
    </ReportFrame>
  );
}

// ─── j) Date-wise summary ──────────────────────────────────────────────────────

const GROUPING_LABELS: Record<DateGrouping, string> = { day: "Day-wise", week: "Week-wise", month: "Month-wise" };

function DateWiseReport() {
  const { ds } = useData();
  const { can } = useAuth();
  const f = useReportFilters("this_month");
  const [by, setBy] = React.useState<DateGrouping>("day");
  const [skipEmpty, setSkipEmpty] = React.useState(false);
  const r = dateWiseReport(ds, f.range, f.branchIds, by, skipEmpty);
  const showCost = can("finance.viewCost");
  const period = (x: DateWiseRow) => (x.key === x.end ? format(parseISO(x.key), "dd-MM-yyyy (EEE)") : `${date(x.key)} to ${date(x.end)}`);
  const columns: ReportColumn<DateWiseRow>[] = [
    { header: by === "day" ? "Date" : "Period", value: period, cell: (x) => <span className="font-medium whitespace-nowrap">{period(x)}</span>, width: 26 },
    { header: "Cars sold", value: (x) => x.carsSold, cell: (x) => x.carsSold || "—", align: "right", total: String(r.carsSold), width: 10 },
    { header: "Sales", value: (x) => x.salesPaise, money: true, total: r.salesPaise },
    { header: "Sales returns", value: (x) => x.returnsPaise, money: true, total: r.returnsPaise },
    ...(showCost
      ? [
          { header: "Cars bought", value: (x: DateWiseRow) => x.carsBought, cell: (x: DateWiseRow) => x.carsBought || "—", align: "right" as const, total: String(r.carsBought), width: 10 },
          { header: "Purchases", value: (x: DateWiseRow) => x.purchasesPaise, money: true, total: r.purchasesPaise },
        ]
      : []),
    { header: "Expenses", value: (x) => x.expensesPaise, money: true, total: r.expensesPaise },
    { header: "Money in", value: (x) => x.inPaise, money: true, total: r.inPaise, className: "text-success" },
    { header: "Money out", value: (x) => x.outPaise, money: true, total: r.outPaise, className: "text-destructive" },
    {
      header: "Net cash flow",
      value: (x) => x.inPaise - x.outPaise,
      money: true,
      cell: (x) => (x.inPaise || x.outPaise ? <span className={x.inPaise - x.outPaise < 0 ? "text-destructive" : ""}>{formatINR(x.inPaise - x.outPaise)}</span> : "—"),
      total: r.inPaise - r.outPaise,
    },
  ];
  const title = `${GROUPING_LABELS[by]} Summary Report`;
  return (
    <ReportFrame
      title={title}
      f={f}
      extra={
        <>
          <Select value={by} onValueChange={(v) => setBy(v as DateGrouping)}>
            <SelectTrigger className="w-36" aria-label="Group by"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(GROUPING_LABELS) as DateGrouping[]).map((g) => <SelectItem key={g} value={g}>{GROUPING_LABELS[g]}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Switch checked={skipEmpty} onCheckedChange={setSkipEmpty} aria-label="Hide days with no activity" /> Hide empty {by === "day" ? "days" : `${by}s`}
          </label>
        </>
      }
      sheets={() => [toSheet(GROUPING_LABELS[by], columns, r.rows, reportHeader(title, f, ds.settings.showroomName))]}
    >
      <SummaryTiles
        items={[
          { label: "Sales", value: formatINR(r.salesPaise), tone: "pos" },
          { label: showCost ? "Purchases" : "Expenses", value: formatINR(showCost ? r.purchasesPaise : r.expensesPaise) },
          { label: "Net cash flow", value: formatINR(r.inPaise - r.outPaise), tone: r.inPaise - r.outPaise >= 0 ? "pos" : "neg" },
          { label: "Days with activity", value: String(r.activeDays) },
        ]}
      />
      <Section title={GROUPING_LABELS[by]} description={`${f.rangeLabel} · ${f.branchLabel}${by === "day" ? " · click a day to open its Day Book" : ""}`}>
        <ReportTable
          columns={columns}
          rows={r.rows}
          rowKey={(x) => x.key}
          href={by === "day" ? (x) => `/accounts/day-book?date=${x.key}` : undefined}
          empty="Nothing in this period."
        />
      </Section>
      <p className="text-xs text-muted-foreground">Money in / out is every receipt and payment in cash and bank, excluding opening balances and transfers between the showroom&apos;s own accounts — the same totals as the Day Book.</p>
    </ReportFrame>
  );
}

// ─── Hub ───────────────────────────────────────────────────────────────────────

export const MONEY_REPORTS: ReportDef[] = [
  { slug: "date-wise", title: "Date-wise Summary Report", description: "Sales, purchases, expenses and money in / out for each day, week or month of any date range.", icon: CalendarRange, permission: "accounts.view", Component: DateWiseReport },
  { slug: "sales", title: "Total Sales Report", description: "Each sale with received, balance due and payment modes.", icon: Receipt, permission: "sales.viewAll", Component: SalesReport },
  { slug: "sales-returns", title: "Total Sales Return Report", description: "Returns, deductions, refunds paid and pending; net sales.", icon: Undo2, permission: "sales.viewAll", Component: SalesReturnsReport },
  { slug: "purchases", title: "Total Purchase Report", description: "Each purchase with paid and balance payable.", icon: ShoppingCart, permission: "finance.viewCost", Component: PurchasesReport },
  { slug: "purchase-returns", title: "Purchase Return Report", description: "Cars sent back, refunds received and pending; net purchases.", icon: ArrowLeftRight, permission: "finance.viewCost", Component: PurchaseReturnsReport },
  { slug: "cash-in-hand", title: "Cash in Hand Report", description: "Opening, every cash movement with running balance, closing — per branch.", icon: Banknote, permission: "accounts.view", Component: CashInHandReport },
  { slug: "cash-in-bank", title: "Cash in Bank Report", description: "Every bank's opening, in, out and closing, with statements.", icon: Landmark, permission: "accounts.view", Component: CashInBankReport },
  { slug: "payments", title: "Total Payments & Expenses", description: "Every outgoing payment, by category and by paid-from account.", icon: Wallet, permission: "accounts.view", Component: PaymentsReport },
  { slug: "payables-receivables", title: "Cash Payable & Receivable", description: "What we should get, what we owe, and the net position.", icon: HandCoins, permission: "accounts.view", Component: DuesReport },
  { slug: "balances", title: "Account Balance Summary", description: "Where all the money is: each branch's cash, banks, lenders.", icon: Scale, permission: "accounts.view", Component: BalanceSummaryReport },
];

export function MoneyReportsHub() {
  const { can } = useAuth();
  const list = MONEY_REPORTS.filter((r) => can(r.permission));
  return (
    <>
      <PageHeader title="Money reports" description="Built from the ledger: every rupee in or out, by account and branch." breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Money reports" }]} />
      <MoneyReportLinks reports={list} />
    </>
  );
}

export function MoneyReportLinks({ reports = MONEY_REPORTS }: { reports?: ReportDef[] }) {
  const { can } = useAuth();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {reports.filter((r) => can(r.permission)).map((r) => (
        <Link key={r.slug} href={`/reports/accounts/${r.slug}`} className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><r.icon className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{r.title}</span>
            <span className="block text-xs text-muted-foreground">{r.description}</span>
          </span>
          <ChevronRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  );
}

export function MoneyReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const { can } = useAuth();
  const report = MONEY_REPORTS.find((r) => r.slug === slug);
  if (!report) return <EmptyState icon={BadgeIndianRupee} title="Report not found" className="py-24" />;
  if (!can(report.permission)) return <AccessDenied />;
  return <report.Component />;
}
