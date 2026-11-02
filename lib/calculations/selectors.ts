import { format, parseISO, startOfMonth, subMonths } from "date-fns";
import type {
  ActivityLog,
  Branch,
  BusinessSettings,
  DayClose,
  LedgerEntry,
  PurchasePayment,
  PurchaseReturn,
  ReturnRefund,
  SalesReturn,
  Customer,
  Expense,
  ExpenseCategory,
  ID,
  MoneyAccount,
  Paise,
  Purchase,
  Reservation,
  Sale,
  SalePayment,
  StoredDocument,
  User,
  Vehicle,
  VehicleImage,
  VehicleStatus,
  Voucher,
} from "@/types";
import { VEHICLE_EXPENSE_CATEGORIES } from "@/types";
import { daysSince, inRange, type DateRange } from "@/lib/utils/dates";
import { sumPaise } from "@/lib/utils/money";
import { grossMarginPct, grossProfit, landedCost, saleTotals, type SaleTotals } from "./finance";

/** The full in-memory snapshot all screens derive from, so every module shares the same numbers. */
export interface Dataset {
  users: User[];
  vehicles: Vehicle[];
  purchases: Purchase[];
  images: VehicleImage[];
  customers: Customer[];
  reservations: Reservation[];
  sales: Sale[];
  payments: SalePayment[];
  expenses: Expense[];
  accounts: MoneyAccount[];
  vouchers: Voucher[];
  documents: StoredDocument[];
  activity: ActivityLog[];
  settings: BusinessSettings;
  branches: Branch[];
  /** The stored ledger: every money movement, already posted to its account. */
  ledger: LedgerEntry[];
  purchasePayments: PurchasePayment[];
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
  refunds: ReturnRefund[];
  dayCloses: DayClose[];
}

/** Optional tables default to empty, so partial snapshots (tests, posting) can be indexed. */
export function emptyDataset(settings: BusinessSettings): Dataset {
  return {
    users: [], vehicles: [], purchases: [], images: [], customers: [], reservations: [], sales: [], payments: [], expenses: [],
    accounts: [], vouchers: [], documents: [], activity: [], settings, branches: [], ledger: [], purchasePayments: [],
    salesReturns: [], purchaseReturns: [], refunds: [], dayCloses: [],
  };
}

export interface DatasetIndex {
  users: Map<ID, User>;
  vehicles: Map<ID, Vehicle>;
  purchases: Map<ID, Purchase>;
  customers: Map<ID, Customer>;
  sales: Map<ID, Sale>;
  imagesByVehicle: Map<ID, VehicleImage[]>;
  expensesByVehicle: Map<ID, Expense[]>;
  paymentsBySale: Map<ID, SalePayment[]>;
  completedSaleByVehicle: Map<ID, Sale>;
  salesByVehicle: Map<ID, Sale[]>;
  activeReservationByVehicle: Map<ID, Reservation>;
  reservationsByVehicle: Map<ID, Reservation[]>;
  branches: Map<ID, Branch>;
  accounts: Map<ID, MoneyAccount>;
  purchasePaymentsByPurchase: Map<ID, PurchasePayment[]>;
  salesReturnsBySale: Map<ID, SalesReturn[]>;
  purchaseReturnsByPurchase: Map<ID, PurchaseReturn[]>;
  refundsByReturn: Map<ID, ReturnRefund[]>;
}

