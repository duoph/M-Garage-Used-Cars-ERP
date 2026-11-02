"use client";
import * as React from "react";
import { Noto_Sans_Malayalam } from "next/font/google";
import { useData } from "@/components/providers/data-provider";
import { ShowroomLogo } from "@/components/shared/showroom-logo";
import { Wordmark } from "@/components/shared/logo";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { FUEL_LABELS, PAYMENT_METHOD_LABELS, TRANSMISSION_LABELS, formatKm, vehicleTitle } from "@/lib/utils/labels";
import { paiseToWords } from "@/lib/utils/words";
import { AmountRows, Letterhead, Signature } from "@/features/documents/print-layout";
import type { BusinessSettings, Customer, InvoiceTemplateId, Sale, SalePayment, Vehicle } from "@/types";

/** The Malayalam terms print in Noto Sans Malayalam so they look the same on every computer. */
const malayalam = Noto_Sans_Malayalam({ subsets: ["malayalam"], weight: ["400", "600"], variable: "--font-malayalam" });

/** Everything an invoice layout needs, worked out once by the invoice page. */
export interface InvoiceData {
  number: string;
  sale: Sale;
  vehicle: Vehicle | undefined;
  customer: Customer | undefined;
  payments: SalePayment[];
  paidPaise: number;
  balancePaise: number;
  terms: string;
}

export const INVOICE_TEMPLATE_INFO: Record<InvoiceTemplateId, { label: string; description: string }> = {
  mgarage: { label: "M Garage", description: "Showroom format with Malayalam terms and bank details" },
  classic: { label: "Classic", description: "Plain letterhead, generous spacing" },
  modern: { label: "Modern", description: "Coloured header band and detail table" },
  compact: { label: "Compact", description: "Dense layout that fits on half a page" },
  bold: { label: "Bold", description: "Large title and a prominent balance due" },
};

export function InvoiceDocument({ template, data }: { template: InvoiceTemplateId; data: InvoiceData }) {
  const Layout = LAYOUTS[template] ?? MGarageInvoice;
  return <Layout {...data} />;
}

const LAYOUTS: Record<InvoiceTemplateId, (d: InvoiceData) => React.ReactNode> = {
  mgarage: MGarageInvoice,
  classic: ClassicInvoice,
  modern: ModernInvoice,
  compact: CompactInvoice,
  bold: BoldInvoice,
};

// ─── Shared bits ───────────────────────────────────────────────────────────────

/** Keeps coloured backgrounds when printing (browsers drop them by default). */
const keepColour = "[print-color-adjust:exact] [-webkit-print-color-adjust:exact]";

function vehicleLines(v: Vehicle): { label: string; value: string }[] {
  return [
    { label: "Registration", value: v.registrationNumber },
    { label: "Colour", value: v.color },
    { label: "Odometer", value: formatKm(v.mileageKm) },
    { label: "Fuel / gearbox", value: `${FUEL_LABELS[v.fuelType]}, ${TRANSMISSION_LABELS[v.transmission]}` },
    ...(v.chassisNumber ? [{ label: "Chassis no.", value: v.chassisNumber }] : []),
    ...(v.engineNumber ? [{ label: "Engine no.", value: v.engineNumber }] : []),
  ];
}

function paymentLabel(p: SalePayment) {
  const detail = p.method === "finance" ? ` (${p.lenderName || "lender"}${p.loanReference ? `, ${p.loanReference}` : ""})` : p.reference ? ` (${p.reference})` : "";
  return `${formatDate(p.date, "dd-MM-yyyy")}, ${PAYMENT_METHOD_LABELS[p.method]}${detail}, ${p.receiptNumber}`;
}

function Cancelled({ sale }: { sale: Sale }) {
  if (sale.status !== "cancelled") return null;
  return <p className="mt-4 text-xs text-[#b91c1c]">This sale was cancelled on {formatDate(sale.cancelledAt?.slice(0, 10), "dd MMM yyyy")}.</p>;
}

function Footer({ sale, className }: { sale: Sale; className?: string }) {
  const s = useData().ds.settings;
  return (
    <footer className={cn("text-xs text-[#6b7280]", className)}>
      {s.receiptFooter && <p>{s.receiptFooter}</p>}
      <p>Sale {sale.reference}</p>
    </footer>
  );
}

