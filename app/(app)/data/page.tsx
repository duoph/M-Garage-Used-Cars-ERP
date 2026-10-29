import type { Metadata } from "next";
import { DataPage } from "@/features/data/data-page";

export const metadata: Metadata = { title: "Import & export" };

export default function Page() {
  return <DataPage />;
}
