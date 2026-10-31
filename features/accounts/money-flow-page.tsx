"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Ban, Download, MoreHorizontal, Printer, SearchX, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { useDialogStore } from "@/lib/store/dialogs";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import type { EntrySource, MoneyEntry } from "@/lib/calculations/ledger";
import { describeRange, formatDate, inRange, resolvePreset, todayISO, type DateRange } from "@/lib/utils/dates";
import { formatINR, formatINRCompact, sumPaise } from "@/lib/utils/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils/labels";
import { PAYMENT_METHODS, type PaymentMethod } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { FilterBar, ListRow, LoadMore, RowCell, StickyBar, usePagedRows } from "@/components/shared/list";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { exportLedgerCsv } from "./ledger-table";
import { liveAccounts, useMoneyBook } from "./shared";

const SOURCE_LABELS: Record<"in" | "out", Partial<Record<EntrySource, string>>> = {
  in: { sale_payment: "Sale receipts", booking: "Booking advances (car still reserved)", voucher: "Receipt vouchers" },
  out: { purchase_payment: "Paid at car purchase", voucher: "Payment vouchers", expense: "Expenses" },
};

/**
 * Receipts (money in) or Payments (money out): every movement in one register, with totals by mode
 * (cash, UPI, cheque…) and by the staff member who handled the money.
 */
