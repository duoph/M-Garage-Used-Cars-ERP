import type { Metadata } from "next";
import { PartiesPage } from "@/features/accounts/parties-page";

export const metadata: Metadata = { title: "Parties" };

export default function Page() {
  return <PartiesPage />;
}
