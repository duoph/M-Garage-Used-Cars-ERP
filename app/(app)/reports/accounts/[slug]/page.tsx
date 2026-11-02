import type { Metadata } from "next";
import { MoneyReportPage } from "@/features/reports/money-reports";

export const metadata: Metadata = { title: "Report" };

export default function Page() {
  return <MoneyReportPage />;
}
