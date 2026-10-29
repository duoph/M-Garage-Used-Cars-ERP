import type { Metadata } from "next";
import { Suspense } from "react";
import { QuoteFormPage } from "@/features/quotes/quote-form-page";

export const metadata: Metadata = { title: "Edit quote" };

export default function Page() {
  return (
    <Suspense>
      <QuoteFormPage />
    </Suspense>
  );
}
