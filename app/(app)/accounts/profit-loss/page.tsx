import type { Metadata } from "next";
import { ProfitLossPage } from "@/features/accounts/profit-loss-page";

export const metadata: Metadata = { title: "Profit & Loss" };

export default function Page() {
  return <ProfitLossPage />;
}
