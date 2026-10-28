import type { Metadata } from "next";
import { SaleDetailPage } from "@/features/sales/sale-detail-page";

export const metadata: Metadata = { title: "Sale" };

export default function Page() {
  return <SaleDetailPage />;
}
