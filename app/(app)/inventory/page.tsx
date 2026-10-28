import type { Metadata } from "next";
import { Suspense } from "react";
import { InventoryPage } from "@/features/inventory/inventory-page";

export const metadata: Metadata = { title: "Inventory" };

export default function Page() {
  // Filters can be preset from the URL (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense>
      <InventoryPage />
    </Suspense>
  );
}
