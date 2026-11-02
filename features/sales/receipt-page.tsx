"use client";
import { useParams } from "next/navigation";
import { Receipt } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { saleTotals } from "@/lib/calculations/finance";
import { formatDate } from "@/lib/utils/dates";
import { formatINR, sumPaise } from "@/lib/utils/money";
import { PAYMENT_METHOD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { paiseToWords } from "@/lib/utils/words";
import { AmountRows, DocumentNotFound, Letterhead, PrintPage, Signature, usePrintGate } from "@/features/documents/print-layout";

/** Print-optimised payment receipt. This is a payment acknowledgement, not a GST tax invoice. */
export function ReceiptPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const { ds, idx } = useData();
  const { user, can } = useAuth();
  const gate = usePrintGate("receipts.print");
  if (gate) return gate;

  const payment = ds.payments.find((p) => p.id === paymentId);
  const sale = payment ? idx.sales.get(payment.saleId) : undefined;
  if (!payment || !sale || (!can("sales.viewAll") && sale.soldBy !== user?.id))
    return <DocumentNotFound icon={Receipt} title="Receipt not found" href="/sales" label="Back to sales" />;

  const vehicle = idx.vehicles.get(sale.vehicleId);
  const customer = idx.customers.get(sale.customerId);
  const salePayments = idx.paymentsBySale.get(sale.id) ?? [];
  // Lines paid together (cash + UPI + loan…) share one receipt number and print on one receipt.
  const lines = salePayments.filter((p) => p.receiptNumber === payment.receiptNumber);
  const total = sumPaise(lines.map((p) => p.amountPaise));
  // Totals as at this receipt: payments up to and including its last line.
  const last = Math.max(...lines.map((l) => salePayments.findIndex((p) => p.id === l.id)));
  const upto = salePayments.slice(0, last + 1);
  const receivedToDate = sumPaise(upto.map((p) => p.amountPaise));
  const balanceAfter = Math.max(0, sale.salePricePaise - receivedToDate);
  const accountName = (id: string | null | undefined) => (id ? idx.accounts.get(id)?.name : undefined);
  const current = saleTotals(sale, salePayments);
  const s = ds.settings;

  return (
    <PrintPage back={{ href: `/sales/${sale.id}`, label: "Back to sale" }}>
      <Letterhead title="Receipt">
        {payment.receiptNumber}
        <br />
        {formatDate(payment.date, "dd-MM-yyyy")}
      </Letterhead>

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

      <div className="mt-8">
        <AmountRows
          rows={[
            { label: "Amount received", value: formatINR(total), strong: true, note: paiseToWords(total) },
            ...lines.map((l) => ({
              label:
                l.method === "finance"
                  ? `Loan from ${l.lenderName || "lender"}${l.loanReference ? `, ${l.loanReference}` : ""}`
                  : `${PAYMENT_METHOD_LABELS[l.method]}${l.reference ? `, ${l.reference}` : ""}${accountName(l.accountId) ? ` → ${accountName(l.accountId)}` : ""}`,
              value: formatINR(l.amountPaise),
            })),
            { label: "Sale price", value: formatINR(sale.salePricePaise), gap: true },
            { label: "Paid so far", value: formatINR(receivedToDate) },
            { label: "Balance due", value: formatINR(balanceAfter), strong: true },
          ]}
        />
      </div>
      {sale.status === "cancelled" && <p className="mt-4 text-xs text-[#b91c1c]">This sale was later cancelled.</p>}
      {current.receivedPaise !== receivedToDate && (
        <p className="mt-4 text-xs text-[#6b7280]">Figures as at this receipt. Current balance: {formatINR(current.balancePaise)}.</p>
      )}

      {s.receiptTerms && <p className="mt-10 text-xs text-[#6b7280]">{s.receiptTerms}</p>}
      <Signature />

      <footer className="mt-12 text-xs text-[#6b7280]">
        {s.receiptFooter && <p>{s.receiptFooter}</p>}
        <p>
          Sale {sale.reference}, {formatDate(sale.saleDate, "dd MMM yyyy")}
          {/* Only add the disclaimer when the showroom's own terms don't already say it. */}
          {!/tax invoice/i.test(s.receiptTerms) && ". This is a payment receipt, not a tax invoice."}
        </p>
      </footer>
    </PrintPage>
  );
}
