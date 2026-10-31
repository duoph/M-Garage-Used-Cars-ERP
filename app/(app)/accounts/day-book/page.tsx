import type { Metadata } from "next";
import { DayBookPage } from "@/features/accounts/day-book-page";

export const metadata: Metadata = { title: "Day Book" };

export default function Page() {
  return <DayBookPage />;
}
