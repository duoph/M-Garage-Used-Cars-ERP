import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  ArrowDownUp,
  BookOpen,
  CarFront,
  Contact,
  Landmark,
  LayoutDashboard,
  Receipt,
  Scale,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export type NavSection = "Overview" | "Showroom" | "Accounts" | "Admin";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  section: NavSection;
  /** Short helper shown as a tooltip when the sidebar is collapsed. */
  hint: string;
}

export const NAV_SECTIONS: NavSection[] = ["Overview", "Showroom", "Accounts", "Admin"];

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, permission: "dashboard.view", section: "Overview", hint: "Today at a glance" },
  { label: "Inventory", href: "/inventory", icon: CarFront, permission: "inventory.view", section: "Showroom", hint: "Cars in stock" },
  { label: "Purchases", href: "/purchases", icon: ShoppingCart, permission: "purchases.view", section: "Showroom", hint: "Cars bought by the showroom" },
  { label: "Sales", href: "/sales", icon: Receipt, permission: "sales.view", section: "Showroom", hint: "Cars sold and payments" },
  { label: "Cash & Bank", href: "/accounts", icon: Landmark, permission: "accounts.view", section: "Accounts", hint: "Balances and cash book" },
  { label: "Receipts", href: "/accounts/receipts", icon: ArrowDownLeft, permission: "accounts.view", section: "Accounts", hint: "Money received" },
  { label: "Payments", href: "/accounts/payments", icon: ArrowUpRight, permission: "accounts.view", section: "Accounts", hint: "Money paid out" },
  { label: "Expenses", href: "/expenses", icon: Wallet, permission: "expenses.view", section: "Accounts", hint: "Repairs, rent, salaries…" },
  { label: "Day Book", href: "/accounts/day-book", icon: BookOpen, permission: "accounts.view", section: "Accounts", hint: "Everything on one day" },
  { label: "Parties", href: "/accounts/parties", icon: Contact, permission: "accounts.view", section: "Accounts", hint: "Buyer and seller ledgers" },
  { label: "Profit & Loss", href: "/accounts/profit-loss", icon: Scale, permission: "reports.financial", section: "Accounts", hint: "P&L and financial position" },
  { label: "Reports", href: "/reports", icon: BarChart3, permission: "reports.view", section: "Accounts", hint: "Sales, stock and profit" },
  { label: "Staff & Users", href: "/staff", icon: Users, permission: "users.manage", section: "Admin", hint: "Accounts and roles" },
  { label: "Activity Log", href: "/activity", icon: Activity, permission: "activity.view", section: "Admin", hint: "Who changed what" },
  { label: "Import & export", href: "/data", icon: ArrowDownUp, permission: "data.export", section: "Admin", hint: "Excel and CSV files" },
  { label: "Settings", href: "/settings", icon: Settings, permission: "settings.manage", section: "Admin", hint: "Showroom profile and data" },
];

/** True when `href` is the nav item for `pathname`. Sub-pages that have their own nav item don't light up their parent. */
export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (pathname !== href && !pathname.startsWith(href + "/")) return false;
  return !NAV_ITEMS.some((i) => i.href !== href && i.href.startsWith(href + "/") && (pathname === i.href || pathname.startsWith(i.href + "/")));
}
