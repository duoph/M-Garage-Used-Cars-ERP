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

      <article className="mx-auto max-w-[210mm] bg-white px-6 py-8 text-sm leading-relaxed text-[#111827] sm:px-14 sm:py-14 print:max-w-none print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="flex items-start gap-4">
            {hasLogo && <ShowroomLogo className="size-14" />}
            <div>
              <h1 className="text-base font-semibold">{s.showroomName}</h1>
              <p className="text-xs text-[#6b7280]">
                {s.address}
                {s.city && `, ${s.city}`}
                <br />
                {s.phone}, {s.email}
                {s.gstin && <><br />GSTIN {s.gstin}</>}
              </p>
            </div>
          </div>
          <div className="sm:text-right">
            <h2 className="text-base font-semibold">Receipt</h2>
            <p className="text-xs text-[#6b7280]">
              {payment.receiptNumber}
              <br />
              {formatDate(payment.date, "dd MMM yyyy")}
            </p>
          </div>
        </header>

        <p className="mt-10">
          Received from <strong className="font-semibold">{customer?.name}</strong>
          {customer?.phone && ` (${customer.phone})`}
          {vehicle && (
            <>
              {" "}towards {payment.kind === "booking" ? "booking of" : "the purchase of"}{" "}
              <strong className="font-semibold">{vehicle.year} {vehicleTitle(vehicle)} {vehicle.variant}</strong>, {vehicle.registrationNumber}
              {vehicle.chassisNumber && `, chassis ${vehicle.chassisNumber}`}
            </>
          )}
          .
        </p>

        <dl className="mt-8 grid grid-cols-[1fr_auto] gap-x-8 gap-y-2 tabular">
          <dt className="font-semibold">Amount received</dt>
          <dd className="text-right font-semibold">{formatINR(payment.amountPaise)}</dd>
          <dd className="col-span-2 -mt-1.5 text-xs text-[#6b7280]">{paiseToWords(payment.amountPaise)}</dd>
          <dt className="text-[#6b7280]">Payment method</dt>
          <dd className="text-right">
            {PAYMENT_METHOD_LABELS[payment.method]}
            {payment.reference && `, ${payment.reference}`}
          </dd>
          <dt className="mt-4 text-[#6b7280]">Sale price</dt>
          <dd className="mt-4 text-right">{formatINR(sale.salePricePaise)}</dd>
          <dt className="text-[#6b7280]">Paid so far</dt>
          <dd className="text-right">{formatINR(receivedToDate)}</dd>
          <dt className="font-semibold">Balance due</dt>
          <dd className="text-right font-semibold">{formatINR(balanceAfter)}</dd>
        </dl>
        {sale.status === "cancelled" && <p className="mt-4 text-xs text-[#b91c1c]">This sale was later cancelled.</p>}
        {current.receivedPaise !== receivedToDate && (
          <p className="mt-4 text-xs text-[#6b7280]">Figures as at this receipt. Current balance: {formatINR(current.balancePaise)}.</p>
        )}

        {s.receiptTerms && <p className="mt-10 text-xs text-[#6b7280]">{s.receiptTerms}</p>}

        <div className="mt-16 text-right text-xs">
          <p>For {s.showroomName}</p>
          <p className="mt-12 text-[#6b7280]">Authorised signatory</p>
        </div>

        <footer className="mt-12 text-xs text-[#6b7280]">
          {s.receiptFooter && <p>{s.receiptFooter}</p>}
          <p>
            Sale {sale.reference}, {formatDate(sale.saleDate, "dd MMM yyyy")}
            {/* Only add the disclaimer when the showroom's own terms don't already say it. */}
            {!/tax invoice/i.test(s.receiptTerms) && ". This is a payment receipt, not a tax invoice."}
          </p>
        </footer>
      </article>
    </div>
  );
}
