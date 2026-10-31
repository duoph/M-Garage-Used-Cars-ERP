"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Download, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { useDialogStore } from "@/lib/store/dialogs";
import { runningLedger } from "@/lib/calculations/ledger";
import { describeRange, resolvePreset, todayISO, type DateRange } from "@/lib/utils/dates";
import { formatINR, formatINRCompact, sumPaise } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type { MoneyAccount } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { AccountDialog } from "./account-dialog";
import { AccountIcon, maskedNumber, useMoneyBook } from "./shared";
import { LedgerTable, exportLedgerCsv } from "./ledger-table";

/** Quick money actions shown on every accounts screen. */
export function MoneyActions() {
  const { can } = useAuth();
  const openVoucher = useDialogStore((s) => s.openVoucher);
  if (!can("accounts.manage")) return null;
  return (
    <>
      <Button variant="outline" onClick={() => openVoucher({ type: "contra" })}><ArrowLeftRight /> <span className="hidden sm:inline">Transfer</span></Button>
      <Button variant="outline" onClick={() => openVoucher({ type: "payment" })}><ArrowUpRight className="text-destructive" /> Pay</Button>
      <Button onClick={() => openVoucher({ type: "receipt" })}><ArrowDownLeft /> Receive</Button>
    </>
  );
}

export function CashBankPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { entries, summaries } = useMoneyBook();
  const [range, setRange] = React.useState<DateRange>(resolvePreset("this_month"));
  const [editing, setEditing] = React.useState<{ account?: MoneyAccount; kind: MoneyAccount["kind"] } | null>(null);
  const selected = params.get("account") ?? "all";
  const canManage = can("accounts.manage");

  const visible = summaries.filter((s) => !s.account.archived || s.balancePaise !== 0 || s.account.id === selected);
  const cash = sumPaise(summaries.filter((s) => s.account.kind === "cash").map((s) => s.balancePaise));
  const bank = sumPaise(summaries.filter((s) => s.account.kind === "bank").map((s) => s.balancePaise));
  const today = todayISO();
  const todayEntries = entries.filter((e) => e.date === today && e.source !== "opening" && !e.transfer);
  const todayIn = sumPaise(todayEntries.filter((e) => e.direction === "in").map((e) => e.amountPaise));
  const todayOut = sumPaise(todayEntries.filter((e) => e.direction === "out").map((e) => e.amountPaise));

  const ledger = React.useMemo(
    () => runningLedger(selected === "all" ? entries.filter((e) => !e.transfer) : entries, range, selected === "all" ? undefined : selected),
    [entries, range, selected],
  );
  const current = summaries.find((s) => s.account.id === selected)?.account;

  function select(id: string) {
    router.replace(id === "all" ? "/accounts" : `/accounts?account=${id}`, { scroll: false });
  }

  return (
    <>
      <PageHeader title="Cash & Bank" description="Every rupee in the cash drawer and the bank, with a running cash book." actions={<MoneyActions />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Cash in hand" value={formatINRCompact(cash)} tone={cash < 0 ? "danger" : "neutral"} hint={formatINR(cash)} />
        <StatCard label="In bank" value={formatINRCompact(bank)} tone={bank < 0 ? "danger" : "neutral"} hint={formatINR(bank)} />
        <StatCard label="Received today" value={formatINRCompact(todayIn)} tone="success" hint={`${todayEntries.filter((e) => e.direction === "in").length} entries`} />
        <StatCard label="Paid today" value={formatINRCompact(todayOut)} tone={todayOut ? "danger" : "neutral"} hint={`${todayEntries.filter((e) => e.direction === "out").length} entries`} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Accounts</h2>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Plus /> Add account</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing({ kind: "bank" })}>Bank account</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditing({ kind: "cash" })}>Cash account / cash receiver</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AccountTile
          active={selected === "all"}
          onClick={() => select("all")}
          title="All accounts"
          subtitle={`${summaries.filter((s) => !s.account.archived).length} accounts`}
          balance={cash + bank}
        />
        {visible.map((s) => {
          const custodian = s.account.custodianId ? idx.users.get(s.account.custodianId)?.name : undefined;
          return (
            <AccountTile
              key={s.account.id}
              active={selected === s.account.id}
              onClick={() => select(s.account.id)}
              account={s.account}
              title={s.account.name}
              subtitle={
                s.account.kind === "bank"
                  ? [s.account.bankName, maskedNumber(s.account.accountNumber)].filter(Boolean).join(" · ") || "Bank account"
                  : custodian ? `Held by ${custodian}` : "Cash"
              }
              balance={s.balancePaise}
              onEdit={canManage ? () => setEditing({ account: s.account, kind: s.account.kind }) : undefined}
            />
          );
        })}
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-wrap gap-2">
          <div>
            <CardTitle>{current ? `${current.name} — ledger` : "Cash book — all accounts"}</CardTitle>
            <CardDescription>
              {describeRange(range)} · in {formatINR(ledger.inPaise)} · out {formatINR(ledger.outPaise)}
              {selected === "all" && " · transfers between accounts are hidden"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <DateRangePicker value={range} onChange={setRange} size="sm" />
            {can("data.export") && (
              <Button
                variant="outline"
                size="sm"
                disabled={ledger.rows.length === 0}
                onClick={() => {
                  exportLedgerCsv(
                    `cash-book-${current?.name.replace(/\W+/g, "-").toLowerCase() ?? "all"}-${today}.csv`,
                    ledger.rows,
                    (id) => ds.accounts.find((a) => a.id === id)?.name ?? "",
                    (id) => (id ? idx.users.get(id)?.name ?? "" : ""),
                  );
                  toast.success("Cash book exported");
                }}
              >
                <Download /> CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <LedgerTable rows={ledger.rows} openingPaise={ledger.openingPaise} closingPaise={ledger.closingPaise} showAccount={selected === "all"} />
      </Card>

      {editing && <AccountDialog open onOpenChange={(o) => !o && setEditing(null)} account={editing.account} kind={editing.kind} />}
    </>
  );
}

function AccountTile({
  active,
  onClick,
  account,
  title,
  subtitle,
  balance,
  onEdit,
}: {
  active: boolean;
  onClick: () => void;
  account?: MoneyAccount;
  title: string;
  subtitle: string;
  balance: number;
  onEdit?: () => void;
}) {
  return (
    <Card className={cn("relative flex items-center gap-3 p-3.5 transition-colors", active ? "border-primary ring-1 ring-primary/30" : "hover:border-foreground/15")}>
      {account ? <AccountIcon account={account} /> : <AccountIcon account={{ kind: "bank" }} className="bg-primary-soft text-primary" />}
      <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']" aria-pressed={active}>
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{title}</span>
          {account?.isDefault && <Badge tone="brand" className="px-1.5 py-0 text-[10px]">Default</Badge>}
          {account?.archived && <Badge className="px-1.5 py-0 text-[10px]">Archived</Badge>}
        </div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        <div className={cn("mt-1 text-lg font-semibold tabular", balance < 0 && "text-destructive")}>{formatINR(balance)}</div>
      </button>
      {onEdit && (
        <Button variant="ghost" size="icon-sm" className="relative z-10 self-start" onClick={onEdit} aria-label={`Edit ${title}`}>
          <Pencil />
        </Button>
      )}
    </Card>
  );
}
