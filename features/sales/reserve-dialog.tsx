"use client";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { reservationSchema, type ReservationInput } from "@/lib/validation/schemas";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { useCurrentUser } from "@/hooks/use-auth";
import { PAYMENT_METHODS, type Vehicle } from "@/types";
import { PAYMENT_METHOD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/shared/form-field";
import { CurrencyInput } from "@/components/shared/currency-input";
import { DateField } from "@/components/shared/date-field";
import { BuyerFields } from "./buyer-fields";

export function ReserveDialog({ vehicle, open, onOpenChange }: { vehicle: Vehicle; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ReserveBody vehicle={vehicle} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function ReserveBody({ vehicle, onDone }: { vehicle: Vehicle; onDone: () => void }) {
  const user = useCurrentUser();
  const form = useForm<ReservationInput>({
    resolver: zodResolver(reservationSchema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      customerAddress: "",
      customerNotes: "",
      reservationDate: todayISO(),
      bookingAmountPaise: 0,
      bookingMethod: "upi",
      bookingReference: "",
      notes: "",
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ReservationInput) {
    try {
      await dealerService.reserveVehicle(user, vehicle.id, values);
      toast.success(`${vehicleTitle(vehicle)} reserved for ${values.customerName}`);
      onDone();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <DialogContent className="sm:max-w-xl">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>Reserve vehicle</DialogTitle>
          <DialogDescription>
            {vehicle.year} {vehicleTitle(vehicle)} · {vehicle.registrationNumber} · Asking {formatINR(vehicle.askingPricePaise)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <BuyerFields form={form} idPrefix="res" />
          <Field label="Reservation date" htmlFor="res-date" error={errors.reservationDate?.message} required>
            <DateField id="res-date" max={todayISO()} invalid={!!errors.reservationDate} {...form.register("reservationDate")} />
          </Field>
          <Field label="Booking amount" htmlFor="res-amount" error={errors.bookingAmountPaise?.message} hint="Leave 0 if no advance was paid">
            <Controller
              control={form.control}
              name="bookingAmountPaise"
              render={({ field }) => (
                <CurrencyInput id="res-amount" value={field.value} onChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} invalid={!!errors.bookingAmountPaise} />
              )}
            />
          </Field>
          <Field label="Payment method" htmlFor="res-method">
            <Controller
              control={form.control}
              name="bookingMethod"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="res-method"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}</SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Payment reference" htmlFor="res-ref" error={errors.bookingReference?.message}>
            <Input id="res-ref" placeholder="UPI / cheque no. (optional)" {...form.register("bookingReference")} />
          </Field>
          <Field label="Reservation notes" htmlFor="res-notes" className="sm:col-span-2">
            <Textarea id="res-notes" rows={2} placeholder="e.g. Loan approval pending" {...form.register("notes")} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>Reserve vehicle</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
