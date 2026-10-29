"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Printer, Receipt } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { useHydrated } from "@/hooks/use-hydrated";
import { saleTotals } from "@/lib/calculations/finance";
import { formatDate } from "@/lib/utils/dates";
import { formatINR, sumPaise } from "@/lib/utils/money";
import { PAYMENT_METHOD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { paiseToWords } from "@/lib/utils/words";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { AccessDenied } from "@/components/shared/access-denied";
import { BootScreen } from "@/components/shared/boot-screen";
import { ShowroomLogo } from "@/components/shared/showroom-logo";

/** Print-optimised payment receipt. This is a payment acknowledgement, not a GST tax invoice. */
export function ReceiptPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const { ds, idx } = useData();
  const { user, can } = useAuth();
  const router = useRouter();
  const hydrated = useHydrated();
  React.useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  if (!hydrated || !user) return <BootScreen />;
  if (!can("receipts.print")) return <AccessDenied />;

  const payment = ds.payments.find((p) => p.id === paymentId);
  const sale = payment ? idx.sales.get(payment.saleId) : undefined;
  if (!payment || !sale || (!can("sales.viewAll") && sale.soldBy !== user.id))
    return (
      <EmptyState icon={Receipt} title="Receipt not found" action={<Button asChild variant="outline"><Link href="/sales">Back to sales</Link></Button>} className="py-24" />
    );

  const vehicle = idx.vehicles.get(sale.vehicleId);
  const customer = idx.customers.get(sale.customerId);
  const salePayments = idx.paymentsBySale.get(sale.id) ?? [];
  // Totals as at this receipt: payments up to and including this one.
  const upto = salePayments.slice(0, salePayments.findIndex((p) => p.id === payment.id) + 1);
  const receivedToDate = sumPaise(upto.map((p) => p.amountPaise));
  const balanceAfter = Math.max(0, sale.salePricePaise - receivedToDate);
  const current = saleTotals(sale, salePayments);
  const s = ds.settings;

  const hasLogo = !!s.logoKey;

  return (
    <div className="min-h-dvh bg-[#eef0f3] py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
        <Button variant="ghost" asChild>
          <Link href={`/sales/${sale.id}`}><ArrowLeft /> Back to sale</Link>
        </Button>
        <div className="flex items-center gap-2">
          {!hasLogo && can("settings.manage") && (
            <Button variant="outline" asChild>
              <Link href="/settings"><ImagePlus /> Add your logo</Link>
            </Button>
          )}
          <Button onClick={() => window.print()}><Printer /> Print / Save as PDF</Button>
        </div>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-6 py-8 text-[13px] text-[#111827] shadow-sm sm:px-12 sm:py-12 print:max-w-none print:p-0 print:shadow-none">
        {/* Showroom on the left, receipt number and date on the right. */}
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <ShowroomLogo className="size-16" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">{s.showroomName}</h1>
              <p className="mt-0.5 text-xs leading-relaxed text-[#6b7280]">
                {s.address}
                {s.city && <>, {s.city}</>}
                <br />
                {s.phone} · {s.email}
                {s.gstin && <> · GSTIN {s.gstin}</>}
              </p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold tracking-[0.2em] text-[#6b7280] uppercase">Receipt</p>
            <p className="mt-1 text-base font-bold tabular">{payment.receiptNumber}</p>
            <p className="text-xs text-[#6b7280]">{formatDate(payment.date, "dd MMM yyyy")}</p>
          </div>
        </header>

        <hr className="my-6 border-[#e5e7eb]" />

        <section className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium tracking-wider text-[#6b7280] uppercase">Received from</p>
            <p className="mt-1 text-sm font-semibold">{customer?.name}</p>
            <p className="text-xs text-[#6b7280]">
              {customer?.phone}
              {customer?.address && <> · {customer.address}</>}
            </p>
          </div>
          {vehicle && (
            <div>
              <p className="text-[11px] font-medium tracking-wider text-[#6b7280] uppercase">For vehicle</p>
              <p className="mt-1 text-sm font-semibold">{vehicle.year} {vehicleTitle(vehicle)} {vehicle.variant}</p>
              <p className="text-xs text-[#6b7280]">
                {vehicle.registrationNumber}
                {vehicle.chassisNumber && <> · Chassis {vehicle.chassisNumber}</>}
              </p>
            </div>
          )}
        </section>

        {/* The one number that matters, large. */}
        <section className="mt-6 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-5 py-4 print:[print-color-adjust:exact]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs text-[#6b7280]">{payment.kind === "booking" ? "Booking amount received" : "Amount received"}</p>
            <p className="text-2xl font-bold tracking-tight tabular">{formatINR(payment.amountPaise)}</p>
          </div>
          <p className="mt-1 text-xs text-[#374151]">{paiseToWords(payment.amountPaise)}</p>
          <p className="mt-1 text-xs text-[#6b7280]">
            Paid by {PAYMENT_METHOD_LABELS[payment.method]}
            {payment.reference && <> · Ref. {payment.reference}</>}
          </p>
        </section>

        <dl className="mt-5 grid gap-2 text-[13px] tabular sm:ml-auto sm:max-w-xs">
          <div className="flex justify-between gap-6">
            <dt className="text-[#6b7280]">Sale price</dt>
            <dd>{formatINR(sale.salePricePaise)}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-[#6b7280]">Paid so far</dt>
            <dd>{formatINR(receivedToDate)}</dd>
          </div>
          <div className="flex justify-between gap-6 border-t border-[#e5e7eb] pt-2 font-bold">
            <dt>Balance due</dt>
            <dd>{formatINR(balanceAfter)}</dd>
          </div>
        </dl>
        {sale.status === "cancelled" && <p className="mt-3 text-xs font-semibold text-[#b91c1c]">Note: this sale was later cancelled.</p>}
        {current.receivedPaise !== receivedToDate && (
          <p className="mt-2 text-[11px] text-[#6b7280] sm:text-right">Figures as at this receipt. Current balance: {formatINR(current.balancePaise)}.</p>
        )}

        {s.receiptTerms && <p className="mt-8 text-[11px] leading-relaxed text-[#6b7280]">{s.receiptTerms}</p>}

        <section className="mt-14 grid grid-cols-2 gap-10 text-xs text-[#6b7280]">
          <div className="border-t border-[#9ca3af] pt-1.5">Customer signature</div>
          <div className="border-t border-[#9ca3af] pt-1.5 text-right">For {s.showroomName}</div>
        </section>

        <footer className="mt-10 text-center text-[11px] text-[#9ca3af]">
          {s.receiptFooter && <p className="text-[#6b7280]">{s.receiptFooter}</p>}
          <p className="mt-0.5">
            Sale {sale.reference} · {formatDate(sale.saleDate, "dd MMM yyyy")}
            {/* Only add the disclaimer when the showroom's own terms don't already say it. */}
            {!/tax invoice/i.test(s.receiptTerms) && " · This is a payment receipt, not a tax invoice."}
          </p>
        </footer>
      </article>
    </div>
  );
}
