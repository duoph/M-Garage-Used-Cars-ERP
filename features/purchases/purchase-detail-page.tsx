"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, Pencil, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { purchaseEditSchema, type PurchaseEditInput } from "@/lib/validation/schemas";
import { paymentStatusFor, purchaseBalance, purchasePaymentStatus } from "@/lib/calculations/finance";
import { vehicleView } from "@/lib/calculations/selectors";
import { canCancelPurchase } from "@/lib/calculations/state";
import { PAYMENT_METHODS, type Purchase, type Vehicle } from "@/types";
import { formatDate, formatDateTime, todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { FUEL_LABELS, PAYMENT_METHOD_LABELS, TRANSMISSION_LABELS, formatKm, vehicleTitle } from "@/lib/utils/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/form-field";
import { CurrencyInput } from "@/components/shared/currency-input";
import { DateField } from "@/components/shared/date-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { PaymentStatusBadge, PurchaseStatusBadge, VehicleStatusBadge } from "@/components/shared/status-badge";
import { ActivityFeed } from "@/features/activity/activity-feed";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children || "—"}</dd>
    </div>
  );
}

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const [editing, setEditing] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const purchase = idx.purchases.get(id);

  if (!purchase)
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Purchase not found"
        action={<Button asChild variant="outline"><Link href="/purchases">Back to purchases</Link></Button>}
        className="py-24"
      />
    );

  const vehicle = idx.vehicles.get(purchase.vehicleId);
  const view = vehicle ? vehicleView(vehicle, idx) : undefined;
  const status = purchasePaymentStatus(purchase);
  const cancelCheck = canCancelPurchase(vehicle);
  const editable = can("purchases.manage") && purchase.status === "active";

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {purchase.reference} <PurchaseStatusBadge status={purchase.status} />
          </span>
        }
        description={`Purchased on ${formatDate(purchase.purchaseDate)} from ${purchase.sellerName}`}
        breadcrumbs={[{ label: "Purchases", href: "/purchases" }, { label: purchase.reference }]}
        actions={
          editable && (
            <>
              <Button variant="outline" onClick={() => setCancelling(true)} disabled={!cancelCheck.ok} title={cancelCheck.ok ? undefined : cancelCheck.message}>
                <Ban /> Cancel purchase
              </Button>
              <Button onClick={() => setEditing(true)}><Pencil /> Edit purchase</Button>
            </>
          )
        }
      />
      {purchase.status === "cancelled" && (
        <p className="mb-4 rounded-lg border border-[#f6d2cf] bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
          Cancelled on {formatDateTime(purchase.cancelledAt)} — {purchase.cancelReason}
        </p>
      )}
      {editable && !cancelCheck.ok && (
        <p className="mb-4 text-xs text-muted-foreground">Cancellation unavailable: {cancelCheck.message}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-1"><CardTitle>Purchase transaction</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <dl className="divide-y">
                <Row label="Purchase price">{formatINR(purchase.purchasePricePaise)}</Row>
                <Row label="Amount paid">{formatINR(purchase.amountPaidPaise)}</Row>
                <Row label="Balance owed to seller">
                  <span className={purchaseBalance(purchase) > 0 ? "text-warning" : ""}>{formatINR(purchaseBalance(purchase))}</span>
                </Row>
                <Row label="Payment status"><PaymentStatusBadge status={status} /></Row>
              </dl>
              <dl className="divide-y">
                <Row label="Payment method">{PAYMENT_METHOD_LABELS[purchase.paymentMethod]}</Row>
                <Row label="Payment reference">{purchase.paymentReference}</Row>
                <Row label="Recorded by">{idx.users.get(purchase.createdBy)?.name}</Row>
                <Row label="Last updated">{formatDateTime(purchase.updatedAt)}</Row>
              </dl>
            </div>
            {purchase.notes && <p className="mt-3 rounded-lg bg-muted/60 p-3 text-[13px]">{purchase.notes}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle>Seller</CardTitle></CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label="Name">{purchase.sellerName}</Row>
              <Row label="Contact">{purchase.sellerContact}</Row>
              <Row label="Location">{purchase.sellerAddress}</Row>
            </dl>
            {purchase.sellerNotes && <p className="mt-2 text-[13px] text-muted-foreground">{purchase.sellerNotes}</p>}
          </CardContent>
        </Card>

        {vehicle && view && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle>Vehicle</CardTitle>
              <Link href={`/inventory/${vehicle.id}`} className="text-xs font-medium text-primary hover:underline">Open in inventory</Link>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row">
                <VehicleImage image={view.cover} alt={vehicleTitle(vehicle)} className="aspect-[16/10] w-full shrink-0 rounded-lg sm:w-52" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold">{vehicle.year} {vehicleTitle(vehicle)}</span>
                    <VehicleStatusBadge status={vehicle.status} archived={!!vehicle.archivedAt} />
                  </div>
                  <p className="text-[13px] text-muted-foreground">{vehicle.variant} · {vehicle.registrationNumber} · {vehicle.stockNumber}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
                    {[["Kilometers", formatKm(vehicle.mileageKm)], ["Fuel", FUEL_LABELS[vehicle.fuelType]], ["Gearbox", TRANSMISSION_LABELS[vehicle.transmission]], ["Asking", formatINR(vehicle.askingPricePaise)]].map(([k, val]) => (
                      <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{val}</dd></div>
                    ))}
                  </dl>
                  <dl className="mt-3 divide-y border-t">
                    <Row label="Vehicle expenses">{formatINR(view.expensesPaise)}</Row>
                    <Row label="Landed cost">{formatINR(view.landedCostPaise)}</Row>
                    {can("finance.viewProfit") && view.profitPaise !== null && (
                      <Row label="Realised gross profit">
                        <span className={view.profitPaise >= 0 ? "text-success" : "text-destructive"}>{formatINR(view.profitPaise)}</span>
                      </Row>
                    )}
                  </dl>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-0"><CardTitle>History</CardTitle></CardHeader>
          <div className="px-4">
            <ActivityFeed limit={20} compact filter={(e) => e.entityId === purchase.id || e.entityId === purchase.vehicleId} />
          </div>
        </Card>
      </div>

      {editable && (
        <EditPurchaseDialog purchase={purchase} vehicle={vehicle} open={editing} onOpenChange={setEditing} />
      )}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this purchase?"
        description="The purchase is kept for the record and marked cancelled. Its vehicle is archived and removed from active stock. This cannot be undone."
        confirmLabel="Cancel purchase"
        tone="destructive"
        requireReason
        onConfirm={async (reason) => {
          try {
            await dealerService.cancelPurchase(user, purchase.id, reason);
            toast.success("Purchase cancelled");
          } catch (e) {
            reportError(e);
            return false;
          }
        }}
      />
    </>
  );
}

function EditPurchaseDialog({ purchase, vehicle, open, onOpenChange }: { purchase: Purchase; vehicle: Vehicle | undefined; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <EditBody purchase={purchase} vehicle={vehicle} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function EditBody({ purchase, vehicle, onDone }: { purchase: Purchase; vehicle: Vehicle | undefined; onDone: () => void }) {
  const user = useCurrentUser();
  const sold = vehicle?.status === "sold";
  const isAdmin = user.role === "admin";
  const [reason, setReason] = React.useState("");
  const form = useForm<PurchaseEditInput>({
    resolver: zodResolver(purchaseEditSchema),
    defaultValues: {
      sellerName: purchase.sellerName,
      sellerContact: purchase.sellerContact,
      sellerAddress: purchase.sellerAddress,
      sellerNotes: purchase.sellerNotes,
      purchaseDate: purchase.purchaseDate,
      purchasePricePaise: purchase.purchasePricePaise,
      amountPaidPaise: purchase.amountPaidPaise,
      paymentMethod: purchase.paymentMethod,
      paymentReference: purchase.paymentReference,
      notes: purchase.notes,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const price = useWatch({ control: form.control, name: "purchasePricePaise" });
  const paid = useWatch({ control: form.control, name: "amountPaidPaise" });
  const financialChanged = price !== purchase.purchasePricePaise || paid !== purchase.amountPaidPaise;
  const lockFinancials = sold && !isAdmin;

  async function onSubmit(values: PurchaseEditInput) {
    try {
      await dealerService.updatePurchase(user, purchase.id, values, sold && financialChanged ? reason : undefined);
      toast.success("Purchase updated");
      onDone();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <DialogContent className="sm:max-w-2xl">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>Edit purchase {purchase.reference}</DialogTitle>
          <DialogDescription>Vehicle specifications are edited from the inventory page.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          {sold && (
            <p className="rounded-lg border border-[#fde7b0] bg-warning-soft px-3 py-2 text-[13px] text-[#7a3e06] sm:col-span-2">
              {isAdmin
                ? "This vehicle has been sold. Changing purchase figures is an authorised correction and needs a reason; it will change the recorded profit."
                : "This vehicle has been sold. Only an Admin / Owner can correct its purchase figures."}
            </p>
          )}
          <Field label="Seller name" htmlFor="ep-seller" error={errors.sellerName?.message} required>
            <Input id="ep-seller" {...form.register("sellerName")} aria-invalid={!!errors.sellerName} />
          </Field>
          <Field label="Seller contact" htmlFor="ep-contact" error={errors.sellerContact?.message} required>
            <Input id="ep-contact" type="tel" {...form.register("sellerContact")} aria-invalid={!!errors.sellerContact} />
          </Field>
          <Field label="Seller address" htmlFor="ep-addr" className="sm:col-span-2">
            <Input id="ep-addr" {...form.register("sellerAddress")} />
          </Field>
          <Field label="Purchase date" htmlFor="ep-date" error={errors.purchaseDate?.message} required>
            <DateField id="ep-date" max={todayISO()} {...form.register("purchaseDate")} invalid={!!errors.purchaseDate} />
          </Field>
          <Field label="Payment method" htmlFor="ep-method">
            <Controller control={form.control} name="paymentMethod" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="ep-method"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </Field>
          <Field label="Purchase price" htmlFor="ep-price" error={errors.purchasePricePaise?.message} required>
            <Controller control={form.control} name="purchasePricePaise" render={({ field }) => (
              <CurrencyInput id="ep-price" value={field.value} onChange={(v) => field.onChange(v ?? undefined)} onBlur={field.onBlur} disabled={lockFinancials} invalid={!!errors.purchasePricePaise} />
            )} />
          </Field>
          <Field
            label="Amount paid"
            htmlFor="ep-paid"
            error={errors.amountPaidPaise?.message}
            required
            hint={<span className="flex items-center gap-1.5">Status: <PaymentStatusBadge status={paymentStatusFor(price ?? 0, paid ?? 0)} /></span>}
          >
            <Controller control={form.control} name="amountPaidPaise" render={({ field }) => (
              <CurrencyInput id="ep-paid" value={field.value} onChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} disabled={lockFinancials} invalid={!!errors.amountPaidPaise} />
            )} />
          </Field>
          <Field label="Payment reference" htmlFor="ep-ref" className="sm:col-span-2">
            <Input id="ep-ref" {...form.register("paymentReference")} />
          </Field>
          <Field label="Purchase notes" htmlFor="ep-notes" className="sm:col-span-2">
            <Textarea id="ep-notes" rows={2} {...form.register("notes")} />
          </Field>
          {sold && isAdmin && financialChanged && (
            <Field label="Correction reason" htmlFor="ep-reason" required className="sm:col-span-2" error={reason.trim().length > 0 && reason.trim().length < 5 ? "At least 5 characters" : undefined}>
              <Textarea id="ep-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Seller invoice amount was entered incorrectly" />
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} disabled={sold && isAdmin && financialChanged && reason.trim().length < 5}>
            Save changes
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
