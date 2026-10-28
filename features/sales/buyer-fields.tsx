"use client";
import { useWatch, type FieldValues, type UseFormReturn } from "react-hook-form";
import { Field } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useData } from "@/components/providers/data-provider";

interface BuyerShape {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNotes: string;
}

/** Buyer details; recognises returning customers by phone number. */
export function BuyerFields<T extends FieldValues & BuyerShape>({ form, idPrefix = "buyer" }: { form: UseFormReturn<T>; idPrefix?: string }) {
  const f = form as unknown as UseFormReturn<BuyerShape>;
  const { ds } = useData();
  const e = f.formState.errors;
  const phone = useWatch({ control: f.control, name: "customerPhone" }) ?? "";
  const digits = phone.replace(/\D/g, "").slice(-10);
  const returning = digits.length === 10 ? ds.customers.find((c) => c.phone.replace(/\D/g, "").slice(-10) === digits) : undefined;
  const id = (n: string) => `${idPrefix}-${n}`;

  return (
    <>
      <Field
        label="Contact number"
        htmlFor={id("phone")}
        error={e.customerPhone?.message}
        required
        hint={
          returning ? (
            <span>
              Returning customer: <strong className="font-medium text-foreground">{returning.name}</strong>{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => {
                  f.setValue("customerName", returning.name, { shouldValidate: true, shouldDirty: true });
                  if (returning.address) f.setValue("customerAddress", returning.address, { shouldDirty: true });
                }}
              >
                Use details
              </button>
            </span>
          ) : (
            "10-digit mobile number"
          )
        }
      >
        <Input id={id("phone")} type="tel" inputMode="tel" autoComplete="off" placeholder="98470 12345" aria-invalid={!!e.customerPhone} {...f.register("customerPhone")} />
      </Field>
      <Field label="Full name" htmlFor={id("name")} error={e.customerName?.message} required>
        <Input id={id("name")} autoComplete="off" aria-invalid={!!e.customerName} {...f.register("customerName")} />
      </Field>
      <Field label="City / address" htmlFor={id("address")} error={e.customerAddress?.message} className="sm:col-span-2">
        <Input id={id("address")} placeholder="Optional" {...f.register("customerAddress")} />
      </Field>
      <Field label="Buyer notes" htmlFor={id("notes")} error={e.customerNotes?.message} className="sm:col-span-2">
        <Textarea id={id("notes")} rows={2} placeholder="Optional" {...f.register("customerNotes")} />
      </Field>
    </>
  );
}
