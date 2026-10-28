import type { Metadata } from "next";
import { ReceiptPage } from "@/features/sales/receipt-page";

export const metadata: Metadata = { title: "Receipt" };

export default function Page() {
  return <ReceiptPage />;
}
