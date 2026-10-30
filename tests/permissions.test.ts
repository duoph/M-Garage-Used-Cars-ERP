import { describe, expect, it } from "vitest";
import { can, canAccessPath, hasCustomAccess, PERMISSIONS, permissionsFor } from "@/lib/permissions";
import { visibleActivity } from "@/features/activity/activity-utils";
import type { ActivityLog, User } from "@/types";

describe("role permissions", () => {
  it("admin has every permission", () => {
    for (const p of PERMISSIONS) expect(can("admin", p)).toBe(true);
  });
  it("manager cannot manage users or settings", () => {
    expect(can("manager", "users.manage")).toBe(false);
    expect(can("manager", "settings.manage")).toBe(false);
    expect(can("manager", "finance.viewProfit")).toBe(true);
    expect(can("manager", "purchases.manage")).toBe(true);
  });
  it("sales staff never see cost, profit, purchases or internal expenses", () => {
    for (const p of ["finance.viewCost", "finance.viewProfit", "purchases.view", "purchases.manage", "expenses.view", "reports.financial", "users.manage", "data.export"] as const)
      expect(can("sales", p), p).toBe(false);
    expect(can("sales", "sales.create")).toBe(true);
    expect(can("sales", "receipts.print")).toBe(true);
  });
  it("accountant cannot edit vehicles, photos, users or settings", () => {
    for (const p of ["inventory.edit", "inventory.photos", "users.manage", "settings.manage", "sales.create"] as const) expect(can("accountant", p), p).toBe(false);
    expect(can("accountant", "payments.record")).toBe(true);
    expect(can("accountant", "expenses.manage")).toBe(true);
  });
  it("guards routes", () => {
    expect(canAccessPath("sales", "/purchases")).toBe(false);
    expect(canAccessPath("sales", "/inventory/abc")).toBe(true);
    expect(canAccessPath("manager", "/staff")).toBe(false);
    expect(canAccessPath("accountant", "/purchases/new")).toBe(false);
    expect(canAccessPath("accountant", "/purchases/abc")).toBe(true);
    expect(canAccessPath(null, "/")).toBe(false);
  });
  it("hides sensitive and others' activity from sales staff", () => {
    const mk = (over: Partial<ActivityLog>): ActivityLog => ({
      id: Math.random().toString(), actorId: "a", entityType: "sale", entityId: "x", action: "sale.completed", timestamp: "", description: "", href: null, metadata: {}, ...over,
    });
    const entries = [
      mk({ actorId: "me" }),
      mk({ actorId: "other" }),
      mk({ actorId: "me", action: "purchase.created", entityType: "purchase", metadata: { sensitive: true } }),
    ];
    expect(visibleActivity(entries, { id: "me", role: "sales" } as User)).toHaveLength(1);
    expect(visibleActivity(entries, { id: "me", role: "admin" } as User)).toHaveLength(3);
  });
});

describe("custom access per user", () => {
  it("uses the account type's defaults until an admin customises it", () => {
    expect(can({ role: "sales" }, "finance.viewCost")).toBe(false);
    expect(can({ role: "sales", permissions: null }, "sales.create")).toBe(true);
  });

  it("replaces the defaults with the custom list", () => {
    const sales = { role: "sales" as const, permissions: ["inventory.view", "finance.viewCost"] };
    expect(can(sales, "finance.viewCost")).toBe(true);
    expect(can(sales, "sales.create")).toBe(false);
    expect(canAccessPath(sales, "/sales")).toBe(false);
    expect(canAccessPath(sales, "/inventory")).toBe(true);
  });

  it("never restricts an admin account", () => {
    const admin = { role: "admin" as const, permissions: ["inventory.view"] };
    expect(can(admin, "users.manage")).toBe(true);
    expect(hasCustomAccess(admin)).toBe(false);
  });

  it("ignores unknown permission names", () => {
    expect([...permissionsFor({ role: "manager", permissions: ["inventory.view", "rocket.launch"] })]).toEqual(["inventory.view"]);
  });
});
