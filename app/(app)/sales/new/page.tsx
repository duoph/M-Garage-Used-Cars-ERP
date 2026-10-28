import type { Metadata } from "next";
import { Suspense } from "react";
import { NewSalePage } from "@/features/sales/new-sale-page";

export const metadata: Metadata = { title: "Record sale" };

export default function Page() {
  // useSearchParams (pre-selected vehicle) requires a Suspense boundary.
  return (
    <Suspense>
      <NewSalePage />
    </Suspense>
  );
}
