"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, format } from "date-fns";
import { FileText, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useCurrentUser } from "@/hooks/use-auth";
import { reportError } from "@/hooks/use-commands";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { dealerService } from "@/lib/services/dealer-service";
import { quoteSchema, type QuoteInput } from "@/lib/validation/schemas";
import { quoteTotals } from "@/lib/calculations/finance";
import { activeVehicles, vehicleView } from "@/lib/calculations/selectors";
import { matchesSearch } from "@/features/inventory/filters";
import { formatKm, vehicleTitle } from "@/lib/utils/labels";
import { parseDate, todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { Field, FormSection } from "@/components/shared/form-field";
import { CurrencyInput } from "@/components/shared/currency-input";
import { DateField } from "@/components/shared/date-field";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { canEditQuote } from "./quote-utils";

const VALID_DAYS = 15;

/** New quote (optionally `?vehicle=`), or edit an existing one at /quotes/[id]. */
export function QuoteFormPage() {
  const { id } = useParams<{ id?: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { ds, idx } = useData();
  const user = useCurrentUser();
  const existing = id ? ds.quotes.find((q) => q.id === id) : undefined;
  const preVehicle = params.get("vehicle");
  const [saving, setSaving] = React.useState(false);

  const form = useForm<QuoteInput>({
    resolver: zodResolver(quoteSchema),
    mode: "onTouched",
    defaultValues: existing
      ? {
          vehicleId: existing.vehicleId,
          customerName: existing.customerName,
          customerPhone: existing.customerPhone,
          customerAddress: existing.customerAddress,
          quoteDate: existing.quoteDate,
          validUntil: existing.validUntil,
          vehiclePricePaise: existing.vehiclePricePaise,
          extras: existing.extras,
          discountPaise: existing.discountPaise,
          notes: existing.notes,
        }
      : {
          vehicleId: preVehicle && idx.vehicles.get(preVehicle)?.status === "available" ? preVehicle : "",
          customerName: "",
          customerPhone: "",
          customerAddress: "",
          quoteDate: todayISO(),
          validUntil: format(addDays(parseDate(todayISO()), VALID_DAYS), "yyyy-MM-dd"),
          vehiclePricePaise: (preVehicle ? idx.vehicles.get(preVehicle)?.askingPricePaise : undefined) as number,
          extras: [{ description: "Ownership transfer (RTO)", amountPaise: 4500_00 }],
          discountPaise: 0,
          notes: "",
        },
  });
  const { errors, isDirty } = form.formState;
  useUnsavedGuard(isDirty && !saving);
  const extras = useFieldArray({ control: form.control, name: "extras" });
  const values = useWatch({ control: form.control }) as QuoteInput;
  const totals = quoteTotals({ vehiclePricePaise: values.vehiclePricePaise ?? 0, extras: values.extras ?? [], discountPaise: values.discountPaise ?? 0 });

  if (id && (!existing || !canEditQuote(existing, user)))
    return (
      <EmptyState
        icon={FileText}
        title={existing ? "This quote can't be edited" : "Quote not found"}
        description={existing?.status === "accepted" ? "It has already turned into a sale." : undefined}
        action={<Button asChild variant="outline"><Link href="/quotes">Back to quotes</Link></Button>}
        className="py-24"
      />
    );

  const submit = form.handleSubmit(async (input) => {
    setSaving(true);
    try {
      if (existing) {
        await dealerService.updateQuote(user, existing.id, input);
        toast.success("Quote updated");
        router.push(`/quote/${existing.id}`);
      } else {
        const newId = await dealerService.createQuote(user, input);
        toast.success("Quote created");
        router.push(`/quote/${newId}`);
      }
    } catch (e) {
      reportError(e);
      setSaving(false);
    }
  });

  return (
    <>
      <PageHeader
        title={existing ? `Edit ${existing.reference}` : "New quote"}
        description="Car price, any extra charges and a discount. Print it or save it as a PDF for the buyer."
        breadcrumbs={[{ label: "Quotes", href: "/quotes" }, { label: existing ? existing.reference : "New quote" }]}
      />
      <Card className="p-4 sm:p-5">
        <form onSubmit={submit} className="grid gap-8" noValidate>
          <FormSection title="Vehicle" description="Available cars in stock.">
            <div className="sm:col-span-2">
              <Controller
                control={form.control}
                name="vehicleId"
                render={({ field }) => (
                  <VehicleChooser
                    value={field.value}
                    error={errors.vehicleId?.message}
                    onChange={(vehicleId) => {
                      field.onChange(vehicleId);
                      const v = idx.vehicles.get(vehicleId);
                      if (v) form.setValue("vehiclePricePaise", v.askingPricePaise, { shouldValidate: true, shouldDirty: true });
                    }}
                  />
                )}
              />
            </div>
          </FormSection>

          <FormSection title="Buyer">
            <Field label="Contact number" htmlFor="q-phone" error={errors.customerPhone?.message} required>
              <Input id="q-phone" type="tel" inputMode="tel" autoComplete="off" placeholder="98470 12345" aria-invalid={!!errors.customerPhone} {...form.register("customerPhone")} />
            </Field>
            <Field label="Full name" htmlFor="q-name" error={errors.customerName?.message} required>
              <Input id="q-name" autoComplete="off" aria-invalid={!!errors.customerName} {...form.register("customerName")} />
            </Field>
            <Field label="City / address" htmlFor="q-address" error={errors.customerAddress?.message} className="sm:col-span-2">
              <Input id="q-address" placeholder="Optional" {...form.register("customerAddress")} />
            </Field>
          </FormSection>

          <FormSection title="Price" description="Extras are added to the car price; the discount comes off the total.">
            <Field label="Quote date" htmlFor="q-date" error={errors.quoteDate?.message} required>
              <DateField id="q-date" max={todayISO()} invalid={!!errors.quoteDate} {...form.register("quoteDate")} />
            </Field>
            <Field label="Valid until" htmlFor="q-valid" error={errors.validUntil?.message} required>
              <DateField id="q-valid" invalid={!!errors.validUntil} {...form.register("validUntil")} />
            </Field>
            <Field label="Vehicle price" htmlFor="q-price" error={errors.vehiclePricePaise?.message} required className="sm:col-span-2">
              <Controller control={form.control} name="vehiclePricePaise" render={({ field }) => (
                <CurrencyInput id="q-price" value={field.value} onChange={(v) => field.onChange(v ?? undefined)} onBlur={field.onBlur} invalid={!!errors.vehiclePricePaise} />
              )} />
            </Field>

            <div className="grid gap-2 sm:col-span-2">
              <span className="text-sm font-medium">Extra charges</span>
              {extras.fields.map((row, i) => (
                <div key={row.id} className="grid grid-cols-[1fr_8rem_auto] items-start gap-2">
                  <div>
                    <Input aria-label={`Charge ${i + 1}`} placeholder="e.g. Insurance, 1 year" aria-invalid={!!errors.extras?.[i]?.description} {...form.register(`extras.${i}.description`)} />
                    {errors.extras?.[i]?.description && <p className="mt-1 text-xs text-destructive">{errors.extras[i]?.description?.message}</p>}
                  </div>
                  <div>
                    <Controller control={form.control} name={`extras.${i}.amountPaise`} render={({ field }) => (
                      <CurrencyInput aria-label={`Amount for charge ${i + 1}`} value={field.value} onChange={(v) => field.onChange(v ?? undefined)} onBlur={field.onBlur} invalid={!!errors.extras?.[i]?.amountPaise} />
                    )} />
                    {errors.extras?.[i]?.amountPaise && <p className="mt-1 text-xs text-destructive">{errors.extras[i]?.amountPaise?.message}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove charge ${i + 1}`} onClick={() => extras.remove(i)}><X /></Button>
                </div>
              ))}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => extras.append({ description: "", amountPaise: undefined as unknown as number })} disabled={extras.fields.length >= 10}>
                  <Plus /> Add charge
                </Button>
              </div>
            </div>

            <Field label="Discount" htmlFor="q-discount" error={errors.discountPaise?.message}>
              <Controller control={form.control} name="discountPaise" render={({ field }) => (
                <CurrencyInput id="q-discount" value={field.value} onChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} invalid={!!errors.discountPaise} />
              )} />
            </Field>
            <div className="grid content-end gap-0.5 sm:text-right">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-lg font-semibold tabular">{formatINR(totals.totalPaise)}</span>
            </div>
            <Field label="Notes for the buyer" htmlFor="q-notes" error={errors.notes?.message} className="sm:col-span-2">
              <Textarea id="q-notes" rows={2} placeholder="Optional, printed on the quote" {...form.register("notes")} />
            </Field>
          </FormSection>

          <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => router.push(existing ? `/quote/${existing.id}` : "/quotes")} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving}>{existing ? "Save changes" : "Create quote"}</Button>
          </div>
        </form>
      </Card>
    </>
  );
}

/** Shows the chosen car, or a searchable list of cars in stock. */
function VehicleChooser({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string }) {
  const { ds, idx } = useData();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(!value);
  const selected = value ? idx.vehicles.get(value) : undefined;
  const candidates = React.useMemo(
    () => activeVehicles(ds).filter((v) => v.status === "available").map((v) => vehicleView(v, idx)),
    [ds, idx],
  );

  if (selected && !open)
    return (
      <div className="flex items-center gap-3 rounded-lg border p-2.5">
        <VehicleImage image={vehicleView(selected, idx).cover} alt="" className="h-12 w-16 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{selected.year} {vehicleTitle(selected)} <span className="font-normal text-muted-foreground">{selected.variant}</span></div>
          <div className="text-xs text-muted-foreground">{selected.registrationNumber} · {formatKm(selected.mileageKm)} · Asking {formatINR(selected.askingPricePaise)}</div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>Change</Button>
      </div>
    );

  const list = candidates.filter((c) => matchesSearch(c, q)).slice(0, 8);
  return (
    <div className="grid gap-2">
      <SearchInput value={q} onChange={setQ} placeholder="Search make, model or registration…" className="sm:w-full" />
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <ul className="divide-y rounded-lg border">
        {list.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-muted-foreground">No cars in stock match.</li>}
        {list.map((c) => (
          <li key={c.vehicle.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => {
                onChange(c.vehicle.id);
                setOpen(false);
              }}
            >
              <VehicleImage image={c.cover} alt="" className="h-9 w-12 shrink-0 rounded" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.vehicle.year} {vehicleTitle(c.vehicle)}</span>
                <span className="block truncate text-xs text-muted-foreground">{c.vehicle.registrationNumber} · {formatINR(c.vehicle.askingPricePaise)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
