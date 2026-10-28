import type { Metadata } from "next";
import { PurchaseDetailPage } from "@/features/purchases/purchase-detail-page";

export const metadata: Metadata = { title: "Purchase" };

export default function Page() {
  return <PurchaseDetailPage />;
}
