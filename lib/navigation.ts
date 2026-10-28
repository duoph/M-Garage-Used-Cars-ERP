import {
  Activity,
  BarChart3,
  CarFront,
  LayoutDashboard,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export type NavSection = "Overview" | "Showroom" | "Finance" | "Admin";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  section: NavSection;
  /** Short helper shown as a tooltip when the sidebar is collapsed. */
  hint: string;
}

export const NAV_SECTIONS: NavSection[] = ["Overview", "Showroom", "Finance", "Admin"];

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, permission: "dashboard.view", section: "Overview", hint: "Today at a glance" },
  { label: "Inventory", href: "/inventory", icon: CarFront, permission: "inventory.view", section: "Showroom", hint: "Cars in stock" },
  { label: "Purchases", href: "/purchases", icon: ShoppingCart, permission: "purchases.view", section: "Showroom", hint: "Cars bought by the showroom" },
  { label: "Sales", href: "/sales", icon: Receipt, permission: "sales.view", section: "Showroom", hint: "Cars sold and payments" },
  { label: "Expenses", href: "/expenses", icon: Wallet, permission: "expenses.view", section: "Finance", hint: "Repairs, rent, salaries…" },
  { label: "Reports", href: "/reports", icon: BarChart3, permission: "reports.view", section: "Finance", hint: "Sales, stock and profit" },
  { label: "Staff & Users", href: "/staff", icon: Users, permission: "users.manage", section: "Admin", hint: "Accounts and roles" },
  { label: "Activity Log", href: "/activity", icon: Activity, permission: "activity.view", section: "Admin", hint: "Who changed what" },
  { label: "Settings", href: "/settings", icon: Settings, permission: "settings.manage", section: "Admin", hint: "Showroom profile and data" },
];

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
