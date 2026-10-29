import type { Metadata } from "next";
import { InvoicePage } from "@/features/sales/invoice-page";

export const metadata: Metadata = { title: "Invoice" };

export default function Page() {
  return <InvoicePage />;
}
