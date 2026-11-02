"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useCurrentUser } from "@/hooks/use-auth";
import { reportError } from "@/hooks/use-commands";
import { dealerService } from "@/lib/services/dealer-service";
import { REFUND_METHODS, salesReturnSchema, type SalesReturnInput } from "@/lib/validation/schemas";
import { financePending } from "@/lib/calculations/finance";
import { returnable, salesReturnEffect } from "@/lib/calculations/returns";
import { todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { vehicleTitle } from "@/lib/utils/labels";
import type { Sale } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";
import { CurrencyInput } from "@/components/shared/currency-input";
import { DateField } from "@/components/shared/date-field";
import { PaymentLinesEditor, sumLines } from "@/features/accounts/payment-lines";

/** Records a sales return (credit note) on a completed sale, with refunds paid now. */
export function SalesReturnDialog({ sale, open, onOpenChange }: { sale: Sale; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <SalesReturnForm sale={sale} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function SalesReturnForm({ sale, onDone }: { sale: Sale; onDone: () => void }) {
  const { idx } = useData();
  const user = useCurrentUser();
  const router = useRouter();
  const payments = idx.paymentsBySale.get(sale.id) ?? [];
  const loans = payments.filter((p) => financePending(p) > 0);
  const limit = returnable(sale.salePricePaise, idx.salesReturnsBySale.get(sale.id) ?? []);
  const vehicle = idx.vehicles.get(sale.vehicleId);
  const customer = idx.customers.get(sale.customerId);

  const form = useForm<SalesReturnInput>({
    resolver: zodResolver(salesReturnSchema),
    defaultValues: {
      saleId: sale.id,
      date: todayISO(),
      returnAmountPaise: limit,
      deductionPaise: 0,
      vehicleReturned: sale.returnStatus !== "returned",
      // A pending loan is cancelled with the lender before anything is refunded to the buyer.
      financePaymentId: loans[0]?.id ?? null,
      financeAdjustmentPaise: Math.min(loans[0] ? financePending(loans[0]) : 0, limit),
      reason: "",
      notes: "",
      refunds: [],
    },
  });
  const { errors, isSubmitting } = form.formState;
  const v = useWatch({ control: form.control }) as SalesReturnInput;
  const loan = loans.find((l) => l.id === v.financePaymentId);
  const effect = salesReturnEffect(sale, payments, {
    returnAmountPaise: v.returnAmountPaise ?? 0,
    deductionPaise: v.deductionPaise ?? 0,
    financeAdjustmentPaise: loan ? v.financeAdjustmentPaise ?? 0 : 0,
    vehicleReturned: v.vehicleReturned,
  });
  const refunding = sumLines(v.refunds);

  // Keep the loan adjustment within what the return is worth after deductions.
  const net = Math.max(0, (v.returnAmountPaise ?? 0) - (v.deductionPaise ?? 0));

  async function onSubmit(values: SalesReturnInput) {
    try {
      const id = await dealerService.createSalesReturn(user, { ...values, financeAdjustmentPaise: loan ? values.financeAdjustmentPaise : 0, financePaymentId: loan ? values.financePaymentId : null });
      toast.success(values.vehicleReturned ? "Sales return recorded; car is back for inspection" : "Sales return recorded");
      onDone();
      router.push(`/sales/returns/${id}`);
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <DialogContent className="sm:max-w-3xl">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>Sales return</DialogTitle>
          <DialogDescription>
            {sale.reference} · {customer?.name} · {vehicle ? `${vehicle.year} ${vehicleTitle(vehicle)} ${vehicle.registrationNumber}` : ""} · up to <strong className="text-foreground">{formatINR(limit)}</strong> can be returned
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Return date" htmlFor="sr-date" error={errors.date?.message} required>
            <DateField id="sr-date" max={todayISO()} min={sale.saleDate} invalid={!!errors.date} {...form.register("date")} />
          </Field>
          <Field label="Car returned to the showroom" htmlFor="sr-vehicle" hint={v.vehicleReturned ? "It goes back into stock as Returned – Inspection." : "Price adjustment only; the buyer keeps the car."}>
            <Controller control={form.control} name="vehicleReturned" render={({ field }) => (
              <div className="flex h-9 items-center"><Switch id="sr-vehicle" checked={field.value} onCheckedChange={field.onChange} /></div>
            )} />
          </Field>
          <Field label="Return amount" htmlFor="sr-amount" error={errors.returnAmountPaise?.message} required hint="Value credited back on this return.">
            <Controller control={form.control} name="returnAmountPaise" render={({ field }) => (
              <CurrencyInput id="sr-amount" value={field.value} onChange={(x) => field.onChange(x ?? undefined)} onBlur={field.onBlur} invalid={!!errors.returnAmountPaise} />
            )} />
          </Field>
          <Field label="Deduction / charges" htmlFor="sr-deduction" error={errors.deductionPaise?.message} hint="Kept by the showroom (usage, damage, paperwork).">
            <Controller control={form.control} name="deductionPaise" render={({ field }) => (
              <CurrencyInput id="sr-deduction" value={field.value} onChange={(x) => field.onChange(x ?? 0)} onBlur={field.onBlur} invalid={!!errors.deductionPaise} />
            )} />
          </Field>
          {loans.length > 0 && (
            <>
              <Field label="Loan to adjust" htmlFor="sr-loan" error={errors.financePaymentId?.message} hint="The lender hasn't paid this yet; cancel part or all of it instead of refunding the buyer.">
                <Controller control={form.control} name="financePaymentId" render={({ field }) => (
                  <Select value={field.value ?? "none"} onValueChange={(x) => field.onChange(x === "none" ? null : x)}>
                    <SelectTrigger id="sr-loan"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Don&apos;t adjust a loan</SelectItem>
                      {loans.map((l) => <SelectItem key={l.id} value={l.id}>{l.lenderName} · {formatINR(financePending(l))} pending</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </Field>
              <Field label="Loan adjustment" htmlFor="sr-adj" error={errors.financeAdjustmentPaise?.message} hint={loan ? `Up to ${formatINR(Math.min(financePending(loan), net))}` : undefined}>
                <Controller control={form.control} name="financeAdjustmentPaise" render={({ field }) => (
                  <CurrencyInput id="sr-adj" value={field.value} onChange={(x) => field.onChange(x ?? 0)} onBlur={field.onBlur} disabled={!loan} invalid={!!errors.financeAdjustmentPaise} />
                )} />
              </Field>
            </>
          )}
          <Field label="Reason" htmlFor="sr-reason" error={errors.reason?.message} required className="sm:col-span-2">
            <Input id="sr-reason" placeholder="e.g. Buyer cancelled after test drive" aria-invalid={!!errors.reason} {...form.register("reason")} />
          </Field>
          <div className="sm:col-span-2">
            <h3 className="mb-1 text-[13px] font-medium">Refund to buyer</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {effect.refundDuePaise > 0
                ? "Pay it now from cash or a bank account, or leave it as a refund due and pay it later from the return."
                : effect.balanceAfterPaise > 0
                  ? `Nothing to refund: the buyer still owes ${formatINR(effect.balanceAfterPaise)} after this return.`
                  : "Nothing to refund on this return."}
            </p>
            <PaymentLinesEditor
              control={form.control}
              name="refunds"
              errors={errors}
              methods={REFUND_METHODS}
              branchId={sale.branchId}
              totalPaise={effect.refundDuePaise}
              idPrefix="sr-ref"
              addLabel="Add refund"
              labels={{ total: "Refund due", paid: "Refunding now", balance: refunding < effect.refundDuePaise ? "Stays as refund due" : "Refund due", account: "Paid from" }}
            />
          </div>
          <Field label="Notes" htmlFor="sr-notes" className="sm:col-span-2">
            <Textarea id="sr-notes" rows={2} {...form.register("notes")} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>Record return</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
