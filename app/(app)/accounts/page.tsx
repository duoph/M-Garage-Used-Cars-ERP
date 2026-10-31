import type { Metadata } from "next";
import { Suspense } from "react";
import { CashBankPage } from "@/features/accounts/cash-bank-page";

export const metadata: Metadata = { title: "Cash & Bank" };

export default function Page() {
  // The selected account lives in the URL (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense>
      <CashBankPage />
    </Suspense>
  );
}
