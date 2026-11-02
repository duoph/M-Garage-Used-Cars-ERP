import type { Metadata } from "next";
import { ReturnNotePage } from "@/features/returns/returns-pages";

export const metadata: Metadata = { title: "Credit note" };

export default function Page() {
  return <ReturnNotePage kind="sales" />;
}
