import type { Metadata } from "next";
import { SaleLetterPage } from "@/features/sales/sale-letter-page";

export const metadata: Metadata = { title: "Sale letter" };

export default function Page() {
  return <SaleLetterPage />;
}