function group<T>(items: readonly T[], key: (t: T) => ID | null): Map<ID, T[]> {
  const map = new Map<ID, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function indexDataset(ds: Dataset): DatasetIndex {
  const imagesByVehicle = group(ds.images, (i) => i.vehicleId);
  imagesByVehicle.forEach((list) => list.sort((a, b) => a.order - b.order));
  const paymentsBySale = group(ds.payments, (p) => p.saleId);
  paymentsBySale.forEach((list) =>
    list.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "booking" ? -1 : 1) || a.receiptNumber.localeCompare(b.receiptNumber)),
  );
  return {
    users: new Map(ds.users.map((u) => [u.id, u])),
    vehicles: new Map(ds.vehicles.map((v) => [v.id, v])),
    purchases: new Map(ds.purchases.map((p) => [p.id, p])),
    customers: new Map(ds.customers.map((c) => [c.id, c])),
    sales: new Map(ds.sales.map((s) => [s.id, s])),
    imagesByVehicle,
    expensesByVehicle: group(ds.expenses, (e) => e.vehicleId),
    paymentsBySale,
    // A sale whose car came back no longer owns the car; it can be sold again.
    completedSaleByVehicle: new Map(ds.sales.filter((s) => s.status === "completed" && s.returnStatus !== "returned").map((s) => [s.vehicleId, s])),
    salesByVehicle: group(ds.sales, (s) => s.vehicleId),
    activeReservationByVehicle: new Map(ds.reservations.filter((r) => r.status === "active").map((r) => [r.vehicleId, r])),
    reservationsByVehicle: group(ds.reservations, (r) => r.vehicleId),
    branches: new Map(ds.branches.map((b) => [b.id, b])),
    accounts: new Map(ds.accounts.map((a) => [a.id, a])),
    purchasePaymentsByPurchase: group(ds.purchasePayments, (p) => p.purchaseId),
    salesReturnsBySale: group(ds.salesReturns, (r) => r.saleId),
    purchaseReturnsByPurchase: group(ds.purchaseReturns, (r) => r.purchaseId),
    refundsByReturn: group(ds.refunds, (r) => r.returnId),
  };
}

export interface VehicleView {
  vehicle: Vehicle;
  purchase: Purchase | undefined;
  images: VehicleImage[];
  cover: VehicleImage | undefined;
  expenses: Expense[];
  expensesPaise: Paise;
  landedCostPaise: Paise;
  sale: Sale | undefined;
  saleTotals: SaleTotals | undefined;
  /** Realised gross profit; null until a sale is completed. */
  profitPaise: Paise | null;
  marginPct: number | null;
  reservation: Reservation | undefined;
  reservationCustomer: Customer | undefined;
  buyer: Customer | undefined;
  stockAgeDays: number;
}

