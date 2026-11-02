import type { Metadata } from "next";
import { Suspense } from "react";
import { ExpensesPage } from "@/features/expenses/expenses-page";

export const metadata: Metadata = { title: "Expenses" };

export default function Page() {
  // `?expense=<id>` opens one expense (drill-down from reports), which needs a Suspense boundary.
  return (
    <Suspense>
      <ExpensesPage />
    </Suspense>
  );
}
