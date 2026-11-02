import type { Metadata } from "next";
import { MoneyReportsHub } from "@/features/reports/money-reports";

export const metadata: Metadata = { title: "Money reports" };

export default function Page() {
  return <MoneyReportsHub />;
}
