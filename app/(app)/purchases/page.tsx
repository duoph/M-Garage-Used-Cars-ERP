import type { Metadata } from "next";
import { Suspense } from "react";
import { PurchasesPage } from "@/features/purchases/purchases-page";

export const metadata: Metadata = { title: "Purchases" };

export default function Page() {
  // Filters can be preset from the URL (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense>
      <PurchasesPage />
    </Suspense>
  );
}
