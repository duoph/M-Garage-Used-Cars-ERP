import type { Metadata } from "next";
import { MoneyFlowPage } from "@/features/accounts/money-flow-page";

export const metadata: Metadata = { title: "Receipts" };

export default function Page() {
  return <MoneyFlowPage direction="in" />;
}
