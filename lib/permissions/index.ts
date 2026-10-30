import type { Role, User } from "@/types";

/**
 * Centralised permission model.
 *
 * IMPORTANT: until the Supabase backend is connected these checks run in the browser and only shape the UI.
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

/**
 * Who a check is about: a bare account type (its default access), or a user, whose custom access list
 * (set by an admin on the Staff page) replaces the account-type defaults. Admin accounts always have
 * full access, so the showroom can never lock itself out.
 */
export type PermissionSubject = Role | Pick<User, "role" | "permissions"> | null | undefined;

export function permissionsFor(subject: PermissionSubject): ReadonlySet<Permission> {
  if (!subject) return new Set();
  if (typeof subject === "string") return ROLE_PERMISSIONS[subject];
  if (subject.role === "admin" || !subject.permissions) return ROLE_PERMISSIONS[subject.role];
  return new Set(subject.permissions.filter((p): p is Permission => ALL.has(p as Permission)));
}

/** True when a user's access differs from their account type's defaults. */
export function hasCustomAccess(user: Pick<User, "role" | "permissions">): boolean {
  return user.role !== "admin" && !!user.permissions;
}

export function can(subject: PermissionSubject, permission: Permission): boolean {
  return permissionsFor(subject).has(permission);
}

export function canAll(subject: PermissionSubject, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => can(subject, p));
}

export function canAny(subject: PermissionSubject, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(subject, p));
}

/** Permissions grouped and described for the access editor on the Staff page. */
export const PERMISSION_GROUPS: { label: string; items: { permission: Permission; label: string }[] }[] = [
  {
    label: "Inventory",
    items: [
      { permission: "dashboard.view", label: "See the dashboard" },
      { permission: "inventory.view", label: "View cars in stock" },
      { permission: "inventory.edit", label: "Edit car details and prices" },
      { permission: "inventory.photos", label: "Add and manage photos" },
      { permission: "inventory.export", label: "Export the stock list" },
    ],
  },
  {
    label: "Purchases",
    items: [
      { permission: "purchases.view", label: "View purchases" },
      { permission: "purchases.manage", label: "Record, edit and cancel purchases" },
    ],
  },
  {
    label: "Sales",
    items: [
      { permission: "sales.view", label: "View sales" },
      { permission: "sales.viewAll", label: "See everyone's sales (not just their own)" },
      { permission: "sales.create", label: "Create reservations and sales" },
      { permission: "sales.cancel", label: "Cancel sales" },
      { permission: "payments.record", label: "Record payments" },
      { permission: "receipts.print", label: "Print receipts and invoices" },
    ],
  },
  {
    label: "Money",
    items: [
      { permission: "expenses.view", label: "View expenses" },
      { permission: "expenses.manage", label: "Add, edit and delete expenses" },
      { permission: "finance.viewCost", label: "See purchase cost" },
      { permission: "finance.viewProfit", label: "See profit" },
      { permission: "reports.view", label: "Open reports" },
      { permission: "reports.financial", label: "Financial reports" },
    ],
  },
  {
    label: "Administration",
    items: [
      { permission: "data.export", label: "Import and export data" },
      { permission: "activity.view", label: "See everyone's activity" },
      { permission: "users.manage", label: "Manage staff and their access" },
      { permission: "settings.manage", label: "Change showroom settings" },
    ],
  },
];

/** Route → permission required to open it. Used by the sidebar and the route guard. */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/inventory", permission: "inventory.view" },
  { prefix: "/purchases/new", permission: "purchases.manage" },
  { prefix: "/purchases", permission: "purchases.view" },
  { prefix: "/sales/new", permission: "sales.create" },
  { prefix: "/sales", permission: "sales.view" },
  { prefix: "/expenses", permission: "expenses.view" },
  { prefix: "/reports", permission: "reports.view" },
  { prefix: "/staff", permission: "users.manage" },
  { prefix: "/activity", permission: "activity.view" },
  { prefix: "/settings", permission: "settings.manage" },
  { prefix: "/receipt", permission: "receipts.print" },
  { prefix: "/invoice", permission: "receipts.print" },
  { prefix: "/data", permission: "data.export" },
];

export function canAccessPath(subject: PermissionSubject, pathname: string): boolean {
  const match = ROUTE_PERMISSIONS.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  return match ? can(subject, match.permission) : can(subject, "dashboard.view");
}
