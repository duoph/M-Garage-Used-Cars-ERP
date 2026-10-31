"use client";
import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { expenseSchema, isVehicleCategory, type ExpenseInput } from "@/lib/validation/schemas";
import { GENERAL_EXPENSE_CATEGORIES, PAYMENT_METHODS, VEHICLE_EXPENSE_CATEGORIES } from "@/types";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { todayISO } from "@/lib/utils/dates";
import { useData } from "@/components/providers/data-provider";
import { Field } from "@/components/shared/form-field";
import { CurrencyInput } from "@/components/shared/currency-input";
import { DateField } from "@/components/shared/date-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AccountSelect, useDefaultAccountId } from "@/features/accounts/shared";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";

export const EXPENSE_FORM_ID = "expense-form";

export function ExpenseForm({
  defaultValues,
  lockVehicle = false,
  onSubmit,
}: {
  defaultValues?: Partial<ExpenseInput>;
  lockVehicle?: boolean;
  onSubmit: (values: ExpenseInput) => Promise<void>;
}) {
  const { ds } = useData();
  const form = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      category: defaultValues?.vehicleId ? "repair" : "rent",
      amountPaise: undefined as unknown as number,
      date: todayISO(),
      description: "",
      vendor: "",
      paymentMethod: "upi",
      vehicleId: null,
      notes: "",
      ...defaultValues,
    },
  });
  const { register, control, handleSubmit, setValue, formState } = form;
  const errors = formState.errors;
  const category = useWatch({ control, name: "category" });
  const vehicleSpecific = isVehicleCategory(category);
  const method = useWatch({ control, name: "paymentMethod" });
  const defaultAccount = useDefaultAccountId(method);

  const vehicles = ds.vehicles
    .filter((v) => !v.archivedAt)
    .sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model));

  return (
    <form id={EXPENSE_FORM_ID} onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Category" htmlFor="exp-category" error={errors.category?.message} required>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(v) => {
                field.onChange(v);
                if (!isVehicleCategory(v as ExpenseInput["category"]) && !lockVehicle) setValue("vehicleId", null);
              }}
              >
              <SelectTrigger id="exp-category" aria-invalid={!!errors.category}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Vehicle-related</SelectLabel>
                  {VEHICLE_EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectGroup>
                {!lockVehicle && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>General showroom</SelectLabel>
                      {GENERAL_EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label="Amount" htmlFor="exp-amount" error={errors.amountPaise?.message} required>
        <Controller
          control={control}
          name="amountPaise"
          render={({ field }) => (
            <CurrencyInput id="exp-amount" value={field.value} onChange={(v) => field.onChange(v ?? undefined)} onBlur={field.onBlur} invalid={!!errors.amountPaise} />
          )}
        />
      </Field>
      <Field
        label="Related vehicle"
        htmlFor="exp-vehicle"
        error={errors.vehicleId?.message}
        required={vehicleSpecific}
        hint={vehicleSpecific ? "Adds to this vehicle's landed cost." : "General expenses aren't linked to a vehicle."}
        className="sm:col-span-2"
      >
        <Controller
          control={control}
          name="vehicleId"
          render={({ field }) => (
            <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || null)} disabled={!vehicleSpecific || lockVehicle}>
              <SelectTrigger id="exp-vehicle" aria-invalid={!!errors.vehicleId}>
                <SelectValue placeholder={vehicleSpecific ? "Select vehicle" : "Not applicable"} />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.year} {vehicleTitle(v)} · {v.registrationNumber}
                    {v.status === "sold" ? " (sold)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label="Description" htmlFor="exp-desc" error={errors.description?.message} required className="sm:col-span-2">
        <Input id="exp-desc" placeholder="e.g. Rear bumper repaint" aria-invalid={!!errors.description} {...register("description")} />
      </Field>
      <Field label="Date" htmlFor="exp-date" error={errors.date?.message} required>
        <DateField id="exp-date" max={todayISO()} invalid={!!errors.date} {...register("date")} />
      </Field>
      <Field label="Payment method" htmlFor="exp-method" error={errors.paymentMethod?.message}>
        <Controller
          control={control}
          name="paymentMethod"
          render={({ field }) => (
            <Select value={field.value} onValueChange={(v) => { field.onChange(v); setValue("accountId", null); }}>
              <SelectTrigger id="exp-method"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label="Vendor / payee" htmlFor="exp-vendor" error={errors.vendor?.message}>
        <Input id="exp-vendor" placeholder="Optional" {...register("vendor")} />
      </Field>
      <Field label="Paid from" htmlFor="exp-account">
        <Controller
          control={control}
          name="accountId"
          render={({ field }) => <AccountSelect id="exp-account" value={field.value ?? defaultAccount} onChange={field.onChange} />}
        />
      </Field>
      <Field label="Notes" htmlFor="exp-notes" error={errors.notes?.message} className="sm:col-span-2">
        <Textarea id="exp-notes" rows={2} placeholder="Optional" {...register("notes")} />
      </Field>
    </form>
  );
}
