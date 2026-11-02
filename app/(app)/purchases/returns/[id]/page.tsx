import type { Metadata } from "next";
import { ReturnDetailPage } from "@/features/returns/returns-pages";

export const metadata: Metadata = { title: "Purchase return" };

export default function Page() {
  return <ReturnDetailPage kind="purchase" />;
}