export function MoneyFlowPage({ direction }: { direction: "in" | "out" }) {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const openVoucher = useDialogStore((s) => s.openVoucher);
  const { entries } = useMoneyBook();
  const [range, setRange] = React.useState<DateRange>(resolvePreset("this_month"));
  const [search, setSearch] = React.useState("");
  const [source, setSource] = React.useState<"all" | EntrySource>("all");
  const [method, setMethod] = React.useState<"all" | PaymentMethod>("all");
  const [account, setAccount] = React.useState("all");
  const [toCancel, setToCancel] = React.useState<MoneyEntry | null>(null);
  const isIn = direction === "in";
  const canVoucher = can("accounts.manage");

  const inPeriod = React.useMemo(
    () => entries.filter((e) => e.direction === direction && e.source !== "opening" && !e.transfer && inRange(e.date, range)),
    [entries, direction, range],
  );
  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return inPeriod
      .filter((e) => source === "all" || e.source === source)
      .filter((e) => method === "all" || e.method === method)
      .filter((e) => account === "all" || e.accountId === account)
      .filter((e) => !q || `${e.number} ${e.typeLabel} ${e.party} ${e.particulars}`.toLowerCase().includes(q))
      .slice()
      .reverse();
  }, [inPeriod, search, source, method, account]);
  const paged = usePagedRows(rows, `${search}|${source}|${method}|${account}|${range.from}|${range.to}`);

  const total = sumPaise(inPeriod.map((e) => e.amountPaise));
  const byMethod = PAYMENT_METHODS.map((m) => ({ method: m, amountPaise: sumPaise(inPeriod.filter((e) => e.method === m).map((e) => e.amountPaise)) })).filter((x) => x.amountPaise > 0);
  const cashByStaff = [...new Set(inPeriod.filter((e) => e.method === "cash").map((e) => e.handledBy))]
    .map((id) => ({ id, name: id ? idx.users.get(id)?.name ?? "Unknown" : "Unknown", amountPaise: sumPaise(inPeriod.filter((e) => e.method === "cash" && e.handledBy === id).map((e) => e.amountPaise)) }))
    .sort((a, b) => b.amountPaise - a.amountPaise);
  const accountName = (id: string) => ds.accounts.find((a) => a.id === id)?.name ?? "—";

  function printHref(e: MoneyEntry): string | null {
    if (e.voucherId) return `/voucher/${e.voucherId}`;
    if (e.source === "sale_payment") return `/receipt/${e.key.slice(4)}`;
    return null;
  }

  return (
    <>
      <PageHeader
        title={isIn ? "Receipts" : "Payments"}
        description={isIn ? "Money received: sale receipts, booking advances and receipt vouchers." : "Money paid out: sellers, expenses and payment vouchers."}
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            {can("data.export") && (
              <Button
                variant="outline"
                disabled={rows.length === 0}
                onClick={() => {
                  exportLedgerCsv(`${isIn ? "receipts" : "payments"}-${todayISO()}.csv`, rows.map((entry) => ({ entry })), accountName, (id) => (id ? idx.users.get(id)?.name ?? "" : ""));
                  toast.success(`Exported ${rows.length} entries`);
                }}
              >
                <Download /> Export
              </Button>
            )}
            {(canVoucher || (isIn && can("payments.record"))) && (
              <Button onClick={() => openVoucher({ type: isIn ? "receipt" : "payment" })}>
                {isIn ? <ArrowDownLeft /> : <ArrowUpRight />} {isIn ? "Receive money" : "Pay money"}
              </Button>
            )}
            {!isIn && can("expenses.manage") && (
              <Button variant="outline" onClick={() => useDialogStore.getState().openExpense()}><Wallet /> Expense</Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-4">
        <StatCard label={isIn ? "Total received" : "Total paid"} value={formatINRCompact(total)} tone={isIn ? "success" : "danger"} hint={`${inPeriod.length} ${inPeriod.length === 1 ? "entry" : "entries"} · ${describeRange(range)} · ${formatINR(total)}`} />
        <Card className="p-4">
          <p className="text-[13px] text-muted-foreground">{isIn ? "Received by mode" : "Paid by mode"}</p>
          {byMethod.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing yet in this period.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {byMethod.map((m) => (
                <li key={m.method}>
                  <button
                    type="button"
                    onClick={() => setMethod(method === m.method ? "all" : m.method)}
                    aria-pressed={method === m.method}
                    className="rounded-lg border px-3 py-1.5 text-left transition-colors hover:bg-muted/60 aria-pressed:border-primary aria-pressed:bg-primary-soft/50"
                  >
                    <span className="block text-[11px] text-muted-foreground">{PAYMENT_METHOD_LABELS[m.method]}</span>
                    <span className="text-sm font-semibold tabular">{formatINR(m.amountPaise)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {isIn && cashByStaff.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Cash received by:{" "}
              {cashByStaff.map((s, i) => (
                <React.Fragment key={s.id ?? i}>
                  {i > 0 && " · "}
                  <span className="text-foreground">{s.name}</span> {formatINR(s.amountPaise)}
                </React.Fragment>
              ))}
            </p>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <StickyBar>
          <FilterBar search={<SearchInput value={search} onChange={setSearch} placeholder="Search number, party, car…" className="sm:w-full" size="sm" />}>
            <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
              <SelectTrigger className="h-8 w-[190px]" aria-label="Type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(SOURCE_LABELS[direction]).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger className="h-8 w-[150px]" aria-label="Mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger className="h-8 w-[170px]" aria-label="Account"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {liveAccounts(ds.accounts).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterBar>
        </StickyBar>
        {inPeriod.length === 0 ? (
          <EmptyState
            icon={isIn ? ArrowDownLeft : ArrowUpRight}
            title={isIn ? "No money received in this period" : "No payments in this period"}
            description="Try a wider date range."
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title="Nothing matches these filters" />
        ) : (
          <>
            <ul className="divide-y">
              {paged.visible.map((e) => {
                const print = printHref(e);
                const staff = e.handledBy ? idx.users.get(e.handledBy)?.name : undefined;
                const modeBadge = e.method && <Badge tone={e.method === "cash" ? "success" : "info"}>{PAYMENT_METHOD_LABELS[e.method]}</Badge>;
                const amount = <span className={`text-sm font-semibold tabular ${isIn ? "text-success" : "text-destructive"}`}>{formatINR(e.amountPaise)}</span>;
                return (
                  <ListRow
                    key={e.key}
                    href={e.href ?? undefined}
                    title={<>{e.typeLabel}{e.party && <span className="font-normal text-muted-foreground"> · {e.party}</span>}</>}
                    subtitle={<>{formatDate(e.date)} · <span className="font-mono">{e.number}</span>{e.particulars && <> · {e.particulars}</>}</>}
                    mobile={<>{amount}{modeBadge}</>}
                    aside={
                      <>
                        <RowCell from="md" className="w-24 text-right">{modeBadge}</RowCell>
                        <RowCell from="lg" className="w-36 truncate text-right text-xs text-muted-foreground" title={accountName(e.accountId)}>{accountName(e.accountId)}</RowCell>
                        <RowCell from="xl" className="w-28 truncate text-right text-xs text-muted-foreground">{staff ?? ""}</RowCell>
                        <RowCell className="w-28 text-right">{amount}</RowCell>
                      </>
                    }
                    action={
                      (print || (e.voucherId && canVoucher)) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${e.number}`}><MoreHorizontal /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {print && (
                              <DropdownMenuItem asChild>
                                <Link href={print} target="_blank"><Printer /> Print {e.voucherId ? "voucher" : "receipt"}</Link>
                              </DropdownMenuItem>
                            )}
                            {e.voucherId && canVoucher && (
                              <DropdownMenuItem variant="destructive" onSelect={() => setToCancel(e)}><Ban /> Cancel voucher</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )
                    }
                  />
                );
              })}
            </ul>
            <LoadMore shown={paged.visible.length} total={paged.total} hasMore={paged.hasMore} onLoadMore={paged.loadMore} />
          </>
        )}
      </Card>
      {!isIn && (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Where payments come from</CardTitle>
              <CardDescription>
                Car purchases record what was paid on the day; later seller payments are payment vouchers. Rent, salaries and repairs are{" "}
                <Link href="/expenses" className="text-primary hover:underline">expenses</Link>.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      <ConfirmDialog
        open={!!toCancel}
        onOpenChange={(o) => !o && setToCancel(null)}
        title={`Cancel voucher ${toCancel?.number ?? ""}?`}
        description={toCancel && <>The {formatINR(toCancel.amountPaise)} entry is reversed out of the cash book. The voucher is kept, marked cancelled.</>}
        confirmLabel="Cancel voucher"
        tone="destructive"
        requireReason
        reasonPlaceholder="e.g. Entered twice by mistake"
        onConfirm={async (reason) => {
          if (!toCancel?.voucherId) return;
          try {
            await dealerService.cancelVoucher(user, toCancel.voucherId, reason);
            toast.success("Voucher cancelled");
          } catch (err) {
            reportError(err);
            return false;
          }
        }}
      />
    </>
  );
}
