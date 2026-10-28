"use client";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { vehicleEditSchema, type VehicleEditInput } from "@/lib/validation/schemas";
import { dealerService } from "@/lib/services/dealer-service";
import { BusinessError } from "@/lib/repositories/contracts";
import { reportError } from "@/hooks/use-commands";
import { useCurrentUser } from "@/hooks/use-auth";
import type { Vehicle } from "@/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field } from "@/components/shared/form-field";
import { CurrencyInput } from "@/components/shared/currency-input";
import { VehicleDetailsFields } from "./vehicle-fields";

export function VehicleEditSheet({ vehicle, open, onOpenChange }: { vehicle: Vehicle; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        {open && <EditBody vehicle={vehicle} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function EditBody({ vehicle, onDone }: { vehicle: Vehicle; onDone: () => void }) {
  const user = useCurrentUser();
  const form = useForm<VehicleEditInput>({
    resolver: zodResolver(vehicleEditSchema),
    defaultValues: {
      make: vehicle.make,
      model: vehicle.model,
      variant: vehicle.variant,
      year: vehicle.year,
      registrationNumber: vehicle.registrationNumber,
      chassisNumber: vehicle.chassisNumber,
      engineNumber: vehicle.engineNumber,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      mileageKm: vehicle.mileageKm,
      color: vehicle.color,
      previousOwners: vehicle.previousOwners,
      notes: vehicle.notes,
      askingPricePaise: vehicle.askingPricePaise,
    },
  });
  const { isSubmitting, errors, isDirty } = form.formState;

  async function onSubmit(values: VehicleEditInput) {
    try {
      await dealerService.updateVehicle(user, vehicle.id, values);
      toast.success("Vehicle updated");
      onDone();
    } catch (e) {
      if (e instanceof BusinessError && e.field) form.setError(e.field as keyof VehicleEditInput, { message: e.message });
      reportError(e);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col" noValidate>
      <SheetHeader>
        <SheetTitle>Edit vehicle</SheetTitle>
        <SheetDescription>
          {vehicle.stockNumber} · {vehicle.registrationNumber}
        </SheetDescription>
      </SheetHeader>
      <SheetBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Asking price"
            htmlFor="edit-asking"
            error={errors.askingPricePaise?.message}
            required
            hint={vehicle.status === "sold" ? "Locked — this vehicle has been sold." : "Price changes are recorded in the activity log."}
            className="sm:col-span-2"
          >
            <Controller
              control={form.control}
              name="askingPricePaise"
              render={({ field }) => (
                <CurrencyInput
                  id="edit-asking"
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? undefined)}
                  onBlur={field.onBlur}
                  invalid={!!errors.askingPricePaise}
                  disabled={vehicle.status === "sold"}
                />
              )}
            />
          </Field>
          <VehicleDetailsFields form={form} idPrefix="edit" />
        </div>
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save changes</Button>
      </SheetFooter>
    </form>
  );
}
