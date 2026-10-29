import type { Metadata } from "next";
import { QuoteDocumentPage } from "@/features/quotes/quote-document-page";

export const metadata: Metadata = { title: "Quotation" };

export default function Page() {
  return <QuoteDocumentPage />;
}
