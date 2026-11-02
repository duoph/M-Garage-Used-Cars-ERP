"use client";
import * as React from "react";
import { Controller, useFieldArray, useWatch, type ArrayPath, type Control, type FieldArray, type FieldErrors, type FieldValues, type Path } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { resolveAccountId } from "@/lib/calculations/ledger";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils/labels";
import { formatINR } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type { PaymentLineInput } from "@/lib/validation/schemas";
import type { PaymentMethod } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/shared/currency-input";
import { Field } from "@/components/shared/form-field";
import { SuggestInput } from "@/components/shared/suggest-input";
import { AccountSelect, kindsForMethod } from "./shared";

/** A fresh line for `method`, pointed at that mode's default account for the branch. */
export function useNewLine(branchId: string | null | undefined) {
  const { ds } = useData();
  return React.useCallback(
    (method: PaymentMethod, amountPaise?: number): PaymentLineInput => ({
      method,
      amountPaise: amountPaise as number,
      accountId: method === "finance" ? null : resolveAccountId(ds.accounts, null, method, branchId),
      reference: "",
      lenderName: "",
      loanReference: "",
    }),
    [ds.accounts, branchId],
  );
}

export function sumLines(lines: readonly Partial<PaymentLineInput>[] | undefined): number {
  return (lines ?? []).reduce((s, l) => s + (l.amountPaise ?? 0), 0);
}

const REFERENCE_HINT: Partial<Record<PaymentMethod, string>> = {
  upi: "UPI ref / UTR",
  bank_transfer: "UTR / transaction ID",
  cheque: "Cheque no.",
  card: "Card slip no.",
};

/**
 * The list of payment lines (mode · amount · account · reference) used by sales, "Receive Payment",
 * purchases and refunds. Shows Total, Paid and Balance as lines change; `paidBefore` counts amounts
 * already settled (a booking advance, earlier payments).
 */
