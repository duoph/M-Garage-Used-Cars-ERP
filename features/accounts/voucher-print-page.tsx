"use client";
import { useParams } from "next/navigation";
import { FileText } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { formatDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { PAYMENT_METHOD_LABELS, VOUCHER_HEAD_LABELS, VOUCHER_TYPE_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { paiseToWords } from "@/lib/utils/words";
import { AmountRows, DocumentNotFound, Letterhead, PrintPage, usePrintGate } from "@/features/documents/print-layout";

/** Printable receipt, payment or contra voucher with signature lines for both sides. */
export function VoucherPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { ds, idx } = useData();
  const gate = usePrintGate("accounts.view");
  if (gate) return gate;

  const v = ds.vouchers.find((x) => x.id === id);
  if (!v) return <DocumentNotFound icon={FileText} title="Voucher not found" href="/accounts" label="Back to accounts" />;

  const account = ds.accounts.find((a) => a.id === v.accountId);
  const to = v.toAccountId ? ds.accounts.find((a) => a.id === v.toAccountId) : undefined;
  const handler = idx.users.get(v.handledBy);
  const purchase = v.purchaseId ? idx.purchases.get(v.purchaseId) : undefined;
  const vehicle = purchase ? idx.vehicles.get(purchase.vehicleId) : undefined;
  const isReceipt = v.type === "receipt";
  const back = isReceipt ? "/accounts/receipts" : v.type === "payment" ? "/accounts/payments" : "/accounts";

  return (
    <PrintPage back={{ href: back, label: "Back" }}>
      <Letterhead title={VOUCHER_TYPE_LABELS[v.type]}>
        {v.number}
        <br />
        {formatDate(v.date, "dd MMM yyyy")}
      </Letterhead>

      {v.status === "cancelled" && (
        <p className="mt-6 rounded border border-[#fca5a5] px-3 py-2 text-xs font-semibold tracking-wide text-[#b91c1c] uppercase">
          Cancelled {v.cancelReason && `— ${v.cancelReason}`}
        </p>
      )}

      <p className="mt-10">
        {v.type === "contra" ? (
          <>Transferred from <strong className="font-semibold">{account?.name}</strong> to <strong className="font-semibold">{to?.name}</strong>.</>
        ) : (
          <>
            {isReceipt ? "Received from" : "Paid to"} <strong className="font-semibold">{v.partyName}</strong>
            {v.partyPhone && ` (${v.partyPhone})`} towards {VOUCHER_HEAD_LABELS[v.head].toLowerCase()}
            {purchase && (
              <>
                {" "}against purchase {purchase.reference}
                {vehicle && <> of <strong className="font-semibold">{vehicle.year} {vehicleTitle(vehicle)}</strong>, {vehicle.registrationNumber}</>}
              </>
            )}
            .
          </>
        )}
      </p>

      <div className="mt-8">
        <AmountRows
          rows={[
            { label: "Amount", value: formatINR(v.amountPaise), strong: true, note: paiseToWords(v.amountPaise) },
            ...(v.type !== "contra" ? [{ label: "Mode", value: <>{PAYMENT_METHOD_LABELS[v.method]}{v.reference && `, ${v.reference}`}</> }] : v.reference ? [{ label: "Reference", value: v.reference }] : []),
            { label: isReceipt ? "Deposited into" : v.type === "payment" ? "Paid from" : "From account", value: account?.name ?? "—" },
            ...(to ? [{ label: "To account", value: to.name }] : []),
            { label: isReceipt ? "Received by" : "Handled by", value: handler?.name ?? "—" },
          ]}
        />
      </div>
      {v.narration && <p className="mt-6 text-[13px]"><span className="text-[#6b7280]">Narration: </span>{v.narration}</p>}

      <div className="mt-24 grid grid-cols-2 gap-16 text-xs">
        <div className="border-t border-[#9ca3af] pt-2 text-[#6b7280]">{v.type === "contra" ? "Prepared by" : isReceipt ? "Paid by (signature)" : "Receiver's signature"}</div>
        <div className="border-t border-[#9ca3af] pt-2 text-right text-[#6b7280]">For {ds.settings.showroomName} — authorised signatory</div>
      </div>
    </PrintPage>
  );
}
