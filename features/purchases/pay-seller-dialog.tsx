"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { makeReceiveSchema, type ReceiveInput } from "@/lib/validation/schemas";
import { purchaseBalance } from "@/lib/calculations/finance";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { useCurrentUser } from "@/hooks/use-auth";
import { todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type { Purchase } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";
import { DateField } from "@/components/shared/date-field";
import { PaymentLinesEditor, sumLines, useNewLine } from "@/features/accounts/payment-lines";
import { PURCHASE_PAYMENT_METHODS } from "./new-purchase-page";

/** Pays the seller some or all of what is still owed, from one or more cash / bank accounts. */
export function PaySellerDialog({ purchase, open, onOpenChange }: { purchase: Purchase; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <PaySellerForm purchase={purchase} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function PaySellerForm({ purchase, onDone }: { purchase: Purchase; onDone: () => void }) {
  const user = useCurrentUser();
  const balance = purchaseBalance(purchase);
  const newLine = useNewLine(purchase.branchId);
  const form = useForm<ReceiveInput>({
    resolver: zodResolver(makeReceiveSchema(balance)),
    defaultValues: { date: todayISO(), lines: [newLine("bank_transfer", balance)], notes: "", receivedBy: null },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ReceiveInput) {
    try {
      await dealerService.payPurchase(user, purchase.id, values);
      toast.success(`Paid ${formatINR(sumLines(values.lines))} to ${purchase.sellerName}`);
      onDone();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <DialogContent className="sm:max-w-3xl">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>Pay seller</DialogTitle>
          <DialogDescription>
            {purchase.reference} · {purchase.sellerName} · Owed <strong className="text-foreground">{formatINR(balance)}</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <Field label="Payment date" htmlFor="ps-date" error={errors.date?.message} required className="sm:max-w-56">
            <DateField id="ps-date" max={todayISO()} min={purchase.purchaseDate} invalid={!!errors.date} {...form.register("date")} />
          </Field>
          <PaymentLinesEditor
            control={form.control}
            name="lines"
            errors={errors}
            methods={PURCHASE_PAYMENT_METHODS}
            branchId={purchase.branchId}
            totalPaise={balance}
            idPrefix="ps"
            labels={{ total: "Owed to seller", paid: "Paying now", balance: "Still owed after this", account: "Paid from" }}
          />
          <Field label="Notes" htmlFor="ps-notes">
            <Textarea id="ps-notes" rows={2} {...form.register("notes")} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>Pay seller</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
