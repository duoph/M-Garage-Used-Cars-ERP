"use client";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { settleFinanceSchema, type SettleFinanceInput } from "@/lib/validation/schemas";
import { financePending } from "@/lib/calculations/finance";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { useCurrentUser } from "@/hooks/use-auth";
import { todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type { SalePayment } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";
import { DateField } from "@/components/shared/date-field";
import { AccountSelect, useDefaultAccountId } from "@/features/accounts/shared";

/** The lender paid a financed sale's loan: it moves from "due from lender" into a bank account. */
export function FinanceSettleDialog({ payment, open, onOpenChange }: { payment: SalePayment; open: boolean; onOpenChange: (o: boolean) => void }) {
  const user = useCurrentUser();
  const bank = useDefaultAccountId("bank_transfer");
  const pending = financePending(payment);
  const form = useForm<SettleFinanceInput>({
    resolver: zodResolver(settleFinanceSchema),
    defaultValues: { date: todayISO(), accountId: bank, reference: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: SettleFinanceInput) {
    try {
      await dealerService.settleFinance(user, payment.id, values);
      toast.success(`${formatINR(pending)} loan received from ${payment.lenderName || "lender"}`);
      onOpenChange(false);
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>Loan received</DialogTitle>
            <DialogDescription>
              {payment.lenderName}{payment.loanReference ? ` · ${payment.loanReference}` : ""} · <strong className="text-foreground">{formatINR(pending)}</strong> pending
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Received on" htmlFor="fin-date" error={errors.date?.message} required>
              <DateField id="fin-date" max={todayISO()} min={payment.date} invalid={!!errors.date} {...form.register("date")} />
            </Field>
            <Field label="Received into" htmlFor="fin-account" error={errors.accountId?.message} required>
              <Controller control={form.control} name="accountId" render={({ field }) => (
                <AccountSelect id="fin-account" value={field.value} onChange={field.onChange} kinds={["bank"]} invalid={!!errors.accountId} />
              )} />
            </Field>
            <Field label="Reference" htmlFor="fin-ref" error={errors.reference?.message} className="sm:col-span-2">
              <Input id="fin-ref" placeholder="UTR / disbursement no." {...form.register("reference")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>Mark received</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
