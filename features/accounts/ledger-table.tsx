"use client";
import * as React from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import type { MoneyEntry } from "@/lib/calculations/ledger";
import { formatDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils/labels";
import { csvRupees, downloadCsv } from "@/lib/utils/csv";
import { cn } from "@/lib/utils/cn";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";

export interface LedgerRow {
  entry: MoneyEntry;
  /** Running balance after this row; omitted in multi-account views like the day book. */
  balancePaise?: number;
}

/**
 * Debit/credit style cash book table. Opening and closing rows appear when an opening balance is given.
 * On phones the money columns collapse into one signed amount.
 */
export function LedgerTable({
  rows,
  openingPaise,
  closingPaise,
  showAccount = false,
  emptyText = "No money moved in this period.",
}: {
  rows: LedgerRow[];
  openingPaise?: number;
  closingPaise?: number;
  showAccount?: boolean;
  emptyText?: string;
}) {
  const { ds, idx } = useData();
  const accountName = (id: string) => ds.accounts.find((a) => a.id === id)?.name ?? "—";
  const withBalance = openingPaise !== undefined;
  const inTotal = rows.reduce((s, r) => s + (r.entry.direction === "in" ? r.entry.amountPaise : 0), 0);
  const outTotal = rows.reduce((s, r) => s + (r.entry.direction === "out" ? r.entry.amountPaise : 0), 0);

  if (rows.length === 0 && !withBalance) return <EmptyState icon={BookOpen} title={emptyText} className="py-10" />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-24">Date</TableHead>
          <TableHead>Particulars</TableHead>
          {showAccount && <TableHead className="hidden lg:table-cell">Account</TableHead>}
          <TableHead className="hidden text-right sm:table-cell">Money in</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Money out</TableHead>
          <TableHead className="text-right sm:hidden">Amount</TableHead>
          {withBalance && <TableHead className="hidden text-right md:table-cell">Balance</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {withBalance && (
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableCell />
            <TableCell className="font-medium">Opening balance</TableCell>
            {showAccount && <TableCell className="hidden lg:table-cell" />}
            <TableCell className="hidden sm:table-cell" />
            <TableCell className="hidden sm:table-cell" />
            <TableCell className="text-right tabular sm:hidden">{formatINR(openingPaise)}</TableCell>
            <TableCell className="hidden text-right font-medium tabular md:table-cell">{formatINR(openingPaise)}</TableCell>
          </TableRow>
        )}
        {rows.map(({ entry: e, balancePaise }) => {
          const staff = e.handledBy ? idx.users.get(e.handledBy)?.name : undefined;
          return (
            <TableRow key={e.key}>
              <TableCell className="align-top text-xs whitespace-nowrap text-muted-foreground tabular">{formatDate(e.date)}</TableCell>
              <TableCell className="max-w-0 align-top">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{e.typeLabel}</span>
                  {e.party && <span className="truncate text-muted-foreground">{e.party}</span>}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {e.href ? <Link href={e.href} className="font-mono hover:text-foreground hover:underline">{e.number}</Link> : <span className="font-mono">{e.number}</span>}
                  {e.method && <> · {PAYMENT_METHOD_LABELS[e.method]}</>}
                  {staff && <> · by {staff}</>}
                  {e.particulars && <> · {e.particulars}</>}
                  {showAccount && <span className="lg:hidden"> · {accountName(e.accountId)}</span>}
                </div>
              </TableCell>
              {showAccount && <TableCell className="hidden align-top text-xs text-muted-foreground lg:table-cell">{accountName(e.accountId)}</TableCell>}
              <TableCell className="hidden text-right align-top text-success tabular sm:table-cell">{e.direction === "in" ? formatINR(e.amountPaise) : ""}</TableCell>
              <TableCell className="hidden text-right align-top text-destructive tabular sm:table-cell">{e.direction === "out" ? formatINR(e.amountPaise) : ""}</TableCell>
              <TableCell className={cn("text-right align-top tabular sm:hidden", e.direction === "in" ? "text-success" : "text-destructive")}>
                {e.direction === "in" ? "+" : "−"}
                {formatINR(e.amountPaise)}
              </TableCell>
              {withBalance && (
                <TableCell className={cn("hidden text-right align-top tabular md:table-cell", (balancePaise ?? 0) < 0 && "text-destructive")}>
                  {formatINR(balancePaise ?? 0)}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell />
          <TableCell>{withBalance ? "Closing balance" : `Total · ${rows.length} entries`}</TableCell>
          {showAccount && <TableCell className="hidden lg:table-cell" />}
          <TableCell className="hidden text-right text-success tabular sm:table-cell">{formatINR(inTotal)}</TableCell>
          <TableCell className="hidden text-right text-destructive tabular sm:table-cell">{formatINR(outTotal)}</TableCell>
          <TableCell className="text-right tabular sm:hidden">{formatINR(withBalance ? closingPaise ?? 0 : inTotal - outTotal)}</TableCell>
          {withBalance && <TableCell className="hidden text-right tabular md:table-cell">{formatINR(closingPaise ?? 0)}</TableCell>}
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function exportLedgerCsv(filename: string, rows: LedgerRow[], accountName: (id: string) => string, staffName: (id: string | null) => string) {
  downloadCsv(filename, rows, [
    { header: "Date", value: (r) => r.entry.date },
    { header: "Number", value: (r) => r.entry.number },
    { header: "Type", value: (r) => r.entry.typeLabel },
    { header: "Party", value: (r) => r.entry.party },
    { header: "Particulars", value: (r) => r.entry.particulars },
    { header: "Account", value: (r) => accountName(r.entry.accountId) },
    { header: "Mode", value: (r) => (r.entry.method ? PAYMENT_METHOD_LABELS[r.entry.method] : "") },
    { header: "Handled by", value: (r) => staffName(r.entry.handledBy) },
    { header: "Money in (INR)", value: (r) => (r.entry.direction === "in" ? csvRupees(r.entry.amountPaise) : "") },
    { header: "Money out (INR)", value: (r) => (r.entry.direction === "out" ? csvRupees(r.entry.amountPaise) : "") },
    { header: "Balance (INR)", value: (r) => (r.balancePaise === undefined ? "" : csvRupees(r.balancePaise)) },
  ]);
}
