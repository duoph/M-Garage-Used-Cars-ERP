"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileText, Pencil, Receipt } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { quoteTotals } from "@/lib/calculations/finance";
import { formatDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { FUEL_LABELS, TRANSMISSION_LABELS, formatKm, vehicleTitle } from "@/lib/utils/labels";
import { paiseToWords } from "@/lib/utils/words";
import { Button } from "@/components/ui/button";
import { AmountRows, DocumentNotFound, Letterhead, PrintPage, Signature, usePrintGate } from "@/features/documents/print-layout";
import { canEditQuote, canSellFromQuote } from "./quote-utils";

/** Printable quotation: the car, its price, extra charges, discount and the total payable. */
export function QuoteDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { ds, idx } = useData();
  const { user, can } = useAuth();
  const gate = usePrintGate("receipts.print");
  if (gate) return gate;

  const quote = ds.quotes.find((q) => q.id === id);
  if (!quote || !user || (!can("sales.viewAll") && quote.createdBy !== user.id))
    return <DocumentNotFound icon={FileText} title="Quote not found" href="/quotes" label="Back to quotes" />;

  const vehicle = idx.vehicles.get(quote.vehicleId);
  const totals = quoteTotals(quote);
  const s = ds.settings;

  return (
    <PrintPage
      back={{ href: "/quotes", label: "Back to quotes" }}
      actions={
        <>
          {canEditQuote(quote, user) && (
            <Button variant="outline" asChild>
              <Link href={`/quotes/${quote.id}`}><Pencil /> Edit</Link>
            </Button>
          )}
          {canSellFromQuote(quote, vehicle, user) && (
            <Button variant="outline" asChild>
              <Link href={`/sales/new?quote=${quote.id}`}><Receipt /> Record sale</Link>
            </Button>
          )}
        </>
      }
    >
      <Letterhead title="Quotation">
        {quote.reference}
        <br />
        {formatDate(quote.quoteDate, "dd MMM yyyy")}
      </Letterhead>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs text-[#6b7280]">Prepared for</p>
          <p className="font-semibold">{quote.customerName}</p>
          <p>
            {quote.customerPhone}
            {quote.customerAddress && <><br />{quote.customerAddress}</>}
          </p>
        </div>
        {vehicle && (
          <div>
            <p className="text-xs text-[#6b7280]">Vehicle</p>
            <p className="font-semibold">{vehicle.year} {vehicleTitle(vehicle)} {vehicle.variant}</p>
            <p>
              {vehicle.registrationNumber}, {vehicle.color}, {formatKm(vehicle.mileageKm)}
              <br />
              {FUEL_LABELS[vehicle.fuelType]}, {TRANSMISSION_LABELS[vehicle.transmission]}, {vehicle.previousOwners <= 1 ? "first owner" : `${vehicle.previousOwners} owners`}
            </p>
          </div>
        )}
      </div>

      <div className="mt-10">
        <AmountRows
          rows={[
            { label: "Vehicle price", value: formatINR(quote.vehiclePricePaise) },
            ...quote.extras.map((e) => ({ label: e.description, value: formatINR(e.amountPaise) })),
            ...(quote.discountPaise > 0 ? [{ label: "Discount", value: `− ${formatINR(quote.discountPaise)}` }] : []),
            { label: "Total", value: formatINR(totals.totalPaise), strong: true, gap: true, note: paiseToWords(totals.totalPaise) },
          ]}
        />
      </div>

      {quote.notes && <p className="mt-8 whitespace-pre-line">{quote.notes}</p>}
      <p className="mt-10 text-xs text-[#6b7280]">
        This quotation is valid until {formatDate(quote.validUntil, "dd MMM yyyy")} and depends on the vehicle still being available.
      </p>
      <Signature />

      {s.receiptFooter && <footer className="mt-12 text-xs text-[#6b7280]">{s.receiptFooter}</footer>}
    </PrintPage>
  );
}
