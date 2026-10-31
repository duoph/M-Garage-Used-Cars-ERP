"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { FileSignature } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { saleTotals } from "@/lib/calculations/finance";
import { formatDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { FUEL_LABELS, INSURANCE_TYPE_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { paiseToWords } from "@/lib/utils/words";
import { DocumentNotFound, Letterhead, PrintPage, usePrintGate } from "@/features/documents/print-layout";

/**
 * Sale letter / delivery note handed over with the car: vehicle details, price, the papers given to
 * the buyer, and the transfer of responsibility from the delivery date and time.
 */
export function SaleLetterPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const { ds, idx } = useData();
  const { user, can } = useAuth();
  const [time, setTime] = React.useState("");
  const gate = usePrintGate("receipts.print");
  if (gate) return gate;

  const sale = idx.sales.get(saleId);
  if (!sale || (!can("sales.viewAll") && sale.soldBy !== user?.id))
    return <DocumentNotFound icon={FileSignature} title="Sale not found" href="/sales" label="Back to sales" />;
  const vehicle = idx.vehicles.get(sale.vehicleId);
  const buyer = idx.customers.get(sale.customerId);
  const totals = saleTotals(sale, idx.paymentsBySale.get(sale.id) ?? []);
  const papers = vehicle?.papers;
  const s = ds.settings;

  const specs: [string, React.ReactNode][] = vehicle
    ? [
        ["Make / model", `${vehicleTitle(vehicle)} ${vehicle.variant}`.trim()],
        ["Registration no.", vehicle.registrationNumber],
        ["Chassis no.", vehicle.chassisNumber || "—"],
        ["Engine no.", vehicle.engineNumber || "—"],
        ["Year / fuel", `${vehicle.year} · ${FUEL_LABELS[vehicle.fuelType]}`],
        ["Colour", vehicle.color],
        ["Odometer", `${new Intl.NumberFormat("en-IN").format(vehicle.mileageKm)} km`],
        ["Insurance", papers && papers.insuranceType !== "none" ? `${INSURANCE_TYPE_LABELS[papers.insuranceType]}${papers.insuranceCompany ? `, ${papers.insuranceCompany}` : ""}${papers.insuranceValidTill ? `, valid till ${formatDate(papers.insuranceValidTill, "dd MMM yyyy")}` : ""}` : "—"],
        ["Hypothecation", papers?.hypothecated ? `${papers.financierName}${papers.nocReceived ? " (NOC received)" : " (NOC pending)"}` : "None"],
      ]
    : [];

  const handed = [
    ["Original RC", papers?.rcInHand],
    ["Insurance copy", papers ? papers.insuranceType !== "none" : undefined],
    ["Pollution certificate", papers ? !!papers.pucValidTill : undefined],
    ["Spare key", papers?.spareKey],
    ["Service records", papers?.serviceRecords],
    ["Bank NOC / Form 35", papers?.hypothecated ? papers.nocReceived : undefined],
    ["Form 29 / 30 (signed)", undefined],
  ] as const;

  return (
    <PrintPage
      back={{ href: `/sales/${sale.id}`, label: "Back to sale" }}
      actions={
        <label className="flex items-center gap-2 text-sm">
          Delivery time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded-md border bg-card px-2" />
        </label>
      }
    >
      <Letterhead title="Sale Letter">
        {sale.reference}
        <br />
        {formatDate(sale.saleDate, "dd MMM yyyy")}
      </Letterhead>

      <p className="mt-10">
        We, <strong className="font-semibold">{s.legalName || s.showroomName}</strong>, have this day sold the vehicle described below to{" "}
        <strong className="font-semibold">{buyer?.name}</strong>
        {buyer?.phone && ` (${buyer.phone})`}
        {buyer?.address && `, ${buyer.address}`}, for a total consideration of <strong className="font-semibold">{formatINR(sale.salePricePaise)}</strong> ({paiseToWords(sale.salePricePaise)}).
      </p>

      <table className="mt-6 w-full border-collapse text-[13px]">
        <tbody>
          {specs.map(([k, v]) => (
            <tr key={k} className="border-b border-[#e5e7eb]">
              <th className="w-44 py-1.5 pr-4 text-left font-normal text-[#6b7280]">{k}</th>
              <td className="py-1.5">{v}</td>
            </tr>
          ))}
          <tr className="border-b border-[#e5e7eb]">
            <th className="py-1.5 pr-4 text-left font-normal text-[#6b7280]">Received so far</th>
            <td className="py-1.5">{formatINR(totals.receivedPaise)}{totals.balancePaise > 0 && ` · balance ${formatINR(totals.balancePaise)}`}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-6 text-[13px]">
        The vehicle, with the documents marked below, was delivered to the buyer on {formatDate(sale.saleDate, "dd MMM yyyy")} at{" "}
        {time || "________"} hrs. From this date and time the buyer is responsible for the vehicle, including any traffic offence,
        accident, theft or legal proceedings. Any such liability before delivery remains with the seller. The buyer has inspected the
        vehicle and accepts it in its present condition. Registration transfer will be completed through the RTO on submission of the
        signed forms{totals.balancePaise > 0 ? " and after the balance is paid" : ""}.
      </p>

      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold tracking-wide text-[#6b7280] uppercase">Documents handed over</p>
        <ul className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[13px]">
          {handed.map(([label, given]) => (
            <li key={label} className="flex items-center gap-2">
              <span className="flex size-4 items-center justify-center border border-[#6b7280] text-[11px] leading-none">{given ? "✓" : ""}</span>
              {label}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-24 grid grid-cols-2 gap-16 text-xs">
        <div className="border-t border-[#9ca3af] pt-2">
          Buyer: {buyer?.name}
          <p className="text-[#6b7280]">Signature &amp; date</p>
        </div>
        <div className="border-t border-[#9ca3af] pt-2 text-right">
          For {s.showroomName}
          <p className="text-[#6b7280]">Authorised signatory</p>
        </div>
      </div>
      <div className="mt-16 grid grid-cols-2 gap-16 text-xs text-[#6b7280]">
        <div className="border-t border-[#d1d5db] pt-2">Witness 1</div>
        <div className="border-t border-[#d1d5db] pt-2 text-right">Witness 2</div>
      </div>
    </PrintPage>
  );
}
