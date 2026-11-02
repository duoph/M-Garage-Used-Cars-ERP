"use client";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { makeReceiveSchema, type ReceiveInput } from "@/lib/validation/schemas";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import type { PaymentMethod, Sale } from "@/types";
import { todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";
import { DateField } from "@/components/shared/date-field";
import { StaffSelect } from "@/features/accounts/shared";
import { PaymentLinesEditor, sumLines, useNewLine } from "@/features/accounts/payment-lines";

/** Modes a buyer can pay in. A loan line stays due from the lender until it is received. */
export const SALE_PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "upi", "bank_transfer", "cheque", "finance"];

/** "Receive Payment": collects some or all of a sale's balance, split across payment lines. */
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
  const { can } = useAuth();
  const newLine = useNewLine(sale.branchId);
  const form = useForm<ReceiveInput>({
    resolver: zodResolver(makeReceiveSchema(balancePaise)),
    defaultValues: { date: todayISO(), lines: [newLine("bank_transfer", balancePaise)], notes: "", receivedBy: user.id },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ReceiveInput) {
    try {
      const ids = await dealerService.receivePayments(user, sale.id, values);
      // Offer the receipt straight away so it can be printed or shared while the customer is present.
      toast.success(`Payment of ${formatINR(sumLines(values.lines))} recorded`, {
        action: can("receipts.print") ? { label: "View receipt", onClick: () => window.open(`/receipt/${ids[0]}`, "_blank") } : undefined,
        duration: 8000,
      });
      onRecorded?.(ids[0]);
      onDone();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <DialogContent className="sm:max-w-3xl">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>Receive payment</DialogTitle>
          <DialogDescription>
            {sale.reference} · Balance due <strong className="text-foreground">{formatINR(balancePaise)}</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment date" htmlFor="pay-date" error={errors.date?.message} required>
            <DateField id="pay-date" max={todayISO()} min={sale.saleDate} invalid={!!errors.date} {...form.register("date")} />
          </Field>
          <Field label="Received by" htmlFor="pay-received-by" hint="Who took the cash or confirmed the transfer.">
            <Controller control={form.control} name="receivedBy" render={({ field }) => (
              <StaffSelect id="pay-received-by" value={field.value} onChange={field.onChange} />
            )} />
          </Field>
          <div className="sm:col-span-2">
            <PaymentLinesEditor
              control={form.control}
              name="lines"
              errors={errors}
              methods={SALE_PAYMENT_METHODS}
              branchId={sale.branchId}
              totalPaise={balancePaise}
              idPrefix="pay"
              labels={{ total: "Balance due", paid: "Receiving now", balance: "Still due after this" }}
            />
          </div>
          <Field label="Notes" htmlFor="pay-notes" className="sm:col-span-2">
            <Textarea id="pay-notes" rows={2} {...form.register("notes")} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>Receive payment</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
