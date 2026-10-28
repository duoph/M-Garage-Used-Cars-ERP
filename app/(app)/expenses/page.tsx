import type { Metadata } from "next";
import { ExpensesPage } from "@/features/expenses/expenses-page";

export const metadata: Metadata = { title: "Expenses" };

export default function Page() {
  return <ExpensesPage />;
}
