"use client";
import * as React from "react";
import { Controller, type FieldValues, type UseFormReturn } from "react-hook-form";
import { FUEL_TYPES, TRANSMISSIONS } from "@/types";
import { FUEL_LABELS, TRANSMISSION_LABELS } from "@/lib/utils/labels";
import type { VehicleDetailsInput } from "@/lib/validation/schemas";
import { Field } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const COMMON_MAKES = [
  "Maruti Suzuki", "Hyundai", "Tata", "Mahindra", "Kia", "Honda", "Toyota", "Volkswagen", "Skoda", "Renault",
  "Nissan", "MG", "Ford", "Jeep", "Citroen", "BMW", "Mercedes-Benz", "Audi",
];
export const COMMON_COLORS = ["White", "Pearl White", "Silver", "Grey", "Black", "Red", "Blue", "Brown", "Orange", "Beige", "Green", "Maroon"];

/**
 * Vehicle specification fields shared by the purchase wizard and the inventory edit form.
 * Works with any form whose values include `VehicleDetailsInput`.
 */
export function VehicleDetailsFields<T extends FieldValues & VehicleDetailsInput>({
  form,
  idPrefix = "veh",
}: {
  form: UseFormReturn<T>;
  idPrefix?: string;
}) {
  // RHF's path types don't compose with generic intersections; narrow to the shared shape.
  const f = form as unknown as UseFormReturn<VehicleDetailsInput>;
  const { register, control, formState } = f;
  const e = formState.errors;
  const id = (n: string) => `${idPrefix}-${n}`;
  const yearNow = new Date().getFullYear();

  return (
    <>
      <Field label="Make" htmlFor={id("make")} error={e.make?.message} required>
        <Input id={id("make")} list={id("makes")} placeholder="e.g. Hyundai" autoComplete="off" aria-invalid={!!e.make} {...register("make")} />
        <datalist id={id("makes")}>
          {COMMON_MAKES.map((m) => <option key={m} value={m} />)}
        </datalist>
      </Field>
      <Field label="Model" htmlFor={id("model")} error={e.model?.message} required>
        <Input id={id("model")} placeholder="e.g. Creta" autoComplete="off" aria-invalid={!!e.model} {...register("model")} />
      </Field>
      <Field label="Variant" htmlFor={id("variant")} error={e.variant?.message}>
        <Input id={id("variant")} placeholder="e.g. SX 1.5 Diesel" autoComplete="off" {...register("variant")} />
      </Field>
      <Field label="Manufacturing year" htmlFor={id("year")} error={e.year?.message} required>
        <Input
          id={id("year")}
          type="number"
          inputMode="numeric"
          min={1990}
          max={yearNow + 1}
          aria-invalid={!!e.year}
          {...register("year", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
        />
      </Field>
      <Field label="Registration number" htmlFor={id("reg")} error={e.registrationNumber?.message} required hint="Format: KL 07 CD 4521">
        <Input
          id={id("reg")}
          placeholder="KL 07 CD 4521"
          autoComplete="off"
          className="uppercase"
          aria-invalid={!!e.registrationNumber}
          {...register("registrationNumber")}
        />
      </Field>
      <Field label="VIN / chassis number" htmlFor={id("chassis")} error={e.chassisNumber?.message} hint="Used to detect duplicate vehicles">
        <Input id={id("chassis")} autoComplete="off" className="uppercase" aria-invalid={!!e.chassisNumber} {...register("chassisNumber")} />
      </Field>
      <Field label="Engine number" htmlFor={id("engine")} error={e.engineNumber?.message}>
        <Input id={id("engine")} autoComplete="off" className="uppercase" placeholder="Optional" {...register("engineNumber")} />
      </Field>
      <Field label="Fuel type" htmlFor={id("fuel")} error={e.fuelType?.message} required>
        <Controller
          control={control}
          name="fuelType"
          render={({ field }) => (
            <Select value={field.value ?? ""} onValueChange={field.onChange} onOpenChange={(o) => !o && field.onBlur()}>
              <SelectTrigger id={id("fuel")} aria-invalid={!!e.fuelType}><SelectValue placeholder="Select fuel" /></SelectTrigger>
              <SelectContent>{FUEL_TYPES.map((x) => <SelectItem key={x} value={x}>{FUEL_LABELS[x]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label="Transmission" htmlFor={id("trans")} error={e.transmission?.message} required>
        <Controller
          control={control}
          name="transmission"
          render={({ field }) => (
            <Select value={field.value ?? ""} onValueChange={field.onChange} onOpenChange={(o) => !o && field.onBlur()}>
              <SelectTrigger id={id("trans")} aria-invalid={!!e.transmission}><SelectValue placeholder="Select transmission" /></SelectTrigger>
              <SelectContent>{TRANSMISSIONS.map((x) => <SelectItem key={x} value={x}>{TRANSMISSION_LABELS[x]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label="Kilometers driven" htmlFor={id("km")} error={e.mileageKm?.message} required>
        <Input
          id={id("km")}
          type="number"
          inputMode="numeric"
          min={0}
          aria-invalid={!!e.mileageKm}
          {...register("mileageKm", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
        />
      </Field>
      <Field label="Exterior colour" htmlFor={id("color")} error={e.color?.message} required>
        <Input id={id("color")} list={id("colors")} autoComplete="off" aria-invalid={!!e.color} {...register("color")} />
        <datalist id={id("colors")}>
          {COMMON_COLORS.map((m) => <option key={m} value={m} />)}
        </datalist>
      </Field>
      <Field label="Previous owners" htmlFor={id("owners")} error={e.previousOwners?.message} required>
        <Input
          id={id("owners")}
          type="number"
          inputMode="numeric"
          min={0}
          max={10}
          aria-invalid={!!e.previousOwners}
          {...register("previousOwners", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
        />
      </Field>
      <Field label="Vehicle notes" htmlFor={id("notes")} error={e.notes?.message} className="sm:col-span-2">
        <Textarea id={id("notes")} rows={3} placeholder="Condition, service history, features…" {...register("notes")} />
      </Field>
    </>
  );
}
