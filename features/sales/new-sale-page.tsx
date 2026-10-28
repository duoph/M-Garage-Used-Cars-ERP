"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm, type FieldPath, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CarFront, Lock, Printer } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useCurrentUser } from "@/hooks/use-auth";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { makeSaleSchema, type SaleInput } from "@/lib/validation/schemas";
import { activeVehicles, vehicleView, type VehicleView } from "@/lib/calculations/selectors";
import { paymentStatusFor } from "@/lib/calculations/finance";
import { matchesSearch } from "@/features/inventory/filters";
import { PAYMENT_METHODS } from "@/types";
import { PAYMENT_METHOD_LABELS, formatKm, vehicleTitle } from "@/lib/utils/labels";
import { formatDate, todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { Field } from "@/components/shared/form-field";
import { CurrencyInput } from "@/components/shared/currency-input";
import { DateField } from "@/components/shared/date-field";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { PaymentStatusBadge, VehicleStatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { BuyerFields } from "./buyer-fields";

const STEPS = ["Select vehicle", "Buyer details", "Sale information", "Review", "Confirm"] as const;
const STEP_FIELDS: FieldPath<SaleInput>[][] = [
  ["vehicleId"],
  ["customerName", "customerPhone", "customerAddress", "customerNotes"],
  ["saleDate", "salePricePaise", "amountReceivedPaise", "paymentMethod", "paymentReference", "notes"],
];

export function NewSalePage() {
  const params = useSearchParams();
  const { ds, idx } = useData();
  const router = useRouter();
  const user = useCurrentUser();
  const [completedSaleId, setCompletedSaleId] = React.useState<string | null>(null);

  const initialVehicle = params.get("vehicle");
  const pre = initialVehicle ? idx.vehicles.get(initialVehicle) : undefined;
  const preReservation = pre ? idx.activeReservationByVehicle.get(pre.id) : undefined;
  const preCustomer = preReservation ? idx.customers.get(preReservation.customerId) : undefined;
  const preSelectable = pre && pre.status !== "sold" && !pre.archivedAt;

  const [step, setStep] = React.useState(preSelectable ? 1 : 0);
  const [saving, setSaving] = React.useState(false);
  const [vehicleId, setVehicleId] = React.useState<string | null>(preSelectable ? pre.id : null);

  const selected = vehicleId ? idx.vehicles.get(vehicleId) : undefined;
  const reservation = selected ? idx.activeReservationByVehicle.get(selected.id) : undefined;
  const reservationCustomer = reservation ? idx.customers.get(reservation.customerId) : undefined;
  const booking = reservation?.bookingAmountPaise ?? 0;
  const schema = makeSaleSchema(booking);

  const form = useForm<SaleInput>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      vehicleId: preSelectable ? pre.id : "",
      reservationId: preSelectable ? (preReservation?.id ?? null) : null,
      customerName: preCustomer?.name ?? "",
      customerPhone: preCustomer?.phone ?? "",
      customerAddress: preCustomer?.address ?? "",
      customerNotes: "",
      saleDate: todayISO(),
      salePricePaise: preSelectable ? pre.askingPricePaise : (undefined as unknown as number),
      amountReceivedPaise: 0,
      paymentMethod: "bank_transfer",
      paymentReference: "",
      notes: "",
    },
  });
  const { errors, isDirty } = form.formState;
  const [leaving, setLeaving] = React.useState(false);
  const dirty = isDirty && !completedSaleId && !saving;
  useUnsavedGuard(dirty);
  const values = useWatch({ control: form.control }) as SaleInput;

  function selectVehicle(view: VehicleView) {
    const r = view.reservation;
    const c = r ? idx.customers.get(r.customerId) : undefined;
    setVehicleId(view.vehicle.id);
    form.setValue("vehicleId", view.vehicle.id, { shouldValidate: true });
    form.setValue("reservationId", r?.id ?? null);
    form.setValue("salePricePaise", view.vehicle.askingPricePaise);
    form.setValue("customerName", c?.name ?? "");
    form.setValue("customerPhone", c?.phone ?? "");
    form.setValue("customerAddress", c?.address ?? "");
  }

  async function next() {
    if (step < STEP_FIELDS.length) {
      const ok = await form.trigger(STEP_FIELDS[step], { shouldFocus: true });
      if (!ok) return;
    }
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirm() {
    const ok = await form.trigger();
    if (!ok) {
      toast.error("Please review the highlighted fields.");
      setStep(STEP_FIELDS.findIndex((f) => f.some((n) => form.getFieldState(n).invalid)));
      return;
    }
    setSaving(true);
    try {
      const id = await dealerService.completeSale(user, schema.parse(form.getValues()));
      setCompletedSaleId(id);
      toast.success("Sale recorded");
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  }

  if (completedSaleId) return <SaleComplete saleId={completedSaleId} />;

  const candidates = activeVehicles(ds)
    .filter((v) => v.status !== "sold")
    .map((v) => vehicleView(v, idx));
  const totalReceived = booking + (values.amountReceivedPaise ?? 0);
  const balance = Math.max(0, (values.salePricePaise ?? 0) - totalReceived);

  return (
    <>
      <PageHeader title="Record sale" description="Sell an available vehicle, or complete an existing reservation." breadcrumbs={[{ label: "Sales", href: "/sales" }, { label: "Record sale" }]} />
      <nav aria-label="Progress" className="mb-4">
        <ol className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {STEPS.map((label, i) => (
            <li key={label} className="min-w-28 flex-1">
              <button type="button" disabled={i >= step} onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined} className="w-full text-left disabled:cursor-default">
                <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-[#e4e7ec]")} />
                <div className={cn("mt-2 text-xs font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>
                  <span className="tabular">{i + 1}.</span> {label}
                </div>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {selected && step > 0 && (
        <Card className="mb-4 flex items-center gap-3 p-3">
          <VehicleImage image={vehicleView(selected, idx).cover} alt="" className="h-12 w-16 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{selected.year} {vehicleTitle(selected)} <span className="font-normal text-muted-foreground">{selected.variant}</span></div>
            <div className="text-xs text-muted-foreground">{selected.registrationNumber} · Asking {formatINR(selected.askingPricePaise)}</div>
          </div>
          <VehicleStatusBadge status={selected.status} />
          {step < 4 && <Button variant="ghost" size="sm" onClick={() => setStep(0)}>Change</Button>}
        </Card>
      )}

      <Card className="p-4 sm:p-5">
        {step === 0 && (
          <VehiclePicker candidates={candidates} selectedId={vehicleId} onSelect={selectVehicle} error={errors.vehicleId?.message} />
        )}

        {step === 1 && (
          <div>
            <h2 className="text-sm font-semibold">Buyer details</h2>
            {reservation ? (
              <div className="mt-4 rounded-lg border border-[#fde7b0] bg-warning-soft/60 p-4 text-[13px]">
                <div className="flex items-center gap-2 font-medium"><Lock className="size-4" /> Completing reservation {reservation.reference}</div>
                <p className="mt-1 text-muted-foreground">
                  This vehicle is reserved for <strong className="text-foreground">{reservationCustomer?.name}</strong> ({reservationCustomer?.phone}). To sell to a different buyer, release the reservation from the vehicle page first.
                </p>
                <Field label="Buyer notes" htmlFor="ns-cnotes" className="mt-3">
                  <Textarea id="ns-cnotes" rows={2} {...form.register("customerNotes")} />
                </Field>
              </div>
            ) : (
              <>
                <p className="mt-1 mb-4 text-[13px] text-muted-foreground">Returning customers are matched by phone number.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <BuyerFields form={form} idPrefix="ns" />
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-sm font-semibold">Sale information</h2>
            <p className="mt-1 mb-4 text-[13px] text-muted-foreground">Payment status and balance are calculated from the amounts received.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sale date" htmlFor="ns-date" error={errors.saleDate?.message} required>
                <DateField id="ns-date" max={todayISO()} invalid={!!errors.saleDate} {...form.register("saleDate")} />
              </Field>
              <Field label="Agreed sale price" htmlFor="ns-price" error={errors.salePricePaise?.message} required hint={selected && `Asking ${formatINR(selected.askingPricePaise)}`}>
                <Controller control={form.control} name="salePricePaise" render={({ field }) => (
                  <CurrencyInput id="ns-price" value={field.value} onChange={(v) => field.onChange(v ?? undefined)} onBlur={field.onBlur} invalid={!!errors.salePricePaise} />
                )} />
              </Field>
              {reservation && (
                <Field label="Booking amount (already received)" htmlFor="ns-booking" hint={`Received on ${formatDate(reservation.reservationDate)} via ${PAYMENT_METHOD_LABELS[reservation.bookingMethod]}`}>
                  <CurrencyInput id="ns-booking" value={booking} onChange={() => undefined} disabled />
                </Field>
              )}
              <Field label={reservation ? "Amount received now" : "Amount received"} htmlFor="ns-received" error={errors.amountReceivedPaise?.message} required>
                <Controller control={form.control} name="amountReceivedPaise" render={({ field }) => (
                  <CurrencyInput id="ns-received" value={field.value} onChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} invalid={!!errors.amountReceivedPaise} />
                )} />
              </Field>
              <Field label="Payment mode" htmlFor="ns-method">
                <Controller control={form.control} name="paymentMethod" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ns-method"><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </Field>
              <Field label="Payment reference" htmlFor="ns-ref" error={errors.paymentReference?.message}>
                <Input id="ns-ref" placeholder="UTR / UPI / cheque no." {...form.register("paymentReference")} />
              </Field>
              <Field label="Sale notes" htmlFor="ns-notes" className="sm:col-span-2">
                <Textarea id="ns-notes" rows={2} {...form.register("notes")} />
              </Field>
              <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/60 p-3 text-[13px] sm:col-span-2">
                <div><div className="text-xs text-muted-foreground">Total received</div><div className="font-semibold tabular">{formatINR(totalReceived)}</div></div>
                <div><div className="text-xs text-muted-foreground">Balance due</div><div className="font-semibold tabular">{formatINR(balance)}</div></div>
                <div><div className="text-xs text-muted-foreground">Status</div><PaymentStatusBadge status={paymentStatusFor(values.salePricePaise ?? 0, totalReceived)} /></div>
              </div>
            </div>
          </div>
        )}

        {(step === 3 || step === 4) && selected && (
          <div className="grid gap-4">
            <div>
              <h2 className="text-sm font-semibold">{step === 3 ? "Review sale" : "Confirm sale"}</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {step === 3 ? "Check everything below before confirming." : "Confirming marks the vehicle as Sold and records the payment. This is recorded in the activity log."}
              </p>
            </div>
            <dl className="grid gap-x-8 gap-y-2.5 rounded-lg border p-4 text-[13px] sm:grid-cols-2">
              {[
                ["Vehicle", `${selected.year} ${vehicleTitle(selected)} · ${selected.registrationNumber}`],
                ["Kilometers", formatKm(selected.mileageKm)],
                ["Buyer", `${values.customerName} · ${values.customerPhone}`],
                ["Address", values.customerAddress || "—"],
                ["Sale date", formatDate(values.saleDate)],
                ["Agreed sale price", formatINR(values.salePricePaise ?? 0)],
                ...(reservation ? [["Booking received", formatINR(booking)]] : []),
                [reservation ? "Received now" : "Amount received", `${formatINR(values.amountReceivedPaise ?? 0)} · ${PAYMENT_METHOD_LABELS[values.paymentMethod]}`],
                ["Balance due", formatINR(balance)],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between gap-3 sm:block">
                  <dt className="text-muted-foreground sm:text-xs">{k}</dt>
                  <dd className="text-right font-medium sm:text-left">{val}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 sm:block">
                <dt className="text-muted-foreground sm:text-xs">Payment status</dt>
                <dd><PaymentStatusBadge status={paymentStatusFor(values.salePricePaise ?? 0, totalReceived)} /></dd>
              </div>
            </dl>
          </div>
        )}

        <div className="mt-8 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={() => (step > 0 ? setStep(step - 1) : dirty ? setLeaving(true) : router.push("/sales"))} disabled={saving}>
            <ArrowLeft /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < 4 ? (
            <Button onClick={next} disabled={step === 0 && !vehicleId}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button onClick={confirm} loading={saving}>
              <Check /> Confirm sale
            </Button>
          )}
        </div>
      </Card>
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Discard this sale?"
        description="You've entered details that haven't been saved. Leaving now will discard them."
        confirmLabel="Discard and leave"
        tone="destructive"
        onConfirm={() => router.push("/sales")}
      />
    </>
  );
}

function VehiclePicker({ candidates, selectedId, onSelect, error }: { candidates: VehicleView[]; selectedId: string | null; onSelect: (v: VehicleView) => void; error?: string }) {
  const [q, setQ] = React.useState("");
  const list = candidates.filter((c) => matchesSearch(c, q));
  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Select vehicle</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Only available and reserved vehicles can be sold.</p>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Search stock…" />
      </div>
      {error && <p className="mb-3 text-xs text-destructive" role="alert">{error}</p>}
      {candidates.length === 0 ? (
        <EmptyState icon={CarFront} title="No vehicles available to sell" description="All vehicles are sold. Add a purchase to restock." />
      ) : list.length === 0 ? (
        <EmptyState icon={CarFront} title="No matching vehicles" className="py-8" />
      ) : (
        <ul role="radiogroup" aria-label="Vehicles" className="grid gap-2 sm:grid-cols-2">
          {list.map((c) => {
            const active = c.vehicle.id === selectedId;
            return (
              <li key={c.vehicle.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSelect(c)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors outline-none hover:bg-[#fafbfc] focus-visible:ring-2 focus-visible:ring-ring/40",
                    active && "border-primary bg-primary-soft/50 ring-1 ring-primary/30",
                  )}
                >
                  <VehicleImage image={c.cover} alt="" className="h-14 w-20 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{c.vehicle.year} {vehicleTitle(c.vehicle)}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.vehicle.registrationNumber} · {formatINR(c.vehicle.askingPricePaise)}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <VehicleStatusBadge status={c.vehicle.status} />
                      {c.reservationCustomer && <span className="truncate text-[11px] text-muted-foreground">for {c.reservationCustomer.name}</span>}
                    </div>
                  </div>
                  {active && <CheckCircle2 className="size-5 shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SaleComplete({ saleId }: { saleId: string }) {
  const { idx } = useData();
  const sale = idx.sales.get(saleId);
  const payments = idx.paymentsBySale.get(saleId) ?? [];
  const latest = payments[payments.length - 1];
  const vehicle = sale ? idx.vehicles.get(sale.vehicleId) : undefined;
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
        <CheckCircle2 className="size-6" />
      </span>
      <h1 className="text-lg font-semibold">Sale completed</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {sale?.reference} · {vehicle ? `${vehicle.year} ${vehicleTitle(vehicle)}` : ""} is now marked as Sold.
      </p>
      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
        {latest && (
          <Button asChild variant="outline">
            <Link href={`/receipt/${latest.id}`} target="_blank"><Printer /> Print receipt</Link>
          </Button>
        )}
        <Button asChild>
          <Link href={`/sales/${saleId}`}>View sale</Link>
        </Button>
      </div>
    </Card>
  );
}
