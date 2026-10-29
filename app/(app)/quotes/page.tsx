import type { Metadata } from "next";
import { QuotesPage } from "@/features/quotes/quotes-page";

export const metadata: Metadata = { title: "Quotes" };

export default function Page() {
  return <QuotesPage />;
}
