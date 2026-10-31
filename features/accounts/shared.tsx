"use client";
import * as React from "react";
import { Banknote, Landmark } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { accountSummaries, moneyEntries, resolveAccountId } from "@/lib/calculations/ledger";
import { ACCOUNT_KIND_LABELS } from "@/lib/utils/labels";
import { formatINR } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type { MoneyAccount, PaymentMethod } from "@/types";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The cash book and every account's balance, recomputed only when the data changes. */
export function useMoneyBook() {
  const { ds, idx } = useData();
  return React.useMemo(() => {
    const entries = moneyEntries(ds, idx);
    const summaries = accountSummaries(ds.accounts, entries);
    return { entries, summaries, balanceOf: (id: string) => summaries.find((s) => s.account.id === id)?.balancePaise ?? 0 };
  }, [ds, idx]);
}

export function liveAccounts(accounts: readonly MoneyAccount[]): MoneyAccount[] {
  return accounts
    .filter((a) => !a.archived)
    .sort((a, b) => a.kind.localeCompare(b.kind) || Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

/** Account the money for this method lands in when nothing is chosen. */
export function useDefaultAccountId(method: PaymentMethod): string {
  const { ds } = useData();
  return resolveAccountId(ds.accounts, null, method);
}

export function AccountIcon({ account, className }: { account: Pick<MoneyAccount, "kind">; className?: string }) {
  const Icon = account.kind === "cash" ? Banknote : Landmark;
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg",
        account.kind === "cash" ? "bg-success-soft text-success" : "bg-[#eff4ff] text-[#2948b8]",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

export function maskedNumber(n: string): string {
  return n ? `•••• ${n.slice(-4)}` : "";
}

/** Cash and bank accounts with their current balance. `exclude` hides an account (the other side of a transfer). */
export function AccountSelect({
  id,
  value,
  onChange,
  exclude,
  invalid,
  placeholder = "Select account",
}: {
  id: string;
  value: string | null | undefined;
  onChange: (id: string) => void;
  exclude?: string | null;
  invalid?: boolean;
  placeholder?: string;
}) {
  const { ds } = useData();
  const { balanceOf } = useMoneyBook();
  const accounts = liveAccounts(ds.accounts).filter((a) => a.id !== exclude);
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {(["cash", "bank"] as const).map((kind) => {
          const list = accounts.filter((a) => a.kind === kind);
          if (list.length === 0) return null;
          return (
            <SelectGroup key={kind}>
              <SelectLabel>{ACCOUNT_KIND_LABELS[kind]}</SelectLabel>
              {list.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                  <span className="ml-2 text-xs text-muted-foreground tabular">{formatINR(balanceOf(a.id))}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/** Active staff, for "received by" / "paid by" (the cash receiver). */
export function StaffSelect({ id, value, onChange, allowNone = false }: { id: string; value: string | null | undefined; onChange: (id: string | null) => void; allowNone?: boolean }) {
  const { ds } = useData();
  const staff = ds.users.filter((u) => u.status === "active" || u.id === value).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="Select staff member" />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value="none">Nobody in particular</SelectItem>}
        {staff.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name}
            {u.designation && <span className="ml-1.5 text-xs text-muted-foreground">{u.designation}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Green for money in, red for money out. */
export function Amount({ paise, direction, className }: { paise: number; direction?: "in" | "out"; className?: string }) {
  return (
    <span className={cn("tabular", direction === "in" && "text-success", direction === "out" && "text-destructive", className)}>
      {direction === "out" ? "−" : direction === "in" ? "+" : ""}
      {formatINR(paise)}
    </span>
  );
}
