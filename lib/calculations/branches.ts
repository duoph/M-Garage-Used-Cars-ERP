import type { Branch, ID } from "@/types";
import type { Dataset } from "./selectors";

/**
 * The part of the showroom a branch-limited person sees: their branch's cars, purchases, sales, expenses,
 * returns, cash and ledger. Shared accounts (banks, owner, lenders) stay visible, with only their branch's
 * movements. `branchIds` null = every branch.
 *
 * This only shapes the UI until a server returns role-filtered data (see PRODUCTION_READINESS.md).
 */
export function scopeDataset(ds: Dataset, branchIds: readonly ID[] | null): Dataset {
  if (!branchIds) return ds;
  const ok = (b: ID | null | undefined) => !b || branchIds.includes(b);
  const vehicles = ds.vehicles.filter((v) => ok(v.branchId));
  const vehicleIds = new Set(vehicles.map((v) => v.id));
  const purchases = ds.purchases.filter((p) => ok(p.branchId));
  const purchaseIds = new Set(purchases.map((p) => p.id));
  const sales = ds.sales.filter((s) => ok(s.branchId));
  const saleIds = new Set(sales.map((s) => s.id));
  const salesReturns = ds.salesReturns.filter((r) => ok(r.branchId));
  const purchaseReturns = ds.purchaseReturns.filter((r) => ok(r.branchId));
  const returnIds = new Set([...salesReturns, ...purchaseReturns].map((r) => r.id));
  return {
    ...ds,
    vehicles,
    purchases,
    sales,
    salesReturns,
    purchaseReturns,
    images: ds.images.filter((i) => vehicleIds.has(i.vehicleId)),
    reservations: ds.reservations.filter((r) => vehicleIds.has(r.vehicleId)),
    payments: ds.payments.filter((p) => saleIds.has(p.saleId)),
    purchasePayments: ds.purchasePayments.filter((p) => purchaseIds.has(p.purchaseId)),
    refunds: ds.refunds.filter((r) => returnIds.has(r.returnId)),
    expenses: ds.expenses.filter((e) => ok(e.branchId)),
    vouchers: ds.vouchers.filter((v) => ok(v.branchId)),
    accounts: ds.accounts.filter((a) => a.kind !== "cash" || ok(a.branchId)),
    ledger: ds.ledger.filter((e) => ok(e.branchId)),
    dayCloses: ds.dayCloses.filter((c) => ok(c.branchId)),
    documents: ds.documents.filter((d) => !d.vehicleId || vehicleIds.has(d.vehicleId)),
  };
}

export function liveBranches(branches: readonly Branch[]): Branch[] {
  return branches.filter((b) => !b.archived).sort((a, b) => a.name.localeCompare(b.name));
}

export function branchName(branches: readonly Branch[], id: ID | null | undefined): string {
  if (!id) return "—";
  return branches.find((b) => b.id === id)?.name ?? "—";
}
