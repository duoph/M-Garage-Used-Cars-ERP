import type { Metadata } from "next";
import { NewPurchasePage } from "@/features/purchases/new-purchase-page";

export const metadata: Metadata = { title: "New purchase" };

export default function Page() {
  return <NewPurchasePage />;
}
