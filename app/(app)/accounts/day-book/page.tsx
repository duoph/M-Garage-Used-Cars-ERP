import type { Metadata } from "next";
import { Suspense } from "react";
import { DayBookPage } from "@/features/accounts/day-book-page";

export const metadata: Metadata = { title: "Day Book" };

export default function Page() {
  // `?date=` jumps to a day (links from the activity log), which needs a Suspense boundary.
  return (
    <Suspense>
      <DayBookPage />
    </Suspense>
  );
}
