import type { Metadata } from "next";
import { VoucherPrintPage } from "@/features/accounts/voucher-print-page";

export const metadata: Metadata = { title: "Voucher" };

export default function Page() {
  return <VoucherPrintPage />;
}