export function PaymentLinesEditor<T extends FieldValues>({
  control,
  name,
  errors,
  methods,
  branchId,
  totalPaise,
  paidBefore = 0,
  idPrefix,
  labels = {},
  addLabel = "Add payment",
}: {
  control: Control<T>;
  name: ArrayPath<T>;
  errors?: FieldErrors<T>;
  methods: readonly PaymentMethod[];
  branchId: string | null | undefined;
  /** What the lines settle against (sale total, balance due, refund due). */
  totalPaise: number;
  paidBefore?: number;
  idPrefix: string;
  labels?: { total?: string; paid?: string; balance?: string; account?: string };
  addLabel?: string;
}) {
  const { ds } = useData();
  const { fields, append, remove, update } = useFieldArray({ control, name });
  const lines = (useWatch({ control, name: name as Path<T> }) ?? []) as Partial<PaymentLineInput>[];
  const newLine = useNewLine(branchId);
  const paid = paidBefore + sumLines(lines);
  const balance = totalPaise - paid;
  const lenders = ds.accounts.filter((a) => a.kind === "finance" && !a.archived).map((a) => a.name);
  // `errors.payments` → per-line errors plus an array-level message (e.g. "exceed the sale total").
  const listErrors = (errors as Record<string, unknown> | undefined)?.[name as string] as
    | ({ message?: string; root?: { message?: string } } & Record<number, Partial<Record<keyof PaymentLineInput, { message?: string }>>>)
    | undefined;
  const at = (i: number, key: keyof PaymentLineInput) => `${name}.${i}.${key}` as Path<T>;

  return (
    <div className="grid gap-3">
      {fields.map((f, i) => {
        const line = lines[i] ?? {};
        const method = (line.method ?? "cash") as PaymentMethod;
        const err = listErrors?.[i];
        return (
          <div key={f.id} className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-12">
            <Field label="Mode" htmlFor={`${idPrefix}-m-${i}`} className="sm:col-span-3">
              <Controller
                control={control}
                name={at(i, "method")}
                render={({ field }) => (
                  <Select
                    value={field.value as string}
                    onValueChange={(v) => {
                      // The account follows the mode: cash → cash in hand, UPI/transfer → bank, loan → lender.
                      const next = newLine(v as PaymentMethod, line.amountPaise);
                      update(i, { ...next, reference: line.reference ?? "" } as FieldArray<T, ArrayPath<T>>);
                    }}
                  >
                    <SelectTrigger id={`${idPrefix}-m-${i}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {methods.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Amount" htmlFor={`${idPrefix}-a-${i}`} error={err?.amountPaise?.message} required className="sm:col-span-3">
              <Controller
                control={control}
                name={at(i, "amountPaise")}
                render={({ field }) => (
                  <CurrencyInput id={`${idPrefix}-a-${i}`} value={field.value as number} onChange={(v) => field.onChange(v ?? undefined)} onBlur={field.onBlur} invalid={!!err?.amountPaise} />
                )}
              />
            </Field>
            {method === "finance" ? (
              <>
                <Field label="Lender / finance company" htmlFor={`${idPrefix}-l-${i}`} error={err?.lenderName?.message} required className="sm:col-span-3">
                  <Controller
                    control={control}
                    name={at(i, "lenderName")}
                    render={({ field }) => (
                      <SuggestInput id={`${idPrefix}-l-${i}`} value={(field.value as string) ?? ""} onChange={field.onChange} onBlur={field.onBlur} options={lenders} placeholder="e.g. HDFC Bank" invalid={!!err?.lenderName} />
                    )}
                  />
                </Field>
                <Field label="Loan reference" htmlFor={`${idPrefix}-lr-${i}`} error={err?.loanReference?.message} className="sm:col-span-2">
                  <Controller
                    control={control}
                    name={at(i, "loanReference")}
                    render={({ field }) => <Input id={`${idPrefix}-lr-${i}`} placeholder="Loan / file no." value={(field.value as string) ?? ""} onChange={field.onChange} onBlur={field.onBlur} />}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label={labels.account ?? "Account"} htmlFor={`${idPrefix}-acc-${i}`} error={err?.accountId?.message} required className="sm:col-span-3">
                  <Controller
                    control={control}
                    name={at(i, "accountId")}
                    render={({ field }) => (
                      <AccountSelect id={`${idPrefix}-acc-${i}`} value={(field.value as string) ?? null} onChange={field.onChange} kinds={kindsForMethod(method)} invalid={!!err?.accountId} />
                    )}
                  />
                </Field>
                <Field label="Reference" htmlFor={`${idPrefix}-r-${i}`} error={err?.reference?.message} className="sm:col-span-2">
                  <Controller
                    control={control}
                    name={at(i, "reference")}
                    render={({ field }) => (
                      <Input id={`${idPrefix}-r-${i}`} placeholder={REFERENCE_HINT[method] ?? "Optional"} value={(field.value as string) ?? ""} onChange={field.onChange} onBlur={field.onBlur} />
                    )}
                  />
                </Field>
              </>
            )}
            <div className="flex items-end justify-end sm:col-span-1">
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label={`Remove payment line ${i + 1}`}>
                <Trash2 />
              </Button>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(newLine(fields.length === 0 ? methods[0] : methods.includes("upi") ? "upi" : methods[0], Math.max(0, balance) || undefined) as FieldArray<T, ArrayPath<T>>)}
        >
          <Plus /> {addLabel}
        </Button>
        {(listErrors?.message || listErrors?.root?.message) && (
          <p className="text-xs text-destructive" role="alert">{listErrors?.message ?? listErrors?.root?.message}</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/60 p-3 text-[13px]">
        <div><div className="text-xs text-muted-foreground">{labels.total ?? "Total"}</div><div className="font-semibold tabular">{formatINR(totalPaise)}</div></div>
        <div><div className="text-xs text-muted-foreground">{labels.paid ?? "Paid"}</div><div className="font-semibold tabular">{formatINR(paid)}</div></div>
        <div>
          <div className="text-xs text-muted-foreground">{balance < 0 ? "Over by" : labels.balance ?? "Balance due"}</div>
          <div className={cn("font-semibold tabular", balance < 0 && "text-destructive")}>{formatINR(Math.abs(balance))}</div>
        </div>
      </div>
    </div>
  );
}
