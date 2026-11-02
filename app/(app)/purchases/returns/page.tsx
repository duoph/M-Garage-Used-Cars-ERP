import type { Metadata } from "next";
import { ReturnsListPage } from "@/features/returns/returns-pages";

export const metadata: Metadata = { title: "Purchase returns" };

export default function Page() {
  return <ReturnsListPage kind="purchase" />;
}