function contactLine(s: BusinessSettings) {
  return [s.phone, s.email].filter(Boolean).join(" · ");
}

// ─── M Garage (showroom format) ────────────────────────────────────────────────

/** Printed in Malayalam on the M Garage format, two columns under "നിബന്ധനകൾ". */
const MALAYALAM_TERMS = [
  "ബുക്കിംഗ് ചെയ്യുന്നതിന് മുമ്പായി വാഹനത്തിന്റെ ഡോക്യുമെന്റുകൾ പരിശോധിച്ചും വാഹനം ഓടിച്ചു നോക്കിയും ഗുണനിലവാരം ഉറപ്പുവരുത്തേണ്ടതാണ്.",
  "ബുക്കിംഗ് തുക തിരികെ നൽകുന്നതല്ല. പകരം മറ്റു വാഹനങ്ങളിലേക്ക് മാറ്റി എടുക്കാവുന്നതാണ്. പരമാവധി 7 ദിവസം വരെ വാഹനം ഹോൾഡ് ചെയ്യുന്നതാണ്.",
  "ഫിനാൻസ് ചെയ്യുന്ന വാഹനം ഫിനാൻസ് കമ്പനിയുടെ ഡെലിവറി ഓർഡർ അല്ലെങ്കിൽ കൺഫർമേഷൻ ലെറ്റർ ലഭിച്ചതിന് ശേഷം മാത്രമേ ഡെലിവറി ചെയ്യുകയുള്ളൂ.",
  "നിങ്ങളുടെ നിലവിലുള്ള വാഹനം എം ഗാരേജ് കാറുമായി എക്സ്ചേഞ്ച് ചെയ്യുമ്പോൾ വാഹനത്തിന് പരമാവധി വില ലഭിക്കുന്നതിന് നിങ്ങളുടെ വാഹനത്തിന്റെ ഗുണനിലവാരം വിധേയമായും നിങ്ങൾ തിരഞ്ഞെടുക്കുന്ന വാഹനത്തിനനുസരിച്ചുമാണ്.",
  "ചെക്ക് പെയ്മെന്റ് ചെയ്യുമ്പോൾ ക്ലിയറൻസിന് ശേഷമേ ഡെലിവറി അനുവദിക്കുകയുള്ളൂ. ഡെലിവറി എടുക്കുന്നതിന് മുമ്പായി ബാലൻസ് തുക അക്കൗണ്ടിലേക്ക് ട്രാൻസ്ഫർ ചെയ്യേണ്ടതാണ്.",
  "ആർ.സി. പേരിൽ മാറുന്നതിന് വേണ്ടി ട്രാൻസ്ഫർ ഫോമിൽ ഒപ്പ് വെച്ച് മൊബൈൽ നമ്പർ ഒ.ടി.പി., ആധാർ കാർഡ് അറ്റെസ്റ്റഡ് കോപ്പി ഡെലിവറി സമയത്ത് സമർപ്പിക്കേണ്ടതാണ്.",
];

const red = cn("bg-[#e31e24] text-white", keepColour);
const grey = cn("bg-[#e5e7eb] text-[#e31e24]", keepColour);
/** Whole rupees, no symbol, as the showroom writes them: 730000. */
const rupees = (paise: number) => String(Math.round(paise / 100));

