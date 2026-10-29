import type { Role } from "@/types";

/**
 * Centralised permission model.
 *
 * IMPORTANT: in this Phase 1 demo these checks run in the browser and only shape the UI.
 * In production every permission must be enforced server-side, and restricted fields
 * (purchase cost, profit, internal expenses) must never be sent to unauthorised clients.
 */
export const PERMISSIONS = [
  "dashboard.view",
  "inventory.view",
  "inventory.edit",
  "inventory.photos",
  "inventory.export",
  "purchases.view",
  "purchases.manage",
  "sales.view",
  "sales.viewAll",
  "sales.create",
  "sales.cancel",
  "payments.record",
  "receipts.print",
  "expenses.view",
  "expenses.manage",
  "finance.viewCost",
  "finance.viewProfit",
  "reports.view",
  "reports.financial",
  "data.export",
  "activity.view",
  "users.manage",
  "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  admin: ALL,
  manager: new Set<Permission>(PERMISSIONS.filter((p) => p !== "users.manage" && p !== "settings.manage")),
  sales: new Set<Permission>([
    "dashboard.view",
    "inventory.view",
    "inventory.export",
    "sales.view",
    "sales.create",
    "receipts.print",
  ]),
  accountant: new Set<Permission>([
    "dashboard.view",
    "inventory.view",
    "inventory.export",
    "purchases.view",
    "sales.view",
    "sales.viewAll",
    "payments.record",
    "receipts.print",
    "expenses.view",
    "expenses.manage",
    "finance.viewCost",
    "finance.viewProfit",
    "reports.view",
    "reports.financial",
    "data.export",
    "activity.view",
  ]),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

export function canAll(role: Role | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

export function canAny(role: Role | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/** Route → permission required to open it. Used by the sidebar and the route guard. */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/inventory", permission: "inventory.view" },
  { prefix: "/purchases/new", permission: "purchases.manage" },
  { prefix: "/purchases", permission: "purchases.view" },
  { prefix: "/sales/new", permission: "sales.create" },
  { prefix: "/quotes/new", permission: "sales.create" },
  { prefix: "/quotes", permission: "sales.view" },
  { prefix: "/sales", permission: "sales.view" },
  { prefix: "/expenses", permission: "expenses.view" },
  { prefix: "/reports", permission: "reports.view" },
  { prefix: "/staff", permission: "users.manage" },
  { prefix: "/activity", permission: "activity.view" },
  { prefix: "/settings", permission: "settings.manage" },
  { prefix: "/receipt", permission: "receipts.print" },
  { prefix: "/invoice", permission: "receipts.print" },
  { prefix: "/quote", permission: "receipts.print" },
  { prefix: "/data", permission: "data.export" },
];

export function canAccessPath(role: Role | null | undefined, pathname: string): boolean {
  const match = ROUTE_PERMISSIONS.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  return match ? can(role, match.permission) : can(role, "dashboard.view");
}
