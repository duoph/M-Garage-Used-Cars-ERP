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
import { REFUND_METHODS, purchaseReturnSchema, type PurchaseReturnInput } from "@/lib/validation/schemas";
import { purchaseBalance } from "@/lib/calculations/finance";
import { purchaseReturnEffect, returnable } from "@/lib/calculations/returns";
import { todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { vehicleTitle } from "@/lib/utils/labels";
import type { Purchase } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";
import { CurrencyInput } from "@/components/shared/currency-input";
import { DateField } from "@/components/shared/date-field";
import { PaymentLinesEditor } from "@/features/accounts/payment-lines";

/** Sends a car back to its seller (debit note) and records any refund received now. */
export function PurchaseReturnDialog({ purchase, open, onOpenChange }: { purchase: Purchase; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <PurchaseReturnForm purchase={purchase} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function PurchaseReturnForm({ purchase, onDone }: { purchase: Purchase; onDone: () => void }) {
  const { idx } = useData();
  const user = useCurrentUser();
  const router = useRouter();
  const limit = returnable(purchase.purchasePricePaise, idx.purchaseReturnsByPurchase.get(purchase.id) ?? []);
  const vehicle = idx.vehicles.get(purchase.vehicleId);

  const form = useForm<PurchaseReturnInput>({
    resolver: zodResolver(purchaseReturnSchema),
    defaultValues: { purchaseId: purchase.id, date: todayISO(), returnAmountPaise: limit, deductionPaise: 0, reason: "", notes: "", refunds: [] },
  });
  const { errors, isSubmitting } = form.formState;
  const v = useWatch({ control: form.control }) as PurchaseReturnInput;
  const effect = purchaseReturnEffect(purchase, { returnAmountPaise: v.returnAmountPaise ?? 0, deductionPaise: v.deductionPaise ?? 0 });
  const stillOwed = purchaseBalance(effect.next);

  async function onSubmit(values: PurchaseReturnInput) {
    try {
      const id = await dealerService.createPurchaseReturn(user, values);
      toast.success("Purchase return recorded; car removed from stock");
      onDone();
      router.push(`/purchases/returns/${id}`);
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <DialogContent className="sm:max-w-3xl">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>Purchase return</DialogTitle>
          <DialogDescription>
            {purchase.reference} · {purchase.sellerName} · {vehicle ? `${vehicle.year} ${vehicleTitle(vehicle)} ${vehicle.registrationNumber}` : ""}. The car leaves stock as Returned to Supplier.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Return date" htmlFor="pr-date" error={errors.date?.message} required>
            <DateField id="pr-date" max={todayISO()} min={purchase.purchaseDate} invalid={!!errors.date} {...form.register("date")} />
          </Field>
          <div />
          <Field label="Return amount" htmlFor="pr-amount" error={errors.returnAmountPaise?.message} required hint={`Up to ${formatINR(limit)}`}>
            <Controller control={form.control} name="returnAmountPaise" render={({ field }) => (
              <CurrencyInput id="pr-amount" value={field.value} onChange={(x) => field.onChange(x ?? undefined)} onBlur={field.onBlur} invalid={!!errors.returnAmountPaise} />
            )} />
          </Field>
          <Field label="Deduction" htmlFor="pr-deduction" error={errors.deductionPaise?.message} hint="Charges the seller keeps.">
            <Controller control={form.control} name="deductionPaise" render={({ field }) => (
              <CurrencyInput id="pr-deduction" value={field.value} onChange={(x) => field.onChange(x ?? 0)} onBlur={field.onBlur} invalid={!!errors.deductionPaise} />
            )} />
          </Field>
          <Field label="Reason" htmlFor="pr-reason" error={errors.reason?.message} required className="sm:col-span-2">
            <Input id="pr-reason" placeholder="e.g. Accident history found after purchase" aria-invalid={!!errors.reason} {...form.register("reason")} />
          </Field>
          <div className="sm:col-span-2">
            <h3 className="mb-1 text-[13px] font-medium">Refund from seller</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {effect.refundDuePaise > 0
                ? "Record what the seller has paid back and which account it went into. The rest stays as a refund due from the seller."
                : stillOwed > 0
                  ? `Nothing comes back: ${formatINR(stillOwed)} is still owed to the seller after this return.`
                  : "Nothing comes back on this return."}
            </p>
            <PaymentLinesEditor
              control={form.control}
              name="refunds"
              errors={errors}
              methods={REFUND_METHODS}
              branchId={purchase.branchId}
              totalPaise={effect.refundDuePaise}
              idPrefix="pr-ref"
              addLabel="Add refund received"
              labels={{ total: "Refund due", paid: "Received now", balance: "Still due from seller", account: "Received into" }}
            />
          </div>
          <Field label="Notes" htmlFor="pr-notes" className="sm:col-span-2">
            <Textarea id="pr-notes" rows={2} {...form.register("notes")} />
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
