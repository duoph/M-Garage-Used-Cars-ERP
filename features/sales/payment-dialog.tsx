"use client";
import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { makePaymentSchema, type PaymentInput } from "@/lib/validation/schemas";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { useCurrentUser } from "@/hooks/use-auth";
import { PAYMENT_METHODS, type Sale } from "@/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils/labels";
import { todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";
import { CurrencyInput } from "@/components/shared/currency-input";
import { DateField } from "@/components/shared/date-field";

export function PaymentDialog({
  sale,
  balancePaise,
  open,
  onOpenChange,
  onRecorded,
}: {
  sale: Sale;
  balancePaise: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRecorded?: (paymentId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <PaymentForm sale={sale} balancePaise={balancePaise} onDone={() => onOpenChange(false)} onRecorded={onRecorded} />}
    </Dialog>
  );
}

function PaymentForm({ sale, balancePaise, onDone, onRecorded }: { sale: Sale; balancePaise: number; onDone: () => void; onRecorded?: (id: string) => void }) {
  const user = useCurrentUser();
  const form = useForm<PaymentInput>({
    resolver: zodResolver(makePaymentSchema(balancePaise)),
    defaultValues: { amountPaise: balancePaise, date: todayISO(), method: "bank_transfer", reference: "", notes: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const amount = useWatch({ control: form.control, name: "amountPaise" }) ?? 0;

  async function onSubmit(values: PaymentInput) {
    try {
      const id = await dealerService.recordPayment(user, sale.id, values);
      toast.success(`Payment of ${formatINR(values.amountPaise)} recorded`);
      onRecorded?.(id);
      onDone();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <DialogContent>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {sale.reference} · Outstanding balance <strong className="text-foreground">{formatINR(balancePaise)}</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Amount received"
            htmlFor="pay-amount"
            error={errors.amountPaise?.message}
            required
            hint={amount > 0 && amount <= balancePaise ? `Balance after this payment: ${formatINR(balancePaise - amount)}` : undefined}
            className="sm:col-span-2"
          >
            <Controller control={form.control} name="amountPaise" render={({ field }) => (
              <CurrencyInput id="pay-amount" value={field.value} onChange={(v) => field.onChange(v ?? undefined)} onBlur={field.onBlur} invalid={!!errors.amountPaise} />
            )} />
          </Field>
          <Field label="Payment date" htmlFor="pay-date" error={errors.date?.message} required>
            <DateField id="pay-date" max={todayISO()} min={sale.saleDate} invalid={!!errors.date} {...form.register("date")} />
          </Field>
          <Field label="Payment method" htmlFor="pay-method">
            <Controller control={form.control} name="method" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="pay-method"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </Field>
          <Field label="Payment reference" htmlFor="pay-ref" error={errors.reference?.message} className="sm:col-span-2">
            <Input id="pay-ref" placeholder="UTR / UPI / cheque no." {...form.register("reference")} />
          </Field>
          <Field label="Notes" htmlFor="pay-notes" className="sm:col-span-2">
            <Textarea id="pay-notes" rows={2} {...form.register("notes")} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>Record payment</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
