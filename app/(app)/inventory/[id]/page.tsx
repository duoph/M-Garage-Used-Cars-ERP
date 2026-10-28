import type { Metadata } from "next";
import { VehicleDetailPage } from "@/features/inventory/vehicle-detail-page";

export const metadata: Metadata = { title: "Vehicle" };

export default function Page() {
  return <VehicleDetailPage />;
}