function MGarageInvoice({ number, sale, vehicle, customer, payments, paidPaise, balancePaise }: InvoiceData) {
  const { ds, idx } = useData();
  const s = ds.settings;
  const dse = idx.users.get(sale.soldBy)?.name ?? "";
  const financed = payments.some((p) => p.method === "finance");
  const bank = ds.accounts.find((a) => a.kind === "bank" && a.isDefault && !a.archived) ?? ds.accounts.find((a) => a.kind === "bank" && !a.archived);
  const box = "border border-[#111827] px-3 py-1.5 font-bold";
  return (
    <div className={cn(malayalam.variable, "text-[13px] leading-snug")}>
      <header className="text-center">
        <Wordmark className="mx-auto w-52" />
        {(s.address || s.city) && <p className="mt-1 text-[13px] uppercase">{[s.address, s.city].filter(Boolean).join(" - ")}</p>}
        {(s.phone || s.email) && <p className="text-[13px]">{[s.phone, s.email].filter(Boolean).join(", ")}</p>}
        {s.gstin && <p className="text-xs">GSTIN {s.gstin}</p>}
      </header>

      <h2 className={cn("mt-3 py-1 text-center text-xl font-bold tracking-wide", red)}>INVOICE</h2>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs">INVOICE NO :</span>
          <span className={box}>{number}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs">DATE :</span>
          <span className={cn(box, "min-w-32 text-center")}>{formatDate(sale.saleDate, "dd/MM/yyyy")}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[9.5rem_1fr] border border-[#111827]">
        <span className={cn("px-3 py-1.5", red)}>VEHICLE REG. NO</span>
        <span className="px-6 py-1.5 font-bold">{vehicle?.registrationNumber}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-[9.5rem_1fr] border border-[#111827]">
        <span className={cn("px-3 py-1.5", red)}>VEHICLE MODEL</span>
        <span className="px-6 py-1.5 font-bold">{vehicle ? `${vehicleTitle(vehicle)} ${vehicle.variant} ${vehicle.year}`.replace(/\s+/g, " ") : ""}</span>
      </div>
      {vehicle && (vehicle.chassisNumber || vehicle.engineNumber) && (
        <p className="mt-1 text-xs">
          {[vehicle.chassisNumber && `Chassis no. ${vehicle.chassisNumber}`, vehicle.engineNumber && `Engine no. ${vehicle.engineNumber}`, vehicle.color, formatKm(vehicle.mileageKm)].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="mt-3 border border-[#111827]">
        <p className={cn("py-0.5 text-center font-semibold", grey)}>CUSTOMER NAME &amp; ADDRESS</p>
        <div className="min-h-20 px-16 py-2 font-bold uppercase">
          <p>{customer?.name}</p>
          {customer?.address && <p className="whitespace-pre-line">{customer.address}</p>}
          {customer?.phone && <p>{customer.phone}</p>}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-6">
        <div className="flex border border-[#111827]">
          <span className="border-r border-[#111827] px-3 py-1.5">TYPE :</span>
          <span className="flex-1 px-3 py-1.5 text-center font-bold">{financed ? "FINANCE" : "CASH"}</span>
        </div>
        <div className="flex border border-[#111827]">
          <span className="border-r border-[#111827] px-3 py-1.5">DSE :</span>
          <span className="flex-1 px-3 py-1.5 text-center font-bold uppercase">{dse}</span>
        </div>
      </div>

      <p className={cn("mt-3 py-0.5 text-center font-semibold", grey)}>PRICE AND PAYMENT DETAILS</p>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
        <PriceRow label="VEHICLE SALES AMOUNT" value={rupees(sale.salePricePaise)} />
        <PriceRow label="AMOUNT PAID" value={rupees(paidPaise)} />
        <PriceRow label="RTO EXPENSE" value="0" />
        <PriceRow label="EXCHANGE CAR VALUE" value="0" />
        <PriceRow label="OTHER CHARGES" value="0" />
        <PriceRow label="BALANCE TO BE PAID" value={rupees(balancePaise)} />
        <PriceRow label="TOTAL AMOUNT" value={rupees(sale.salePricePaise)} />
      </div>
      <p className="mt-1 text-xs italic">{paiseToWords(sale.salePricePaise)}</p>

      <div className="mt-3 border border-[#111827]">
        <p className={cn("py-0.5 text-center font-semibold", grey)}>ADDITIONAL NOTES</p>
        <div className="min-h-20 px-16 py-2">
          {sale.notes && <p className="font-bold uppercase">{sale.notes}</p>}
          {payments.length > 0 && (
            <ul className="mt-1 text-xs">
              {payments.map((p) => <li key={p.id}>{paymentLabel(p)} — {rupees(p.amountPaise)}/-</li>)}
            </ul>
          )}
          <Cancelled sale={sale} />
        </div>
      </div>

      <h3 className={cn("mt-3 py-0.5 text-center text-base font-semibold", red)} lang="ml" style={{ fontFamily: "var(--font-malayalam)" }}>നിബന്ധനകൾ</h3>
      <ul lang="ml" className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-[11.5px] leading-snug" style={{ fontFamily: "var(--font-malayalam)" }}>
        {MALAYALAM_TERMS.map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-1 size-2 shrink-0 rounded-full bg-[#111827]" aria-hidden />
            <span>{t}</span>
          </li>
        ))}
      </ul>

      {bank && (
        <div className="mt-3 break-inside-avoid border border-[#111827]">
          <p className={cn("py-0.5 text-center font-semibold", red)}>BANK ACCOUNT DETAILS</p>
          <div className="grid grid-cols-2 gap-x-6 px-4 py-1.5 text-xs font-semibold">
            <p>Account Name : {(s.legalName || s.showroomName).toUpperCase()}</p>
            <p className="text-right">Account No. : {bank.accountNumber}</p>
            <p>Bank Name : {(bank.bankName || bank.name).toUpperCase()}</p>
            <p className="text-right">IFS Code : {bank.ifsc}</p>
            {bank.upiId && <p>UPI : {bank.upiId}</p>}
          </div>
        </div>
      )}

      <div className="mt-14 flex justify-between gap-6 text-[13px] font-semibold">
        <p>Cash Received &amp; Confirmed by</p>
        <p>Name &amp; Signature of Customer</p>
      </div>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_9rem] items-center gap-2">
      <span className="text-xs">{label}</span>
      <span className="border border-[#111827] px-3 py-1.5 text-right font-bold tabular">{value}</span>
    </div>
  );
}

// ─── Classic ───────────────────────────────────────────────────────────────────

function ClassicInvoice({ number, sale, vehicle, customer, payments, balancePaise, terms }: InvoiceData) {
  return (
    <>
      <Letterhead title="Invoice">
        {number}
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
            ...payments.map((p, i) => ({ label: paymentLabel(p), value: `− ${formatINR(p.amountPaise)}`, gap: i === 0 })),
            { label: "Balance due", value: formatINR(balancePaise), strong: true, gap: payments.length === 0 },
          ]}
        />
      </div>
      <Cancelled sale={sale} />

      {terms && <p className="mt-10 text-xs text-[#6b7280]">{terms}</p>}
      <Signature />
      <Footer sale={sale} className="mt-12" />
    </>
  );
}

// ─── Modern ────────────────────────────────────────────────────────────────────

function ModernInvoice({ number, sale, vehicle, customer, payments, paidPaise, balancePaise, terms }: InvoiceData) {
  const s = useData().ds.settings;
  return (
    <>
      <header className={cn("-mx-6 -mt-8 flex flex-wrap items-end justify-between gap-6 bg-primary px-6 py-8 text-primary-foreground sm:-mx-14 sm:-mt-14 sm:px-14", keepColour, "print:mx-0 print:mt-0 print:rounded-md print:px-8")}>
        <div className="flex items-center gap-4">
          <ShowroomLogo className="size-14 rounded-md bg-white p-1" />
          <div>
            <h1 className="text-lg font-semibold">{s.showroomName}</h1>
            {(s.address || s.city) && <p className="text-xs opacity-80">{[s.address, s.city].filter(Boolean).join(", ")}</p>}
            {contactLine(s) && <p className="text-xs opacity-80">{contactLine(s)}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium tracking-[0.2em] uppercase opacity-80">Invoice</p>
          <p className="text-lg font-semibold tabular">{number}</p>
          <p className="text-xs opacity-80">{formatDate(sale.saleDate, "dd MMM yyyy")}</p>
        </div>
      </header>

      <div className="mt-8 grid gap-6 sm:grid-cols-[1fr_auto]">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-primary uppercase">Bill to</p>
          <p className="mt-1 font-semibold">{customer?.name}</p>
          <p className="text-[#4b5563]">
            {customer?.phone}
            {customer?.address && <><br />{customer.address}</>}
          </p>
        </div>
        {s.gstin && (
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold tracking-wide text-primary uppercase">GSTIN</p>
            <p className="mt-1 font-medium">{s.gstin}</p>
          </div>
        )}
      </div>

      {vehicle && (
        <table className="mt-8 w-full border-collapse text-left">
          <thead>
            <tr className={cn("bg-primary-soft text-[11px] tracking-wide text-primary uppercase", keepColour)}>
              <th className="px-3 py-2 font-semibold">Vehicle</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b align-top">
              <td className="px-3 py-3">
                <p className="font-semibold">{vehicle.year} {vehicleTitle(vehicle)} {vehicle.variant}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
                  {vehicleLines(vehicle).map((l) => (
                    <React.Fragment key={l.label}>
                      <dt className="text-[#6b7280]">{l.label}</dt>
                      <dd>{l.value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </td>
              <td className="px-3 py-3 text-right font-semibold tabular">{formatINR(sale.salePricePaise)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="mt-6 ml-auto grid max-w-sm gap-1.5 tabular">
        <Row label="Total" value={formatINR(sale.salePricePaise)} strong />
        <p className="text-right text-xs text-[#6b7280]">{paiseToWords(sale.salePricePaise)}</p>
        {payments.map((p) => <Row key={p.id} label={paymentLabel(p)} value={`− ${formatINR(p.amountPaise)}`} muted />)}
        {payments.length > 1 && <Row label="Paid so far" value={formatINR(paidPaise)} muted />}
        <div className={cn("mt-2 flex items-center justify-between rounded-md bg-primary px-3 py-2 text-primary-foreground", keepColour)}>
          <span className="font-medium">Balance due</span>
          <span className="text-base font-semibold">{formatINR(balancePaise)}</span>
        </div>
      </div>
      <Cancelled sale={sale} />

      {terms && <p className="mt-10 border-t pt-4 text-xs text-[#6b7280]">{terms}</p>}
      <Signature />
      <Footer sale={sale} className="mt-12" />
    </>
  );
}

function Row({ label, value, strong, muted }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-6", strong && "font-semibold", muted && "text-xs text-[#6b7280]")}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

// ─── Compact ───────────────────────────────────────────────────────────────────

function CompactInvoice({ number, sale, vehicle, customer, payments, balancePaise, terms }: InvoiceData) {
  const s = useData().ds.settings;
  return (
    <div className="text-[12px] leading-snug">
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#111827] pb-3">
        <div className="flex items-center gap-3">
          <ShowroomLogo className="size-10" />
          <div>
            <h1 className="text-sm font-bold">{s.showroomName}</h1>
            <p className="text-[11px] text-[#4b5563]">
              {[[s.address, s.city].filter(Boolean).join(", "), contactLine(s), s.gstin && `GSTIN ${s.gstin}`].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold">INVOICE</p>
          <p className="tabular">{number}</p>
          <p>{formatDate(sale.saleDate, "dd MMM yyyy")}</p>
        </div>
      </header>

      <table className="mt-3 w-full border-collapse text-left">
        <tbody className="[&_td]:border [&_td]:border-[#d1d5db] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[#d1d5db] [&_th]:bg-[#f3f4f6] [&_th]:px-2 [&_th]:py-1 [&_th]:font-semibold">
          <tr>
            <th className={cn("w-28", keepColour)}>Buyer</th>
            <td>{customer?.name}{customer?.phone && `, ${customer.phone}`}{customer?.address && `, ${customer.address}`}</td>
          </tr>
          {vehicle && (
            <>
              <tr>
                <th className={keepColour}>Vehicle</th>
                <td>{vehicle.year} {vehicleTitle(vehicle)} {vehicle.variant}</td>
              </tr>
              <tr>
                <th className={keepColour}>Details</th>
                <td>{vehicleLines(vehicle).map((l) => `${l.label} ${l.value}`).join(" · ")}</td>
              </tr>
            </>
          )}
          <tr>
            <th className={keepColour}>Price</th>
            <td className="font-semibold tabular">{formatINR(sale.salePricePaise)} <span className="font-normal text-[#4b5563]">({paiseToWords(sale.salePricePaise)})</span></td>
          </tr>
          {payments.map((p) => (
            <tr key={p.id}>
              <th className={cn("font-normal!", keepColour)}>Received</th>
              <td className="tabular">{formatINR(p.amountPaise)} — {paymentLabel(p)}</td>
            </tr>
          ))}
          <tr>
            <th className={keepColour}>Balance due</th>
            <td className="font-bold tabular">{formatINR(balancePaise)}</td>
          </tr>
        </tbody>
      </table>
      <Cancelled sale={sale} />

      <div className="mt-4 flex items-end justify-between gap-6">
        <div className="max-w-[65%] text-[10.5px] text-[#4b5563]">
          {terms && <p>{terms}</p>}
          <Footer sale={sale} className="mt-2 text-[10.5px]" />
        </div>
        <div className="shrink-0 text-right text-[11px]">
          <p>For {s.showroomName}</p>
          <p className="mt-8 text-[#6b7280]">Authorised signatory</p>
        </div>
      </div>
    </div>
  );
}

// ─── Bold ──────────────────────────────────────────────────────────────────────

function BoldInvoice({ number, sale, vehicle, customer, payments, paidPaise, balancePaise, terms }: InvoiceData) {
  const s = useData().ds.settings;
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-5xl font-black tracking-tight">INVOICE</h1>
          <p className="mt-2 text-sm text-[#4b5563] tabular">{number} · {formatDate(sale.saleDate, "dd MMM yyyy")}</p>
        </div>
        <div className="flex items-start gap-3 text-right">
          <div>
            <p className="font-bold">{s.showroomName}</p>
            <p className="text-xs whitespace-pre-line text-[#4b5563]">
              {[[s.address, s.city].filter(Boolean).join(", "), contactLine(s), s.gstin && `GSTIN ${s.gstin}`].filter(Boolean).join("\n")}
            </p>
          </div>
          <ShowroomLogo className="size-14" />
        </div>
      </header>

      <div className={cn("mt-10 grid gap-px overflow-hidden rounded-lg bg-[#111827] p-px sm:grid-cols-3", keepColour)}>
        <Stat label="Total" value={formatINR(sale.salePricePaise)} />
        <Stat label="Received" value={formatINR(paidPaise)} />
        <Stat label="Balance due" value={formatINR(balancePaise)} highlight />
      </div>
      <p className="mt-2 text-xs text-[#6b7280]">{paiseToWords(sale.salePricePaise)}</p>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <section>
          <h2 className="border-b-2 border-[#111827] pb-1 text-xs font-bold tracking-widest uppercase">Billed to</h2>
          <p className="mt-2 text-base font-semibold">{customer?.name}</p>
          <p className="text-[#4b5563]">
            {customer?.phone}
            {customer?.address && <><br />{customer.address}</>}
          </p>
        </section>
        {vehicle && (
          <section>
            <h2 className="border-b-2 border-[#111827] pb-1 text-xs font-bold tracking-widest uppercase">Vehicle</h2>
            <p className="mt-2 text-base font-semibold">{vehicle.year} {vehicleTitle(vehicle)} {vehicle.variant}</p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
              {vehicleLines(vehicle).map((l) => (
                <React.Fragment key={l.label}>
                  <dt className="text-[#6b7280]">{l.label}</dt>
                  <dd>{l.value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
        )}
      </div>

      {payments.length > 0 && (
        <section className="mt-10">
          <h2 className="border-b-2 border-[#111827] pb-1 text-xs font-bold tracking-widest uppercase">Payments received</h2>
          <ul className="mt-2 divide-y text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-6 py-1.5 tabular">
                <span className="text-[#4b5563]">{paymentLabel(p)}</span>
                <span className="font-medium">{formatINR(p.amountPaise)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Cancelled sale={sale} />

      {terms && <p className="mt-10 text-xs text-[#6b7280]">{terms}</p>}
      <Signature />
      <Footer sale={sale} className="mt-12" />
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("px-4 py-3", highlight ? "bg-[#111827] text-white" : "bg-white")}>
      <p className={cn("text-[11px] font-semibold tracking-widest uppercase", highlight ? "text-white/70" : "text-[#6b7280]")}>{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular">{value}</p>
    </div>
  );
}
