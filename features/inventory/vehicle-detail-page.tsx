"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CarFront, ClipboardList, Pencil, Plus, Receipt, Undo2, Wallet } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { useDialogStore } from "@/lib/store/dialogs";
import { vehicleView, type VehicleView } from "@/lib/calculations/selectors";
import { purchasePaymentStatus } from "@/lib/calculations/finance";
import { formatDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { EXPENSE_CATEGORY_LABELS, FUEL_LABELS, PAYMENT_METHOD_LABELS, TRANSMISSION_LABELS, formatKm, vehicleTitle } from "@/lib/utils/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumbs } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FinancialValue } from "@/components/shared/financial-value";
import { RoleGuard } from "@/components/shared/role-guard";
import { PaymentStatusBadge, ReservationStatusBadge, SaleStatusBadge, VehicleStatusBadge } from "@/components/shared/status-badge";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { VehiclePhotoGallery } from "./photos/vehicle-photo-gallery";
import { useVehicleActions } from "./vehicle-actions";
import { VehicleLifecycle } from "./lifecycle";
import { GLOSSARY, InfoTip } from "@/components/shared/info-tip";
import { DocumentsCard } from "@/features/documents/documents-card";
import { PapersCard } from "./papers-card";

export function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { idx } = useData();
  const vehicle = idx.vehicles.get(id);
  if (!vehicle)
    return (
      <EmptyState
        icon={CarFront}
        title="Vehicle not found"
        description="It may have been removed, or the link is incorrect."
        action={<Button asChild variant="outline"><Link href="/inventory">Back to inventory</Link></Button>}
        className="py-24"
      />
    );
  return <VehicleDetail view={vehicleView(vehicle, idx)} key={vehicle.id} />;
}