export function vehicleView(v: Vehicle, idx: DatasetIndex, now: Date = new Date()): VehicleView {
  const purchase = idx.purchases.get(v.purchaseId);
  const images = idx.imagesByVehicle.get(v.id) ?? [];
  const cover = images.find((i) => i.id === v.coverImageId) ?? images.find((i) => i.isCover) ?? images[0];
  const expenses = (idx.expensesByVehicle.get(v.id) ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const expensesPaise = sumPaise(expenses.map((e) => e.amountPaise));
  const purchasePrice = purchase?.purchasePricePaise ?? 0;
  const sale = idx.completedSaleByVehicle.get(v.id);
  const totals = sale ? saleTotals(sale, idx.paymentsBySale.get(sale.id) ?? []) : undefined;
  const profitPaise = sale ? saleProfit(sale, purchasePrice, expensesPaise) : null;
  const reservation = idx.activeReservationByVehicle.get(v.id);
  const acquired = purchase?.purchaseDate ?? v.createdAt;
  const stockAgeDays = sale
    ? Math.max(0, daysSince(acquired, parseISO(sale.saleDate)))
    : daysSince(acquired, now);
  return {
    vehicle: v,
    purchase,
    images,
    cover,
    expenses,
    expensesPaise,
    landedCostPaise: landedCost(purchasePrice, expensesPaise),
    sale,
    saleTotals: totals,
    profitPaise,
    marginPct: sale && profitPaise !== null ? grossMarginPct(profitPaise, netSalePrice(sale)) : null,
    reservation,
    reservationCustomer: reservation ? idx.customers.get(reservation.customerId) : undefined,
    buyer: sale ? idx.customers.get(sale.customerId) : undefined,
    stockAgeDays,
  };
}

/** Sale price less what sales returns gave back. */
export function netSalePrice(sale: Sale): Paise {
  return sale.salePricePaise - (sale.returnedPaise ?? 0);
}

/**
 * Profit on a sale after returns. When the car itself came back it is stock again, so its cost is not
 * charged; only the deductions kept on the return remain as income.
 */
export function saleProfit(sale: Sale, purchasePricePaise: Paise, vehicleExpensesPaise: Paise): Paise {
  if (sale.returnStatus === "returned") return netSalePrice(sale);
  return grossProfit(netSalePrice(sale), purchasePricePaise, vehicleExpensesPaise);
}

/** Active (non-archived) vehicles, newest first. */
export function activeVehicles(ds: Dataset): Vehicle[] {
  return ds.vehicles.filter((v) => !v.archivedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface SaleView {
  sale: Sale;
  vehicle: Vehicle | undefined;
  customer: Customer | undefined;
  soldBy: User | undefined;
  payments: SalePayment[];
  totals: SaleTotals;
  purchasePricePaise: Paise;
  vehicleExpensesPaise: Paise;
  profitPaise: Paise;
  marginPct: number | null;
}

export function saleView(sale: Sale, idx: DatasetIndex): SaleView {
  const vehicle = idx.vehicles.get(sale.vehicleId);
  const purchase = vehicle ? idx.purchases.get(vehicle.purchaseId) : undefined;
  const payments = idx.paymentsBySale.get(sale.id) ?? [];
  const vehicleExpensesPaise = sumPaise((idx.expensesByVehicle.get(sale.vehicleId) ?? []).map((e) => e.amountPaise));
  const purchasePricePaise = purchase?.purchasePricePaise ?? 0;
  const profitPaise = saleProfit(sale, purchasePricePaise, vehicleExpensesPaise);
  return {
    sale,
    vehicle,
    customer: idx.customers.get(sale.customerId),
    soldBy: idx.users.get(sale.soldBy),
    payments,
    totals: saleTotals(sale, payments),
    purchasePricePaise,
    vehicleExpensesPaise,
    profitPaise,
    marginPct: grossMarginPct(profitPaise, netSalePrice(sale)),
  };
}

export function isVehicleExpense(e: Pick<Expense, "vehicleId">): boolean {
  return e.vehicleId !== null;
}

export interface InventoryCounts {
  inStock: number;
  available: number;
  reserved: number;
  sold: number;
  askingValuePaise: Paise;
  acquisitionValuePaise: Paise;
}

export function inventoryCounts(ds: Dataset, idx: DatasetIndex): InventoryCounts {
  const active = ds.vehicles.filter((v) => !v.archivedAt);
  const inStock = active.filter((v) => v.status !== "sold");
  return {
    inStock: inStock.length,
    available: active.filter((v) => v.status === "available").length,
    reserved: active.filter((v) => v.status === "reserved").length,
    sold: active.filter((v) => v.status === "sold").length,
    askingValuePaise: sumPaise(inStock.map((v) => v.askingPricePaise)),
    acquisitionValuePaise: sumPaise(
      inStock.map((v) => {
        const p = idx.purchases.get(v.purchaseId);
        const exp = sumPaise((idx.expensesByVehicle.get(v.id) ?? []).map((e) => e.amountPaise));
        return landedCost(p?.purchasePricePaise ?? 0, exp);
      }),
    ),
  };
}

export interface PeriodSummary {
  soldCount: number;
  revenuePaise: Paise;
  receivedPaise: Paise;
  grossProfitPaise: Paise;
  operatingExpensesPaise: Paise;
  vehicleExpensesPaise: Paise;
  /** Gross profit − general operating expenses for the period. */
  netContributionPaise: Paise;
  purchasesCount: number;
  acquisitionPaise: Paise;
}

export function periodSummary(ds: Dataset, idx: DatasetIndex, range: Pick<DateRange, "from" | "to">): PeriodSummary {
  const sales = ds.sales.filter((s) => s.status === "completed" && inRange(s.saleDate, range));
  const soldCount = sales.filter((s) => s.returnStatus !== "returned").length;
  const views = sales.map((s) => saleView(s, idx));
  const expenses = ds.expenses.filter((e) => inRange(e.date, range));
  const operating = sumPaise(expenses.filter((e) => !isVehicleExpense(e)).map((e) => e.amountPaise));
  const grossProfitPaise = sumPaise(views.map((v) => v.profitPaise));
  const purchases = ds.purchases.filter((p) => p.status === "active" && inRange(p.purchaseDate, range));
  return {
    soldCount,
    revenuePaise: sumPaise(sales.map(netSalePrice)),
    receivedPaise: sumPaise(views.map((v) => v.totals.receivedPaise)),
    grossProfitPaise,
    operatingExpensesPaise: operating,
    vehicleExpensesPaise: sumPaise(expenses.filter(isVehicleExpense).map((e) => e.amountPaise)),
    netContributionPaise: grossProfitPaise - operating,
    purchasesCount: purchases.length,
    acquisitionPaise: sumPaise(purchases.map((p) => p.purchasePricePaise)),
  };
}

/** Outstanding customer balances across all completed sales (not period-bound). */
export function outstandingBalances(ds: Dataset, idx: DatasetIndex): { totalPaise: Paise; count: number } {
  const views = ds.sales.filter((s) => s.status === "completed").map((s) => saleView(s, idx));
  const due = views.filter((v) => v.totals.balancePaise > 0);
  return { totalPaise: sumPaise(due.map((v) => v.totals.balancePaise)), count: due.length };
}

export interface MonthlyPoint {
  key: string;
  label: string;
  revenuePaise: Paise;
  profitPaise: Paise;
  count: number;
  expensesPaise: Paise;
}

export function monthlySeries(ds: Dataset, idx: DatasetIndex, months = 6, now: Date = new Date()): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = startOfMonth(subMonths(now, i));
    points.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM"), revenuePaise: 0, profitPaise: 0, count: 0, expensesPaise: 0 });
  }
  const byKey = new Map(points.map((p) => [p.key, p]));
  for (const s of ds.sales) {
    if (s.status !== "completed") continue;
    const p = byKey.get(s.saleDate.slice(0, 7));
    if (!p) continue;
    const v = saleView(s, idx);
    p.revenuePaise += netSalePrice(s);
    p.profitPaise += v.profitPaise;
    p.count += 1;
  }
  for (const e of ds.expenses) {
    if (e.vehicleId) continue;
    const p = byKey.get(e.date.slice(0, 7));
    if (p) p.expensesPaise += e.amountPaise;
  }
  return points;
}

export function expenseBreakdown(
  expenses: readonly Expense[],
): { category: ExpenseCategory; amountPaise: Paise; vehicle: boolean }[] {
  const totals = new Map<ExpenseCategory, Paise>();
  for (const e of expenses) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amountPaise);
  return [...totals.entries()]
    .map(([category, amountPaise]) => ({
      category,
      amountPaise,
      vehicle: (VEHICLE_EXPENSE_CATEGORIES as readonly string[]).includes(category),
    }))
    .sort((a, b) => b.amountPaise - a.amountPaise);
}

export function statusCounts(ds: Dataset): Record<VehicleStatus, number> {
  const active = ds.vehicles.filter((v) => !v.archivedAt);
  const count = (s: VehicleStatus) => active.filter((v) => v.status === s).length;
  return {
    available: count("available"),
    reserved: count("reserved"),
    sold: count("sold"),
    returned_inspection: count("returned_inspection"),
    returned_to_supplier: count("returned_to_supplier"),
  };
}
