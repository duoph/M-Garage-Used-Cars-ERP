"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-auth";
import { reportError } from "@/hooks/use-commands";
import { dealerService } from "@/lib/services/dealer-service";
import { REFUND_METHODS, refundSchema, type RefundInput } from "@/lib/validation/schemas";
import { todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";
import { DateField } from "@/components/shared/date-field";
import { PaymentLinesEditor, sumLines, useNewLine } from "@/features/accounts/payment-lines";

/** Pays a pending refund to the buyer, or records a pending refund received from the seller. */
export function RefundDialog({
  returnType,
  returnId,
  number,
  minDate,
  branchId,
  pendingPaise,
  open,
  onOpenChange,
}: {
  returnType: "sales" | "purchase";
  returnId: string;
  number: string;
  minDate: string;
  branchId: string | null;
  pendingPaise: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const user = useCurrentUser();
  const newLine = useNewLine(branchId);
  const form = useForm<RefundInput>({
    resolver: zodResolver(refundSchema),
    defaultValues: { date: todayISO(), lines: [newLine("cash", pendingPaise)] },
  });
  const { errors, isSubmitting } = form.formState;
  const sales = returnType === "sales";

  async function onSubmit(values: RefundInput) {
    try {
      await dealerService.recordRefund(user, returnType, returnId, values);
      toast.success(`${sales ? "Refunded" : "Received"} ${formatINR(sumLines(values.lines))}`);
      onOpenChange(false);
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>{sales ? "Pay refund to buyer" : "Refund received from seller"}</DialogTitle>
            <DialogDescription>{number} · <strong className="text-foreground">{formatINR(pendingPaise)}</strong> pending</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Date" htmlFor="rf-date" error={errors.date?.message} required className="sm:max-w-56">
              <DateField id="rf-date" max={todayISO()} min={minDate} invalid={!!errors.date} {...form.register("date")} />
            </Field>
            <PaymentLinesEditor
              control={form.control}
              name="lines"
              errors={errors}
              methods={REFUND_METHODS}
              branchId={branchId}
              totalPaise={pendingPaise}
              idPrefix="rf"
              addLabel="Add refund line"
              labels={{ total: "Pending", paid: sales ? "Paying now" : "Received now", balance: "Still pending", account: sales ? "Paid from" : "Received into" }}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{sales ? "Pay refund" : "Record refund"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
