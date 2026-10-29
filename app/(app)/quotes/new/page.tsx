import type { Metadata } from "next";
import { Suspense } from "react";
import { QuoteFormPage } from "@/features/quotes/quote-form-page";

export const metadata: Metadata = { title: "New quote" };

export default function Page() {
  // useSearchParams (pre-selected vehicle) requires a Suspense boundary.
  return (
    <Suspense>
      <QuoteFormPage />
    </Suspense>
  );
}
