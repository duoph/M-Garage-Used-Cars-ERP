"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, type FieldPath, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { purchaseFormSchema, type PurchaseFormInput } from "@/lib/validation/schemas";
import { dealerService } from "@/lib/services/dealer-service";
import { BusinessError } from "@/lib/repositories/contracts";
import { reportError } from "@/hooks/use-commands";
import { useCurrentUser } from "@/hooks/use-auth";
import { paymentStatusFor } from "@/lib/calculations/finance";
import { PAYMENT_METHODS } from "@/types";
import { FUEL_LABELS, PAYMENT_METHOD_LABELS, TRANSMISSION_LABELS, formatKm } from "@/lib/utils/labels";
import { formatDate, todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { formatRegistration } from "@/lib/utils/ids";
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
import { PaymentStatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { VehicleDetailsFields } from "@/features/inventory/vehicle-fields";
import { MultiImageUploader, toPreparedPhotos, type PendingPhoto } from "@/features/inventory/photos/multi-image-uploader";

const STEPS = [
  { key: "vehicle", label: "Vehicle details", short: "Car", hint: "Make, registration, kilometres and colour." },
  { key: "seller", label: "Seller", short: "Seller", hint: "Who sold this car to the showroom." },
  { key: "purchase", label: "Purchase", short: "Payment", hint: "The agreed price, and how much you have already paid the seller." },
  { key: "photos", label: "Photos", short: "Photos", hint: "Optional. You can add pictures later from the vehicle page." },
  { key: "review", label: "Review & save", short: "Review", hint: "Check everything, then add the car to stock." },
] as const;

const STEP_FIELDS: FieldPath<PurchaseFormInput>[][] = [
  ["make", "model", "variant", "year", "registrationNumber", "chassisNumber", "engineNumber", "fuelType", "transmission", "mileageKm", "color", "previousOwners", "notes"],
  ["sellerName", "sellerContact", "sellerAddress", "sellerNotes"],
  ["purchaseDate", "purchasePricePaise", "amountPaidPaise", "askingPricePaise", "paymentMethod", "paymentReference", "purchaseNotes"],
  [],
  [],
];

export function NewPurchasePage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [step, setStep] = React.useState(0);
  const [photos, setPhotos] = React.useState<PendingPhoto[]>([]);
  const [saving, setSaving] = React.useState(false);
  const topRef = React.useRef<HTMLDivElement>(null);

  const form = useForm<PurchaseFormInput>({
    resolver: zodResolver(purchaseFormSchema),
    mode: "onTouched",
    defaultValues: {
      make: "",
      model: "",
      variant: "",
      year: undefined as unknown as number,
      registrationNumber: "",
      chassisNumber: "",
      engineNumber: "",
      fuelType: undefined,
      transmission: undefined,
      mileageKm: undefined as unknown as number,
      color: "",
      previousOwners: 1,
      notes: "",
      sellerName: "",
      sellerContact: "",
      sellerAddress: "",
      sellerNotes: "",
      purchaseDate: todayISO(),
      purchasePricePaise: undefined as unknown as number,
      amountPaidPaise: 0,
      askingPricePaise: undefined as unknown as number,
      paymentMethod: "bank_transfer",
      paymentReference: "",
      purchaseNotes: "",
    },
  });
  const { errors, isDirty } = form.formState;
  const [leaving, setLeaving] = React.useState(false);
  const dirty = (isDirty || photos.length > 0) && !saving;
  useUnsavedGuard(dirty);

  // Revoke preview URLs when leaving the page.
  const photosRef = React.useRef(photos);
  React.useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  React.useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  const goTo = (s: number) => {
    setStep(s);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  async function next() {
    const ok = await form.trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (ok) goTo(step + 1);
  }

  async function save() {
    const valid = await form.trigger();
    if (!valid) {
      const firstBad = STEP_FIELDS.findIndex((fields) => fields.some((f) => form.getFieldState(f).invalid));
      goTo(Math.max(0, firstBad));
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const values = form.getValues();
      const { vehicleId } = await dealerService.createPurchase(user, purchaseFormSchema.parse(values), toPreparedPhotos(photos));
      toast.success("Purchase recorded and vehicle added to inventory");
      router.push(`/inventory/${vehicleId}`);
    } catch (e) {
      if (e instanceof BusinessError && e.field) {
        form.setError(e.field as FieldPath<PurchaseFormInput>, { message: e.message });
        const s = STEP_FIELDS.findIndex((fields) => fields.includes(e.field as FieldPath<PurchaseFormInput>));
        if (s >= 0) goTo(s);
      }
      reportError(e);
      setSaving(false);
    }
  }

  const v = useWatch({ control: form.control }) as PurchaseFormInput;
  const status = paymentStatusFor(v.purchasePricePaise ?? 0, v.amountPaidPaise ?? 0);

  return (
    <div ref={topRef} className="scroll-mt-20">
      <PageHeader
        title="New purchase"
        description="Record a vehicle bought by the showroom. It will be added to inventory as Available."
        breadcrumbs={[{ label: "Purchases", href: "/purchases" }, { label: "New purchase" }]}
      />

      <nav aria-label="Progress" className="mb-4">
        <div className="sm:hidden">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Step {step + 1} of {STEPS.length}
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight">{STEPS[step].label}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{STEPS[step].hint}</p>
          <ol className="mt-3 grid grid-cols-5 gap-1">
            {STEPS.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => i < step && goTo(i)}
                  disabled={i > step}
                  aria-current={i === step ? "step" : undefined}
                  aria-label={`Step ${i + 1}: ${s.label}`}
                  className="flex w-full flex-col items-center gap-1.5 disabled:cursor-default"
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full text-xs font-semibold",
                      i < step && "bg-primary text-primary-foreground",
                      i === step && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                      i > step && "border border-border bg-card text-muted-foreground",
                    )}
                  >
                    {i < step ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className={cn("text-[11px] leading-none", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>{s.short}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <ol className="hidden grid-cols-5 gap-3 sm:grid">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => i < step && goTo(i)}
                disabled={i > step}
                aria-current={i === step ? "step" : undefined}
                className="group w-full text-left disabled:cursor-default"
              >
                <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
                <div className="mt-2 flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      i < step ? "bg-primary text-primary-foreground" : i === step ? "border-2 border-primary text-primary" : "border text-muted-foreground",
                    )}
                  >
                    {i < step ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span className={cn("text-[13px] leading-tight font-medium", i === step ? "text-foreground" : "text-muted-foreground", i < step && "group-hover:text-foreground")}>
                    {s.label}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <Card className="p-4 sm:p-5">
        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {step === 0 && (
            <StepBody title="Vehicle details" description="Registration and chassis numbers are checked against existing stock to prevent duplicates.">
              <VehicleDetailsFields form={form} idPrefix="np" />
            </StepBody>
          )}
          {step === 1 && (
            <StepBody title="Seller information" description="Who sold the car to the showroom.">
              <Field label="Seller name" htmlFor="np-seller" error={errors.sellerName?.message} required>
                <Input id="np-seller" autoComplete="off" aria-invalid={!!errors.sellerName} {...form.register("sellerName")} />
              </Field>
              <Field label="Contact number" htmlFor="np-contact" error={errors.sellerContact?.message} required>
                <Input id="np-contact" type="tel" inputMode="tel" autoComplete="off" aria-invalid={!!errors.sellerContact} {...form.register("sellerContact")} />
              </Field>
              <Field label="Seller location / address" htmlFor="np-addr" error={errors.sellerAddress?.message} className="sm:col-span-2">
                <Input id="np-addr" placeholder="Optional" {...form.register("sellerAddress")} />
              </Field>
              <Field label="Additional notes" htmlFor="np-snotes" error={errors.sellerNotes?.message} className="sm:col-span-2">
                <Textarea id="np-snotes" rows={2} placeholder="Optional" {...form.register("sellerNotes")} />
              </Field>
            </StepBody>
          )}
          {step === 2 && (
            <StepBody title="Purchase information" description="Payment status is calculated from the amounts entered.">
              <Field label="Purchase date" htmlFor="np-date" error={errors.purchaseDate?.message} required>
                <DateField id="np-date" max={todayISO()} invalid={!!errors.purchaseDate} {...form.register("purchaseDate")} />
              </Field>
              <Field label="Purchase price" htmlFor="np-price" error={errors.purchasePricePaise?.message} required>
                <Controller control={form.control} name="purchasePricePaise" render={({ field }) => (
                  <CurrencyInput id="np-price" value={field.value} onChange={(x) => field.onChange(x ?? undefined)} onBlur={field.onBlur} invalid={!!errors.purchasePricePaise} />
                )} />
              </Field>
              <Field label="Amount paid to seller" htmlFor="np-paid" error={errors.amountPaidPaise?.message} required hint={<span className="flex items-center gap-1.5">Status: <PaymentStatusBadge status={status} /></span>}>
                <Controller control={form.control} name="amountPaidPaise" render={({ field }) => (
                  <CurrencyInput id="np-paid" value={field.value} onChange={(x) => field.onChange(x ?? 0)} onBlur={field.onBlur} invalid={!!errors.amountPaidPaise} />
                )} />
              </Field>
              <Field label="Asking price (listing)" htmlFor="np-asking" error={errors.askingPricePaise?.message} required hint="Price shown to sales staff and buyers">
                <Controller control={form.control} name="askingPricePaise" render={({ field }) => (
                  <CurrencyInput id="np-asking" value={field.value} onChange={(x) => field.onChange(x ?? undefined)} onBlur={field.onBlur} invalid={!!errors.askingPricePaise} />
                )} />
              </Field>
              <Field label="Payment method" htmlFor="np-method" error={errors.paymentMethod?.message}>
                <Controller control={form.control} name="paymentMethod" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="np-method"><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </Field>
              <Field label="Payment reference" htmlFor="np-pref" error={errors.paymentReference?.message}>
                <Input id="np-pref" placeholder="UTR / cheque no. (optional)" {...form.register("paymentReference")} />
              </Field>
              <Field label="Purchase notes" htmlFor="np-pnotes" error={errors.purchaseNotes?.message} className="sm:col-span-2">
                <Textarea id="np-pnotes" rows={2} placeholder="Optional — e.g. documents pending, loan closure" {...form.register("purchaseNotes")} />
              </Field>
            </StepBody>
          )}
          {step === 3 && (
            <div>
              <div className="mb-4 hidden sm:block">
                <h2 className="text-sm font-semibold">Vehicle photos</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Optional — you can add photos later from the vehicle page. Set a cover and drag to reorder.
                </p>
              </div>
              <MultiImageUploader value={photos} onChange={setPhotos} />
            </div>
          )}
          {step === 4 && <Review values={v} photos={photos} onEdit={goTo} status={status} />}
        </form>

        <div className="mt-8 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => (step > 0 ? goTo(step - 1) : dirty ? setLeaving(true) : router.push("/purchases"))} disabled={saving}>
            <ArrowLeft /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              {step === 3 && photos.length === 0 ? "Skip photos" : "Continue"} <ArrowRight />
            </Button>
          ) : (
            <Button type="button" onClick={save} loading={saving}>
              <Check /> Save purchase
            </Button>
          )}
        </div>
      </Card>
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Discard this purchase?"
        description="You've entered details that haven't been saved. Leaving now will discard them."
        confirmLabel="Discard and leave"
        tone="destructive"
        onConfirm={() => router.push("/purchases")}
      />
    </div>
  );
}

