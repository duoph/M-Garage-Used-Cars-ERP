"use client";
import { useParams } from "next/navigation";
import { FileText } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { saleTotals } from "@/lib/calculations/finance";
import { formatDate } from "@/lib/utils/dates";
import { invoiceNumber } from "@/lib/utils/ids";
import { formatINR } from "@/lib/utils/money";
import { FUEL_LABELS, PAYMENT_METHOD_LABELS, TRANSMISSION_LABELS, formatKm, vehicleTitle } from "@/lib/utils/labels";
import { paiseToWords } from "@/lib/utils/words";
import { AmountRows, DocumentNotFound, Letterhead, PrintPage, Signature, usePrintGate } from "@/features/documents/print-layout";

/** Sale invoice: buyer, the car with its identifying numbers, the price, and payments received so far. */
export function InvoicePage() {
  const { saleId } = useParams<{ saleId: string }>();
  const { ds, idx } = useData();
  const { user, can } = useAuth();
  const gate = usePrintGate("receipts.print");
  if (gate) return gate;

  const sale = idx.sales.get(saleId);
  if (!sale || (!can("sales.viewAll") && sale.soldBy !== user?.id))
    return <DocumentNotFound icon={FileText} title="Invoice not found" href="/sales" label="Back to sales" />;

  const vehicle = idx.vehicles.get(sale.vehicleId);
  const customer = idx.customers.get(sale.customerId);
  const payments = idx.paymentsBySale.get(sale.id) ?? [];
  const totals = saleTotals(sale, payments);
  const s = ds.settings;
  // The shared terms are written for receipts; drop a "not a tax invoice" sentence so the invoice doesn't contradict itself.
  const terms = s.receiptTerms
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !/not a tax invoice/i.test(sentence))
    .join(" ");

  return (
    <PrintPage back={{ href: `/sales/${sale.id}`, label: "Back to sale" }}>
      <Letterhead title="Invoice">
        {invoiceNumber(sale.reference)}
        <br />
        {formatDate(sale.saleDate, "dd MMM yyyy")}
      </Letterhead>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs text-[#6b7280]">Bill to</p>
          <p className="font-semibold">{customer?.name}</p>
          <p>
            {customer?.phone}
            {customer?.address && <><br />{customer.address}</>}
          </p>
        </div>
        {vehicle && (
          <div>
            <p className="text-xs text-[#6b7280]">Vehicle</p>
            <p className="font-semibold">{vehicle.year} {vehicleTitle(vehicle)} {vehicle.variant}</p>
            <p>
              {vehicle.registrationNumber}, {vehicle.color}, {formatKm(vehicle.mileageKm)}
              <br />
              {FUEL_LABELS[vehicle.fuelType]}, {TRANSMISSION_LABELS[vehicle.transmission]}
              {vehicle.chassisNumber && <><br />Chassis {vehicle.chassisNumber}</>}
              {vehicle.engineNumber && <><br />Engine {vehicle.engineNumber}</>}
            </p>
          </div>
        )}
      </div>

      <div className="mt-10">
        <AmountRows
          rows={[
            { label: "Total", value: formatINR(sale.salePricePaise), strong: true, note: paiseToWords(sale.salePricePaise) },
            ...payments.map((p, i) => ({
              label: `${formatDate(p.date, "dd MMM yyyy")}, ${PAYMENT_METHOD_LABELS[p.method]}, ${p.receiptNumber}`,
              value: `− ${formatINR(p.amountPaise)}`,
              gap: i === 0,
            })),
            { label: "Balance due", value: formatINR(totals.balancePaise), strong: true, gap: payments.length === 0 },
          ]}
        />
      </div>
      {sale.status === "cancelled" && <p className="mt-4 text-xs text-[#b91c1c]">This sale was cancelled on {formatDate(sale.cancelledAt?.slice(0, 10), "dd MMM yyyy")}.</p>}

      {terms && <p className="mt-10 text-xs text-[#6b7280]">{terms}</p>}
      <Signature />

      <footer className="mt-12 text-xs text-[#6b7280]">
        {s.receiptFooter && <p>{s.receiptFooter}</p>}
        <p>Sale {sale.reference}</p>
      </footer>
    </PrintPage>
  );
}
