"use client";
import * as React from "react";
import { Banknote, HandCoins, Landmark, UserRound } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { accountSummaries, resolveAccountId } from "@/lib/calculations/ledger";
import { useSessionStore } from "@/lib/store/session";
import { ACCOUNT_KIND_LABELS } from "@/lib/utils/labels";
import { formatINR } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type { AccountKind, MoneyAccount, PaymentMethod } from "@/types";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The stored ledger and every account's balance, recomputed only when the data changes. */
export function useMoneyBook() {
  const { ds } = useData();
  return React.useMemo(() => {
    const entries = ds.ledger;
    const summaries = accountSummaries(ds.accounts, entries);
    return { entries, summaries, balanceOf: (id: string) => summaries.find((s) => s.account.id === id)?.balancePaise ?? 0 };
  }, [ds]);
}

const KIND_ORDER: AccountKind[] = ["cash", "bank", "owner", "finance"];

export function liveAccounts(accounts: readonly MoneyAccount[]): MoneyAccount[] {
  return accounts
    .filter((a) => !a.archived)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

/** Account the money for this method lands in when nothing is chosen (cash → this branch's cash in hand). */
export function useDefaultAccountId(method: PaymentMethod, branchId?: string | null): string {
  const { ds } = useData();
  const user = useSessionUser();
  return resolveAccountId(ds.accounts, null, method, branchId ?? user?.branchId);
}

function useSessionUser() {
  const { ds } = useData();
  const userId = useSessionStore((s) => s.userId);
  return ds.users.find((u) => u.id === userId);
}

/** Kinds of account a payment mode moves money through. */
export function kindsForMethod(method: PaymentMethod): AccountKind[] {
  return method === "cash" ? ["cash"] : method === "finance" ? ["finance"] : ["bank"];
}

const KIND_ICON: Record<AccountKind, { icon: typeof Banknote; className: string }> = {
  cash: { icon: Banknote, className: "bg-success-soft text-success" },
  bank: { icon: Landmark, className: "bg-[#eff4ff] text-[#2948b8]" },
  owner: { icon: UserRound, className: "bg-warning-soft text-warning" },
  finance: { icon: HandCoins, className: "bg-[#f4f3ff] text-[#5925dc]" },
};

export function AccountIcon({ account, className }: { account: Pick<MoneyAccount, "kind">; className?: string }) {
  const { icon: Icon, className: tone } = KIND_ICON[account.kind];
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tone, className)}>
      <Icon className="size-4" />
    </span>
  );
}

export function maskedNumber(n: string): string {
  return n ? `•••• ${n.slice(-4)}` : "";
}

/** "Cash in hand · Kochi" / "HDFC •••• 4521" — what a person needs to tell accounts apart. */
export function accountLabel(account: MoneyAccount, branches: readonly { id: string; name: string }[]): string {
  if (account.kind === "cash") {
    const branch = branches.find((b) => b.id === account.branchId)?.name;
    return branch && !account.name.includes(branch) ? `${account.name} · ${branch}` : account.name;
  }
  if (account.kind === "bank" && account.accountNumber) return `${account.name} ${maskedNumber(account.accountNumber)}`;
  return account.name;
}

/**
 * Accounts with their current balance, grouped by kind. `kinds` limits the choice (e.g. only cash or bank
 * for an expense); `exclude` hides an account (the other side of a transfer); `everyBranch` lists other
 * branches' cash too.
 */
export function AccountSelect({
  id,
  value,
  onChange,
  exclude,
  invalid,
  kinds = ["cash", "bank"],
  everyBranch = false,
  placeholder = "Select account",
}: {
  id: string;
  value: string | null | undefined;
  onChange: (id: string) => void;
  exclude?: string | null;
  invalid?: boolean;
  kinds?: readonly AccountKind[];
  everyBranch?: boolean;
  placeholder?: string;
}) {
  const { ds, allAccounts } = useData();
  const { balanceOf } = useMoneyBook();
  const accounts = liveAccounts(everyBranch ? allAccounts : ds.accounts).filter((a) => a.id !== exclude && kinds.includes(a.kind));
  const visible = new Set(ds.accounts.map((a) => a.id));
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {KIND_ORDER.filter((k) => kinds.includes(k)).map((kind) => {
          const list = accounts.filter((a) => a.kind === kind);
          if (list.length === 0) return null;
          return (
            <SelectGroup key={kind}>
              <SelectLabel>{ACCOUNT_KIND_LABELS[kind]}</SelectLabel>
              {list.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {accountLabel(a, ds.branches)}
                  {visible.has(a.id) && <span className="ml-2 text-xs text-muted-foreground tabular">{formatINR(balanceOf(a.id))}</span>}
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