function StepBody({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 hidden sm:block">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function ReviewSection({ title, step, rows, onEdit }: { title: string; step: number; rows: [string, React.ReactNode][]; onEdit: (s: number) => void }) {
  return (
    <section className="rounded-lg border">
      <div className="flex items-center justify-between border-b bg-[#fafbfc] px-4 py-2.5">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <Button type="button" variant="link" size="sm" onClick={() => onEdit(step)}>Edit</Button>
      </div>
      <dl className="grid gap-x-6 gap-y-2.5 p-4 text-[13px] sm:grid-cols-2">
        {rows.map(([k, val]) => (
          <div key={k} className="flex justify-between gap-3 sm:block">
            <dt className="text-muted-foreground sm:text-xs">{k}</dt>
            <dd className="text-right font-medium sm:text-left">{val || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Review({ values: v, photos, onEdit, status }: { values: PurchaseFormInput; photos: PendingPhoto[]; onEdit: (s: number) => void; status: ReturnType<typeof paymentStatusFor> }) {
  return (
    <div className="grid gap-4">
      <div className="hidden sm:block">
        <h2 className="text-sm font-semibold">Review & save</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Check the details below. Saving creates the purchase record and an Available inventory vehicle.</p>
      </div>
      <ReviewSection onEdit={onEdit} title="Vehicle" step={0} rows={[
        ["Vehicle", `${v.year ?? ""} ${v.make} ${v.model}`],
        ["Variant", v.variant],
        ["Registration", v.registrationNumber ? formatRegistration(v.registrationNumber) : ""],
        ["VIN / chassis", v.chassisNumber?.toUpperCase()],
        ["Fuel / transmission", v.fuelType && v.transmission ? `${FUEL_LABELS[v.fuelType]} · ${TRANSMISSION_LABELS[v.transmission]}` : ""],
        ["Kilometers", v.mileageKm != null ? formatKm(v.mileageKm) : ""],
        ["Colour", v.color],
        ["Previous owners", String(v.previousOwners ?? "")],
      ]} />
      <ReviewSection onEdit={onEdit} title="Seller" step={1} rows={[["Name", v.sellerName], ["Contact", v.sellerContact], ["Address", v.sellerAddress]]} />
      <ReviewSection onEdit={onEdit} title="Purchase" step={2} rows={[
        ["Purchase date", formatDate(v.purchaseDate)],
        ["Purchase price", v.purchasePricePaise != null ? formatINR(v.purchasePricePaise) : ""],
        ["Amount paid", formatINR(v.amountPaidPaise ?? 0)],
        ["Payment status", <PaymentStatusBadge key="s" status={status} />],
        ["Asking price", v.askingPricePaise != null ? formatINR(v.askingPricePaise) : ""],
        ["Payment method", PAYMENT_METHOD_LABELS[v.paymentMethod]],
      ]} />
      <section className="rounded-lg border">
        <div className="flex items-center justify-between border-b bg-[#fafbfc] px-4 py-2.5">
          <h3 className="text-[13px] font-semibold">Photos ({photos.length})</h3>
          <Button type="button" variant="link" size="sm" onClick={() => onEdit(3)}>Edit</Button>
        </div>
        {photos.length === 0 ? (
          <p className="p-4 text-[13px] text-muted-foreground">No photos added.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto p-4">
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img key={p.id} src={p.previewUrl} alt={p.name} className={cn("h-16 w-24 shrink-0 rounded-md object-cover", p.isCover && "ring-2 ring-primary")} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