function Row({ label, children, info }: { label: string; children: React.ReactNode; info?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-[13px]">
      <dt className="flex items-center gap-1 text-muted-foreground">
        {label}
        {info && <InfoTip text={info} label={`About ${label}`} />}
      </dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function VehicleDetail({ view }: { view: VehicleView }) {
  const { idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const openExpense = useDialogStore((s) => s.openExpense);
  const { actions: a, dialogs } = useVehicleActions(view);
  const v = view.vehicle;
  const title = `${v.year} ${vehicleTitle(v)}`;
  const purchase = view.purchase;
  const reservations = (idx.reservationsByVehicle.get(v.id) ?? []).slice().sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const sales = (idx.salesByVehicle.get(v.id) ?? []).slice().sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const visibleSales = sales.filter((s) => can("sales.viewAll") || s.soldBy === user.id);

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Inventory", href: "/inventory" }, { label: title }]} />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight sm:text-[22px]">{title}</h1>
              <VehicleStatusBadge status={v.status} archived={!!v.archivedAt} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span>{v.variant}</span>
              <span aria-hidden>·</span>
              <span className="rounded border bg-card px-1.5 font-mono text-xs text-foreground">{v.registrationNumber}</span>
              <span aria-hidden>·</span>
              <span>{v.stockNumber}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" asChild>
              <Link href="/inventory"><ArrowLeft /> Inventory</Link>
            </Button>
            {a.canEdit && <Button variant="outline" onClick={a.edit}><Pencil /> Edit</Button>}
            {a.canRelease && <Button variant="outline" onClick={a.release}><Undo2 /> Release</Button>}
            {a.canReserve && <Button variant="outline" onClick={a.reserve}><ClipboardList /> Reserve</Button>}
            {a.canSell && <Button onClick={a.sell}><Receipt /> {view.reservation ? "Complete sale" : "Sell"}</Button>}
            {a.canViewSale && <Button variant="outline" onClick={a.viewSale}><Receipt /> View sale</Button>}
          </div>
        </div>
        {v.archivedAt && (
          <p className="mt-3 rounded-lg border border-[#f6d2cf] bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            This vehicle was archived because its purchase was cancelled. It is kept for record-keeping only.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <VehiclePhotoGallery vehicle={v} images={view.images} title={title} />

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="pb-3">
                <div className="text-xs text-muted-foreground">Asking price</div>
                <div className="text-2xl font-semibold tracking-tight tabular">{formatINR(v.askingPricePaise)}</div>
              </div>
              <dl className="divide-y border-t">
                {view.sale && <Row label="Actual sale price"><FinancialValue paise={view.sale.salePricePaise} /></Row>}
                <RoleGuard permission="finance.viewCost">
                  <Row label="Purchase price"><FinancialValue paise={purchase?.purchasePricePaise ?? 0} /></Row>
                  <Row label="Vehicle expenses"><FinancialValue paise={view.expensesPaise} /></Row>
                  <Row label="Total landed cost" info={GLOSSARY.landedCost}><FinancialValue paise={view.landedCostPaise} className="font-semibold" /></Row>
                </RoleGuard>
                <RoleGuard permission="finance.viewProfit">
                  {view.profitPaise !== null ? (
                    <Row label="Gross profit" info={GLOSSARY.grossProfit}>
                      <FinancialValue paise={view.profitPaise} signed className="font-semibold" />
                      {view.marginPct !== null && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({view.marginPct}%)</span>}
                    </Row>
                  ) : (
                    <Row label="Potential margin at asking" info="Asking price minus landed cost — what the car would earn if sold at the listed price.">
                      <FinancialValue paise={v.askingPricePaise - view.landedCostPaise} signed />
                    </Row>
                  )}
                </RoleGuard>
              </dl>
            </CardContent>
          </Card>

          <Card className="px-3 py-4">
            <VehicleLifecycle view={view} />
          </Card>

          <Card>
            <CardHeader className="pb-1"><CardTitle>Key details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                {[
                  ["Kilometers", formatKm(v.mileageKm)],
                  ["Fuel", FUEL_LABELS[v.fuelType]],
                  ["Transmission", TRANSMISSION_LABELS[v.transmission]],
                  ["Owners", v.previousOwners === 0 ? "New" : `${v.previousOwners}`],
                  ["Colour", v.color],
                  ["In stock", v.status === "sold" ? `Sold after ${view.stockAgeDays} days` : `${view.stockAgeDays} days`],
                ].map(([k, val]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{val}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {view.reservation && (
            <Card className="border-[#fde7b0] bg-warning-soft/40">
              <CardHeader className="pb-1"><CardTitle>Reserved for {view.reservationCustomer?.name}</CardTitle></CardHeader>
              <CardContent className="text-[13px]">
                <dl className="divide-y">
                  <Row label="Since">{formatDate(view.reservation.reservationDate)}</Row>
                  <Row label="Contact">{view.reservationCustomer?.phone}</Row>
                  <Row label="Booking amount"><FinancialValue paise={view.reservation.bookingAmountPaise} /></Row>
                </dl>
                {view.reservation.notes && <p className="mt-2 text-muted-foreground">{view.reservation.notes}</p>}
              </CardContent>
            </Card>
          )}

          <PapersCard vehicle={v} />
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Specifications</TabsTrigger>
          <TabsTrigger value="sales">Sales & bookings</TabsTrigger>
          {can("expenses.view") && (
            <TabsTrigger value="expenses">
              Expenses <span className="rounded-full bg-muted px-1.5 text-[11px] tabular">{view.expenses.length}</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-1"><CardTitle>Specifications</CardTitle></CardHeader>
              <CardContent>
                <dl className="divide-y">
                  <Row label="Make / model">{vehicleTitle(v)}</Row>
                  <Row label="Variant">{v.variant || "—"}</Row>
                  <Row label="Manufacturing year">{v.year}</Row>
                  <Row label="Registration">{v.registrationNumber}</Row>
                  <Row label="VIN / chassis">{v.chassisNumber || "—"}</Row>
                  <Row label="Engine number">{v.engineNumber || "—"}</Row>
                  <Row label="Fuel">{FUEL_LABELS[v.fuelType]}</Row>
                  <Row label="Transmission">{TRANSMISSION_LABELS[v.transmission]}</Row>
                  <Row label="Kilometers">{formatKm(v.mileageKm)}</Row>
                  <Row label="Colour">{v.color}</Row>
                  <Row label="Previous owners">{v.previousOwners}</Row>
                </dl>
                {v.notes && (
                  <div className="mt-3 rounded-lg bg-muted/60 p-3 text-[13px]">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Notes</div>
                    {v.notes}
                  </div>
                )}
              </CardContent>
            </Card>
            <RoleGuard
              permission="purchases.view"
              fallback={
                <Card>
                  <CardHeader className="pb-1"><CardTitle>Stock information</CardTitle></CardHeader>
                  <CardContent>
                    <dl className="divide-y">
                      <Row label="Stock number">{v.stockNumber}</Row>
                      <Row label="Added to stock">{formatDate(purchase?.purchaseDate ?? v.createdAt)}</Row>
                    </dl>
                  </CardContent>
                </Card>
              }
            >
              {purchase && (
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle>Purchase</CardTitle>
                    <Link href={`/purchases/${purchase.id}`} className="text-xs font-medium text-primary hover:underline">Open purchase</Link>
                  </CardHeader>
                  <CardContent>
                    <dl className="divide-y">
                      <Row label="Reference">{purchase.reference}</Row>
                      <Row label="Purchase date">{formatDate(purchase.purchaseDate)}</Row>
                      <Row label="Seller">{purchase.sellerName}</Row>
                      <Row label="Seller contact">{purchase.sellerContact}</Row>
                      <Row label="Purchase price"><FinancialValue paise={purchase.purchasePricePaise} permission="finance.viewCost" /></Row>
                      <Row label="Amount paid"><FinancialValue paise={purchase.amountPaidPaise} permission="finance.viewCost" /></Row>
                      <Row label="Payment status"><PaymentStatusBadge status={purchasePaymentStatus(purchase)} /></Row>
                      <Row label="Payment method">{PAYMENT_METHOD_LABELS[purchase.paymentMethod]}</Row>
                    </dl>
                  </CardContent>
                </Card>
              )}
            </RoleGuard>
            <DocumentsCard
              ownerType="vehicle"
              ownerId={v.id}
              includeVehicleId={v.id}
              title="Car papers"
              description="RC, insurance, PUC, NOC and every ID proof or sale letter on this car's purchase and sale."
              checklist={["rc", "insurance", "puc", ...(v.papers?.hypothecated ? (["noc"] as const) : [])]}
              className="lg:col-span-2"
            />
          </div>
        </TabsContent>

        <TabsContent value="sales">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-1"><CardTitle>Sale</CardTitle></CardHeader>
              <CardContent>
                {visibleSales.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-muted-foreground">
                    {v.status === "sold" ? "Sale details are visible to the seller and finance team." : "This vehicle hasn't been sold yet."}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {visibleSales.map((s) => {
                      const c = idx.customers.get(s.customerId);
                      const totals = s.id === view.sale?.id ? view.saleTotals : undefined;
                      return (
                        <li key={s.id} className="py-2">
                          <div className="flex items-center justify-between gap-2">
                            <Link href={`/sales/${s.id}`} className="text-[13px] font-medium hover:underline">{s.reference}</Link>
                            <SaleStatusBadge status={s.status} />
                          </div>
                          <dl className="divide-y">
                            <Row label="Buyer">{c?.name} · {c?.phone}</Row>
                            <Row label="Sale date">{formatDate(s.saleDate)}</Row>
                            <Row label="Sale price">{formatINR(s.salePricePaise)}</Row>
                            {totals && (
                              <>
                                <Row label="Amount received">{formatINR(totals.receivedPaise)}</Row>
                                <Row label="Balance due">
                                  <span className={totals.balancePaise > 0 ? "text-warning" : ""}>{formatINR(totals.balancePaise)}</span>
                                </Row>
                                <Row label="Payment status"><PaymentStatusBadge status={totals.paymentStatus} /></Row>
                              </>
                            )}
                            {s.status === "cancelled" && <Row label="Cancellation reason">{s.cancelReason}</Row>}
                          </dl>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle>Bookings / reservations</CardTitle></CardHeader>
              <CardContent>
                {reservations.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-muted-foreground">No reservations recorded.</p>
                ) : (
                  <ul className="divide-y">
                    {reservations.map((r) => {
                      const c = idx.customers.get(r.customerId);
                      return (
                        <li key={r.id} className="py-2.5 text-[13px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{c?.name ?? "Buyer"}</span>
                            <ReservationStatusBadge status={r.status} />
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {r.reference} · {formatDate(r.reservationDate)} · Booking {formatINR(r.bookingAmountPaise)}
                            {r.cancelReason && ` · ${r.cancelReason}`}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {can("expenses.view") && (
          <TabsContent value="expenses">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Vehicle-specific expenses</CardTitle>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Total <FinancialValue paise={view.expensesPaise} className="font-medium text-foreground" /> · included in landed cost
                  </p>
                </div>
                {a.canExpense && (
                  <Button size="sm" variant="outline" onClick={() => openExpense({ vehicleId: v.id })}>
                    <Plus /> Add expense
                  </Button>
                )}
              </CardHeader>
              {view.expenses.length === 0 ? (
                <EmptyState icon={Wallet} title="No expenses for this vehicle" description="Repairs, detailing and paperwork costs added here raise the landed cost." className="py-8" />
              ) : (
                <ul className="divide-y border-t">
                  {view.expenses.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{e.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {EXPENSE_CATEGORY_LABELS[e.category]} · {formatDate(e.date)} {e.vendor && `· ${e.vendor}`}
                        </div>
                      </div>
                      <FinancialValue paise={e.amountPaise} className="font-medium" />
                      {can("expenses.manage") && (
                        <Button variant="ghost" size="icon-sm" aria-label="Edit expense" onClick={() => openExpense({ expenseId: e.id })}>
                          <Pencil />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>
        )}

        <TabsContent value="activity">
          <Card className="px-4">
            <ActivityFeed
              limit={50}
              filter={(e) => e.href === `/inventory/${v.id}` || e.entityId === v.id || e.entityId === v.purchaseId || sales.some((s) => s.id === e.entityId || e.href === `/sales/${s.id}`)}
              emptyText="Changes to this vehicle will be listed here."
            />
          </Card>
        </TabsContent>
      </Tabs>
      {dialogs}
    </>
  );
}
