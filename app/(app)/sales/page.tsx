import type { Metadata } from "next";
import { Suspense } from "react";
import { SalesPage } from "@/features/sales/sales-page";

export const metadata: Metadata = { title: "Sales" };

export default function Page() {
  // Filters can be preset from the URL (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense>
      <SalesPage />
    </Suspense>
  );
}
