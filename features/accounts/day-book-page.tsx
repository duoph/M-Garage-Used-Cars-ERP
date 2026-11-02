"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { reportError } from "@/hooks/use-commands";
import { dealerService } from "@/lib/services/dealer-service";
import { accountSummaries, entriesForBranches, signed, type MoneyEntry } from "@/lib/calculations/ledger";
import { formatDDMMYYYY, inRange, todayISO } from "@/lib/utils/dates";
import { formatINR, sumPaise } from "@/lib/utils/money";
import { format, parseISO } from "date-fns";
import type { DayClose } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { CurrencyInput } from "@/components/shared/currency-input";
import { Field } from "@/components/shared/form-field";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ExportButtons, PrintHeader, ReportFilterBar, ReportTable, reportHeader, toSheet, useReportFilters, type ReportColumn } from "@/features/reports/report-kit";
import { MoneyActions } from "./cash-bank-page";
import { accountLabel, liveAccounts } from "./shared";

const time = (createdAt: string) => (createdAt ? format(parseISO(createdAt), "h:mm a") : "");

/**
 * Every money movement in time order (sale receipts per payment line, refunds, seller payments, expenses,
 * transfers, deposits, withdrawals, loan receipts) with each account's opening + in − out = closing.
 */
export function DayBookPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const params = useSearchParams();
  const f = useReportFilters("today");
  const [account, setAccount] = React.useState("all");
  const [closing, setClosing] = React.useState(false);
  const [reopening, setReopening] = React.useState<DayClose | null>(null);
  const user = useCurrentUser();

  // `?date=` from an activity entry jumps to that day.
  const linked = params.get("date");
  const { setRange } = f;
  React.useEffect(() => {
    if (linked) setRange({ preset: "custom", from: linked, to: linked });
  }, [linked, setRange]);

  const scoped = React.useMemo(() => entriesForBranches(ds.ledger, f.branchIds), [ds.ledger, f.branchIds]);
  const accounts = liveAccounts(ds.accounts).filter((a) => f.branchIds === null || a.kind !== "cash" || (a.branchId && f.branchIds.includes(a.branchId)));
  const own = account === "all" ? scoped : scoped.filter((e) => e.accountId === account);
  const rows = own.filter((e) => e.source !== "opening" && inRange(e.date, f.range));

  // Opening = everything posted before the From date (opening balances included); closing adds the range.
  const before = f.range.from ? own.filter((e) => e.date < f.range.from!) : [];
  const openingOf = (id: string) => sumPaise(before.filter((e) => e.accountId === id).map(signed));
  const inRangeOpening = own.filter((e) => e.source === "opening" && inRange(e.date, f.range));
  const perAccount = accountSummaries(ds.accounts, own)
    .map((s) => {
      const range = rows.filter((e) => e.accountId === s.account.id);
      const opening = openingOf(s.account.id) + sumPaise(inRangeOpening.filter((e) => e.accountId === s.account.id).map(signed));
      const inPaise = sumPaise(range.filter((e) => e.direction === "in").map((e) => e.amountPaise));
      const outPaise = sumPaise(range.filter((e) => e.direction === "out").map((e) => e.amountPaise));
      return { account: s.account, opening, inPaise, outPaise, closing: opening + inPaise - outPaise };
    })
    .filter((r) => r.opening !== 0 || r.inPaise !== 0 || r.outPaise !== 0);

  const real = rows.filter((e) => !e.transfer);
  const inPaise = sumPaise(real.filter((e) => e.direction === "in").map((e) => e.amountPaise));
  const outPaise = sumPaise(real.filter((e) => e.direction === "out").map((e) => e.amountPaise));
  const cash = sumPaise(perAccount.filter((r) => r.account.kind === "cash").map((r) => r.closing));
  const bank = sumPaise(perAccount.filter((r) => r.account.kind === "bank").map((r) => r.closing));

  const singleDay = f.range.from && f.range.from === f.range.to ? f.range.from : null;
  const branchId = f.branch !== "all" ? f.branch : ds.branches.length === 1 ? ds.branches[0].id : null;
  const closes = ds.dayCloses.filter((c) => inRange(c.date, f.range) && (f.branchIds === null || f.branchIds.includes(c.branchId)));
  const closedToday = singleDay && branchId ? ds.dayCloses.find((c) => c.date === singleDay && c.branchId === branchId) : undefined;
  const accountName = (id: string) => {
    const a = idx.accounts.get(id);
    return a ? accountLabel(a, ds.branches) : id === "unassigned" ? "Unassigned" : "—";
  };

  const columns: ReportColumn<MoneyEntry>[] = [
    { header: "Date / time", value: (e) => `${formatDDMMYYYY(e.date)} ${time(e.createdAt)}`.trim(), cell: (e) => <><div>{formatDDMMYYYY(e.date)}</div><div className="text-[11px] text-muted-foreground">{time(e.createdAt)}</div></>, width: 18 },
    { header: "Type", value: (e) => e.typeLabel, cell: (e) => <span className="whitespace-nowrap">{e.typeLabel}{e.transfer && <Badge tone="neutral" className="ml-1.5">Transfer</Badge>}</span> },
    { header: "Description / reference", value: (e) => `${e.number} · ${[e.party, e.particulars].filter(Boolean).join(" · ")}`, cell: (e) => <><div className="font-medium">{e.number}</div><div className="max-w-80 truncate text-xs text-muted-foreground">{[e.party, e.particulars].filter(Boolean).join(" · ")}</div></>, width: 40 },
    { header: "Account", value: (e) => accountName(e.accountId), cell: (e) => <span className="text-muted-foreground">{accountName(e.accountId)}</span>, width: 24 },
    { header: "Money in", value: (e) => (e.direction === "in" ? e.amountPaise : null), money: true, total: sumPaise(rows.filter((e) => e.direction === "in").map((e) => e.amountPaise)), className: "text-success" },
    { header: "Money out", value: (e) => (e.direction === "out" ? e.amountPaise : null), money: true, total: sumPaise(rows.filter((e) => e.direction === "out").map((e) => e.amountPaise)), className: "text-destructive" },
    { header: "Entered by", value: (e) => (e.enteredBy ? idx.users.get(e.enteredBy)?.name ?? "" : ""), cell: (e) => <span className="text-xs text-muted-foreground">{e.enteredBy ? idx.users.get(e.enteredBy)?.name : "—"}</span> },
  ];
  type AccRow = (typeof perAccount)[number];
  const accountColumns: ReportColumn<AccRow>[] = [
    { header: "Account", value: (r) => accountLabel(r.account, ds.branches) },
    { header: "Opening balance", value: (r) => r.opening, money: true, total: sumPaise(perAccount.map((r) => r.opening)) },
    { header: "In", value: (r) => r.inPaise, money: true, total: sumPaise(perAccount.map((r) => r.inPaise)) },
    { header: "Out", value: (r) => r.outPaise, money: true, total: sumPaise(perAccount.map((r) => r.outPaise)) },
    { header: "Closing balance", value: (r) => r.closing, money: true, total: sumPaise(perAccount.map((r) => r.closing)) },
  ];
  const title = "Day Book";

  return (
    <div className="print-flat">
      <PageHeader title="Day Book" description="Every receipt, payment, expense, refund and transfer, in time order." actions={<MoneyActions />} />
      <PrintHeader title={title} f={f} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <ReportFilterBar
          f={f}
          extra={
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger className="w-56" aria-label="Account"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{accountLabel(a, ds.branches)}</SelectItem>)}
              </SelectContent>
            </Select>
          }
        />
        <div className="no-print flex flex-wrap gap-2">
          {can("accounts.manage") && singleDay && branchId && !closedToday && singleDay <= todayISO() && (
            <Button variant="outline" size="sm" onClick={() => setClosing(true)}><Lock /> Close day</Button>
          )}
          <ExportButtons
            title={title}
            f={f}
            sheets={() => [
              toSheet("Day book", columns, rows, reportHeader(title, f, ds.settings.showroomName)),
              toSheet("Account balances", accountColumns, perAccount, reportHeader(`${title} — account balances`, f, ds.settings.showroomName)),
            ]}
          />
        </div>
      </div>
      {closedToday && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-[13px]">
          <Lock className="size-4" /> Closed by {idx.users.get(closedToday.closedBy)?.name} — entries on this day are locked.
          {closedToday.differencePaise !== 0 && <Badge tone="warning">Cash {closedToday.differencePaise > 0 ? "over" : "short"} {formatINR(Math.abs(closedToday.differencePaise))}</Badge>}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Money in" value={formatINR(inPaise)} tone="success" hint={`${real.filter((e) => e.direction === "in").length} entries, transfers excluded`} />
        <StatCard label="Money out" value={formatINR(outPaise)} tone={outPaise ? "danger" : "neutral"} hint={`${real.filter((e) => e.direction === "out").length} entries, transfers excluded`} />
        <StatCard label="Cash at end" value={formatINR(cash)} tone={cash < 0 ? "danger" : "neutral"} />
        <StatCard label="Bank at end" value={formatINR(bank)} tone={bank < 0 ? "danger" : "neutral"} />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Account balances</CardTitle>
            <CardDescription>{f.rangeLabel} · {f.branchLabel} · opening + in − out = closing</CardDescription>
          </div>
        </CardHeader>
        <ReportTable columns={accountColumns} rows={perAccount} rowKey={(r) => r.account.id} href={(r) => `/accounts?account=${r.account.id}`} empty="No balances in this view." />
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>{rows.length} entries · click a row to open it</CardDescription>
          </div>
        </CardHeader>
        <ReportTable columns={columns} rows={rows} rowKey={(e) => e.key} href={(e) => e.href} empty="Nothing was received or paid in this period." />
      </Card>
      {closes.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Closed days</CardTitle></CardHeader>
          <ul className="divide-y text-[13px]">
            {closes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span>{formatDDMMYYYY(c.date)} · {ds.branches.find((b) => b.id === c.branchId)?.name} · closed by {idx.users.get(c.closedBy)?.name}</span>
                <span className="flex items-center gap-2">
                  {c.differencePaise === 0 ? <Badge tone="success">Cash matched</Badge> : <Badge tone="warning">{c.differencePaise > 0 ? "Over" : "Short"} {formatINR(Math.abs(c.differencePaise))}</Badge>}
                  {user.role === "admin" && <Button variant="ghost" size="sm" className="no-print" onClick={() => setReopening(c)}><LockOpen /> Reopen</Button>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {closing && singleDay && branchId && <CloseDayDialog date={singleDay} branchId={branchId} onDone={() => setClosing(false)} />}
      <ConfirmDialog
        open={!!reopening}
        onOpenChange={(o) => !o && setReopening(null)}
        title="Reopen this day?"
        description="Its entries can be changed again. The reopening is recorded in the activity log."
        confirmLabel="Reopen day"
        requireReason
        onConfirm={async (reason) => {
          if (!reopening) return;
          try {
            await dealerService.reopenDay(user, reopening.id, reason);
            toast.success("Day reopened");
          } catch (e) {
            reportError(e);
            return false;
          }
        }}
      />
    </div>
  );
}

/** Count the branch's cash, record any difference, and lock the day's entries. */
function CloseDayDialog({ date, branchId, onDone }: { date: string; branchId: string; onDone: () => void }) {
  const { ds } = useData();
  const user = useCurrentUser();
  const cashAccounts = ds.accounts.filter((a) => a.kind === "cash" && a.branchId === branchId && !a.archived);
  const system = accountSummaries(cashAccounts, ds.ledger, date);
  const [counted, setCounted] = React.useState<Record<string, number | null>>(() => Object.fromEntries(system.map((s) => [s.account.id, s.balancePaise])));
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const difference = sumPaise(system.map((s) => (counted[s.account.id] ?? 0) - s.balancePaise));
  const branch = ds.branches.find((b) => b.id === branchId);

  async function save() {
    setSaving(true);
    try {
      await dealerService.closeDay(user, { branchId, date, notes, counted: system.map((s) => ({ accountId: s.account.id, countedPaise: counted[s.account.id] ?? 0 })) });
      toast.success(`${formatDDMMYYYY(date)} closed for ${branch?.name}`);
      onDone();
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close {formatDDMMYYYY(date)}</DialogTitle>
          <DialogDescription>Count the cash at {branch?.name}. Once closed, that day&apos;s entries can&apos;t be changed until an Admin reopens it.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {system.length === 0 && <p className="text-[13px] text-muted-foreground">This branch has no cash account.</p>}
          {system.map((s) => (
            <Field key={s.account.id} label={`${s.account.name} — counted`} htmlFor={`cd-${s.account.id}`} hint={`System balance ${formatINR(s.balancePaise)}`}>
              <CurrencyInput id={`cd-${s.account.id}`} value={counted[s.account.id]} onChange={(v) => setCounted((c) => ({ ...c, [s.account.id]: v }))} />
            </Field>
          ))}
          <div className="rounded-lg bg-muted/60 p-3 text-[13px]">
            Difference: <strong className={difference === 0 ? "text-success" : "text-destructive"}>{difference === 0 ? "matches" : `${difference > 0 ? "over" : "short"} by ${formatINR(Math.abs(difference))}`}</strong>
          </div>
          <Field label="Notes" htmlFor="cd-notes">
            <Textarea id="cd-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. ₹500 short, counted twice" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onDone} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={system.length === 0}><Lock /> Close day</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
