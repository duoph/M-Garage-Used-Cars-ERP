"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer, Receipt } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { useHydrated } from "@/hooks/use-hydrated";
import { useImageUrl } from "@/hooks/use-image-url";
import { saleTotals } from "@/lib/calculations/finance";
import { formatDate } from "@/lib/utils/dates";
import { formatINR, sumPaise } from "@/lib/utils/money";
import { PAYMENT_METHOD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { paiseToWords } from "@/lib/utils/words";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { AccessDenied } from "@/components/shared/access-denied";
import { BootScreen } from "@/components/shared/boot-screen";
import { LogoMark } from "@/components/shared/logo";

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

  const logo = useImageUrl(ds.settings.logoKey);

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

  return (
    <div className="min-h-dvh bg-[#eef0f3] py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
        <Button variant="ghost" asChild>
          <Link href={`/sales/${sale.id}`}><ArrowLeft /> Back to sale</Link>
        </Button>
        <Button onClick={() => window.print()}><Printer /> Print / Save as PDF</Button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-10 py-10 text-[13px] text-[#111827] shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-[#111827] pb-5">
          <div className="flex items-start gap-3">
            {logo.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL from local storage
              <img src={logo.url} alt="" className="size-14 object-contain" />
            ) : (
              <LogoMark className="size-12" />
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight">{s.showroomName}</h1>
              {s.legalName && <p className="text-xs text-[#4b5563]">{s.legalName}</p>}
              <p className="mt-1 text-xs leading-relaxed text-[#4b5563]">
                {s.address}
                {s.city && <><br />{s.city}</>}
                <br />
                Ph: {s.phone} · {s.email}
                {s.gstin && <><br />GSTIN: {s.gstin}</>}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tracking-wide uppercase">Payment Receipt</p>
            <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-[#6b7280]">Receipt no.</dt><dd className="font-semibold">{payment.receiptNumber}</dd>
              <dt className="text-[#6b7280]">Receipt date</dt><dd className="font-semibold">{formatDate(payment.date, "dd MMM yyyy")}</dd>
              <dt className="text-[#6b7280]">Sale ref.</dt><dd className="font-semibold">{sale.reference}</dd>
              <dt className="text-[#6b7280]">Sale date</dt><dd className="font-semibold">{formatDate(sale.saleDate, "dd MMM yyyy")}</dd>
            </dl>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <h2 className="mb-1.5 text-[11px] font-semibold tracking-wider text-[#6b7280] uppercase">Received from</h2>
            <p className="text-sm font-semibold">{customer?.name}</p>
            <p className="text-xs text-[#4b5563]">{customer?.phone}</p>
            {customer?.address && <p className="text-xs text-[#4b5563]">{customer.address}</p>}
          </div>
          <div>
            <h2 className="mb-1.5 text-[11px] font-semibold tracking-wider text-[#6b7280] uppercase">Vehicle</h2>
            {vehicle && (
              <>
                <p className="text-sm font-semibold">{vehicle.year} {vehicleTitle(vehicle)} {vehicle.variant}</p>
                <p className="text-xs text-[#4b5563]">Registration: <strong>{vehicle.registrationNumber}</strong></p>
                {vehicle.chassisNumber && <p className="text-xs text-[#4b5563]">Chassis: {vehicle.chassisNumber}</p>}
                <p className="text-xs text-[#4b5563]">Colour: {vehicle.color}</p>
              </>
            )}
          </div>
        </section>

        <table className="mt-6 w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-[#d1d5db] bg-[#f9fafb] text-left text-[11px] tracking-wider text-[#6b7280] uppercase">
              <th className="px-3 py-2 font-semibold">Description</th>
              <th className="px-3 py-2 text-right font-semibold">Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="tabular">
            <tr className="border-b border-[#e5e7eb]">
              <td className="px-3 py-2.5">Agreed sale price of vehicle</td>
              <td className="px-3 py-2.5 text-right">{formatINR(sale.salePricePaise)}</td>
            </tr>
            <tr className="border-b border-[#e5e7eb] font-semibold">
              <td className="px-3 py-2.5">
                Amount received with this receipt
                <div className="text-xs font-normal text-[#6b7280]">
                  {payment.kind === "booking" ? "Booking amount · " : ""}{PAYMENT_METHOD_LABELS[payment.method]}{payment.reference ? ` · Ref: ${payment.reference}` : ""}
                </div>
              </td>
              <td className="px-3 py-2.5 text-right">{formatINR(payment.amountPaise)}</td>
            </tr>
            <tr className="border-b border-[#e5e7eb]">
              <td className="px-3 py-2.5">Total received to date ({upto.length} payment{upto.length === 1 ? "" : "s"})</td>
              <td className="px-3 py-2.5 text-right">{formatINR(receivedToDate)}</td>
            </tr>
            <tr className="border-b-2 border-[#111827] font-bold">
              <td className="px-3 py-2.5">Balance due</td>
              <td className="px-3 py-2.5 text-right">{formatINR(balanceAfter)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs"><span className="text-[#6b7280]">Amount received in words:</span> <strong>{paiseToWords(payment.amountPaise)}</strong></p>
        {sale.status === "cancelled" && <p className="mt-2 text-xs font-semibold text-[#b91c1c]">Note: this sale was subsequently cancelled.</p>}
        {current.receivedPaise !== receivedToDate && (
          <p className="mt-1 text-[11px] text-[#6b7280]">Figures are as at this receipt. Current balance: {formatINR(current.balancePaise)}.</p>
        )}

        {s.receiptTerms && (
          <section className="mt-6 rounded border border-[#e5e7eb] p-3 text-[11px] leading-relaxed text-[#4b5563]">
            <p className="mb-0.5 font-semibold text-[#111827]">Terms</p>
            {s.receiptTerms}
          </section>
        )}

        <section className="mt-14 grid grid-cols-2 gap-10 text-xs">
          <div>
            <div className="border-t border-[#9ca3af] pt-1.5">Buyer&apos;s signature</div>
            <p className="mt-0.5 text-[#6b7280]">I acknowledge the details above are correct.</p>
          </div>
          <div className="text-right">
            <div className="border-t border-[#9ca3af] pt-1.5">For {s.showroomName}</div>
            <p className="mt-0.5 text-[#6b7280]">Authorised signatory</p>
          </div>
        </section>

        <footer className="mt-10 border-t border-[#e5e7eb] pt-3 text-center text-[11px] text-[#6b7280]">
          {s.receiptFooter && <p>{s.receiptFooter}</p>}
          <p className="mt-0.5">This is a payment acknowledgement and not a tax invoice.</p>
        </footer>
      </article>
    </div>
  );
}
