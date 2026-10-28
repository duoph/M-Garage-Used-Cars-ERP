import type { Metadata } from "next";
import { StaffPage } from "@/features/users/staff-page";

export const metadata: Metadata = { title: "Staff & Users" };

export default function Page() {
  return <StaffPage />;
}
