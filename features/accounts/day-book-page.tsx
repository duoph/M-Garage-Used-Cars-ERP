"use client";
import * as React from "react";
import { addDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { accountSummaries } from "@/lib/calculations/ledger";
import { formatDate, todayISO } from "@/lib/utils/dates";
import { formatINR, sumPaise } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { DateField } from "@/components/shared/date-field";
import { StatCard } from "@/components/shared/stat-card";
import { LedgerTable, exportLedgerCsv } from "./ledger-table";
import { MoneyActions } from "./cash-bank-page";
import { useMoneyBook } from "./shared";

const shift = (d: string, days: number) => format(addDays(parseISO(d), days), "yyyy-MM-dd");

/** Everything that happened on one day, across every cash and bank account. */
export function DayBookPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const { entries } = useMoneyBook();
  const [day, setDay] = React.useState(todayISO());
  const today = todayISO();

  const rows = entries.filter((e) => e.date === day && e.source !== "opening").map((entry) => ({ entry }));
  const real = rows.filter((r) => !r.entry.transfer);
  const inPaise = sumPaise(real.filter((r) => r.entry.direction === "in").map((r) => r.entry.amountPaise));
  const outPaise = sumPaise(real.filter((r) => r.entry.direction === "out").map((r) => r.entry.amountPaise));
  const closing = accountSummaries(ds.accounts, entries, day);
  const cash = sumPaise(closing.filter((s) => s.account.kind === "cash").map((s) => s.balancePaise));
  const bank = sumPaise(closing.filter((s) => s.account.kind === "bank").map((s) => s.balancePaise));

  return (
    <>
      <PageHeader title="Day Book" description="Every receipt, payment, expense and transfer for a day." actions={<MoneyActions />} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setDay(shift(day, -1))} aria-label="Previous day"><ChevronLeft /></Button>
        <DateField value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-44" aria-label="Day" />
        <Button variant="outline" size="icon" onClick={() => setDay(shift(day, 1))} disabled={day >= today} aria-label="Next day"><ChevronRight /></Button>
        {day !== today && <Button variant="ghost" onClick={() => setDay(today)}>Today</Button>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Money in" value={formatINR(inPaise)} tone="success" hint={`${real.filter((r) => r.entry.direction === "in").length} entries`} />
        <StatCard label="Money out" value={formatINR(outPaise)} tone={outPaise ? "danger" : "neutral"} hint={`${real.filter((r) => r.entry.direction === "out").length} entries`} />
        <StatCard label="Cash at day end" value={formatINR(cash)} tone={cash < 0 ? "danger" : "neutral"} />
        <StatCard label="Bank at day end" value={formatINR(bank)} tone={bank < 0 ? "danger" : "neutral"} />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>{formatDate(day, "EEEE, dd MMM yyyy")}</CardTitle>
            <CardDescription>Net {formatINR(inPaise - outPaise)}{rows.length !== real.length && " · includes transfers between accounts"}</CardDescription>
          </div>
          {can("data.export") && (
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length === 0}
              onClick={() => {
                exportLedgerCsv(`day-book-${day}.csv`, rows, (id) => ds.accounts.find((a) => a.id === id)?.name ?? "", (id) => (id ? idx.users.get(id)?.name ?? "" : ""));
                toast.success("Day book exported");
              }}
            >
              <Download /> CSV
            </Button>
          )}
        </CardHeader>
        <LedgerTable rows={rows} showAccount emptyText="Nothing was received or paid on this day." />
      </Card>
    </>
  );
}
