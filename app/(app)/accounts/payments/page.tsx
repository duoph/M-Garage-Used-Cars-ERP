import type { Metadata } from "next";
import { MoneyFlowPage } from "@/features/accounts/money-flow-page";

export const metadata: Metadata = { title: "Payments" };

export default function Page() {
  return <MoneyFlowPage direction="out" />;
}
