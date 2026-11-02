"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { FileText, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { reportError } from "@/hooks/use-commands";
import { saleTotals } from "@/lib/calculations/finance";
import { dealerService } from "@/lib/services/dealer-service";
import { invoiceNumber } from "@/lib/utils/ids";
import { DEFAULT_INVOICE_TEMPLATE, INVOICE_TEMPLATES, type InvoiceTemplateId } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentNotFound, PrintPage, usePrintGate } from "@/features/documents/print-layout";
import { INVOICE_TEMPLATE_INFO, InvoiceDocument } from "./invoice-templates";

/** Sale invoice: buyer, the car with its identifying numbers, the price, and payments received so far. */
export function InvoicePage() {
  const { saleId } = useParams<{ saleId: string }>();
  const { ds, idx } = useData();
  const { user, can } = useAuth();
  const [picked, setPicked] = React.useState<InvoiceTemplateId | null>(null);
  const gate = usePrintGate("receipts.print");
  if (gate) return gate;

  const sale = idx.sales.get(saleId);
  if (!sale || (!can("sales.viewAll") && sale.soldBy !== user?.id))
    return <DocumentNotFound icon={FileText} title="Invoice not found" href="/sales" label="Back to sales" />;

  const payments = idx.paymentsBySale.get(sale.id) ?? [];
  const totals = saleTotals(sale, payments);
  // The shared terms are written for receipts; drop a "not a tax invoice" sentence so the invoice doesn't contradict itself.
  const terms = ds.settings.receiptTerms
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !/not a tax invoice/i.test(sentence))
    .join(" ");
  const template = picked ?? ds.settings.invoiceTemplate ?? DEFAULT_INVOICE_TEMPLATE;
  const canSetDefault = can("settings.manage");

  async function choose(next: InvoiceTemplateId) {
    setPicked(next);
    if (!canSetDefault || !user) return;
    try {
      await dealerService.setInvoiceTemplate(user, next);
      toast.success(`${INVOICE_TEMPLATE_INFO[next].label} is now the default invoice template`);
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <PrintPage
      back={{ href: `/sales/${sale.id}`, label: "Back to sale" }}
      actions={
        <Select value={template} onValueChange={(v) => void choose(v as InvoiceTemplateId)}>
          <SelectTrigger className="w-[150px] bg-white" aria-label="Invoice template">
            <LayoutTemplate className="size-4 text-muted-foreground" />
            <SelectValue>{INVOICE_TEMPLATE_INFO[template].label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {INVOICE_TEMPLATES.map((t) => (
              <SelectItem key={t} value={t}>
                {INVOICE_TEMPLATE_INFO[t].label}
                <span className="ml-1.5 text-xs text-muted-foreground">{INVOICE_TEMPLATE_INFO[t].description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <InvoiceDocument
        template={template}
        data={{
          number: invoiceNumber(sale.reference),
          sale,
          vehicle: idx.vehicles.get(sale.vehicleId),
          customer: idx.customers.get(sale.customerId),
          payments,
          paidPaise: totals.receivedPaise,
          balancePaise: totals.balancePaise,
          terms,
        }}
      />
    </PrintPage>
  );
}
