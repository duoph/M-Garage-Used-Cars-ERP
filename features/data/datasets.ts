import type { Dataset, DatasetIndex } from "@/lib/calculations/selectors";
import { saleView, vehicleView } from "@/lib/calculations/selectors";
import { purchaseBalance } from "@/lib/calculations/finance";
import type { Permission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils/dates";
import {
  EXPENSE_CATEGORY_LABELS,
  FUEL_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  SALE_STATUS_LABELS,
  TRANSMISSION_LABELS,
  VEHICLE_STATUS_LABELS,
  vehicleTitle,
} from "@/lib/utils/labels";
import { toCsv } from "@/lib/utils/csv";
import { invoiceNumber } from "@/lib/utils/ids";
import type { Cell, SheetData } from "@/lib/utils/spreadsheet";
import { visibleActivity } from "@/features/activity/activity-utils";
import type { User, Vehicle } from "@/types";

/**
 * Every exportable list, as columns over rows. The same definitions produce CSV files and Excel
 * sheets. Money is exported as plain rupees so spreadsheets can add it up.
 */

export interface ExportContext {
  ds: Dataset;
  idx: DatasetIndex;
  user: User;
  can: (p: Permission) => boolean;
}

type Format = "text" | "money" | "integer";
interface Column<T> {
  header: string;
  value: (row: T) => Cell | undefined;
  format?: Format;
  width?: number;
}

export interface ExportDataset {
  id: string;
  label: string;
  description: string;
  available: (ctx: ExportContext) => boolean;
  build: (ctx: ExportContext) => SheetData;
}

const rupees = (paise: number | null | undefined): number | null => (paise === null || paise === undefined ? null : paise / 100);
const vehicleName = (v: Vehicle | undefined) => (v ? `${v.year} ${vehicleTitle(v)} ${v.variant}`.trim() : "");

function sheet<T>(name: string, rows: readonly T[], columns: (Column<T> | false)[]): SheetData {
  const cols = columns.filter((c): c is Column<T> => !!c);
  return {
    name,
    columns: cols.map((c) => ({ header: c.header, format: c.format, width: c.width })),
    rows: rows.map((r) => cols.map((c) => c.value(r) ?? null)),
  };
}

export const EXPORT_DATASETS: ExportDataset[] = [
  {
    id: "stock",
    label: "Stock",
    description: "Every car, with specs, status and asking price",
    available: ({ can }) => can("inventory.export"),
    build: ({ ds, idx, can }) => {
      const cost = can("finance.viewCost");
      const profit = can("finance.viewProfit");
      const rows = ds.vehicles.filter((v) => !v.archivedAt).map((v) => vehicleView(v, idx));
      return sheet("Stock", rows, [
        { header: "Stock No", value: (r) => r.vehicle.stockNumber },
        { header: "Make", value: (r) => r.vehicle.make },
        { header: "Model", value: (r) => r.vehicle.model },
        { header: "Variant", value: (r) => r.vehicle.variant },
        { header: "Year", value: (r) => r.vehicle.year },
        { header: "Registration", value: (r) => r.vehicle.registrationNumber, width: 15 },
        { header: "Chassis No", value: (r) => r.vehicle.chassisNumber, width: 20 },
        { header: "Engine No", value: (r) => r.vehicle.engineNumber, width: 15 },
        { header: "Fuel", value: (r) => FUEL_LABELS[r.vehicle.fuelType] },
        { header: "Transmission", value: (r) => TRANSMISSION_LABELS[r.vehicle.transmission] },
        { header: "Kilometers", value: (r) => r.vehicle.mileageKm, format: "integer" },
        { header: "Colour", value: (r) => r.vehicle.color },
        { header: "Owners", value: (r) => r.vehicle.previousOwners },
        { header: "Status", value: (r) => VEHICLE_STATUS_LABELS[r.vehicle.status] },
        { header: "Asking Price", value: (r) => rupees(r.vehicle.askingPricePaise), format: "money" },
        { header: "Days in Stock", value: (r) => r.stockAgeDays },
        cost && { header: "Purchase Date", value: (r) => r.purchase?.purchaseDate },
        cost && { header: "Purchase Price", value: (r) => rupees(r.purchase?.purchasePricePaise), format: "money" },
        cost && { header: "Vehicle Expenses", value: (r) => rupees(r.expensesPaise), format: "money" },
        cost && { header: "Landed Cost", value: (r) => rupees(r.landedCostPaise), format: "money" },
        profit && { header: "Sale Price", value: (r) => rupees(r.sale?.salePricePaise), format: "money" },
        profit && { header: "Gross Profit", value: (r) => rupees(r.profitPaise), format: "money" },
        { header: "Notes", value: (r) => r.vehicle.notes, width: 30 },
      ]);
    },
  },
  {
    id: "purchases",
    label: "Purchases",
    description: "Cars bought, sellers, prices and amounts owed",
    available: ({ can }) => can("purchases.view") && can("finance.viewCost"),
    build: ({ ds, idx }) =>
      sheet("Purchases", [...ds.purchases].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)), [
        { header: "Reference", value: (p) => p.reference, width: 15 },
        { header: "Date", value: (p) => p.purchaseDate, width: 12 },
        { header: "Stock No", value: (p) => idx.vehicles.get(p.vehicleId)?.stockNumber },
        { header: "Vehicle", value: (p) => vehicleName(idx.vehicles.get(p.vehicleId)), width: 30 },
        { header: "Registration", value: (p) => idx.vehicles.get(p.vehicleId)?.registrationNumber, width: 15 },
        { header: "Seller", value: (p) => p.sellerName, width: 20 },
        { header: "Seller Phone", value: (p) => p.sellerContact, width: 14 },
        { header: "Seller Address", value: (p) => p.sellerAddress, width: 20 },
        { header: "Purchase Price", value: (p) => rupees(p.purchasePricePaise), format: "money" },
        { header: "Amount Paid", value: (p) => rupees(p.amountPaidPaise), format: "money" },
        { header: "Balance", value: (p) => rupees(purchaseBalance(p)), format: "money" },
        { header: "Payment Method", value: (p) => PAYMENT_METHOD_LABELS[p.paymentMethod] },
        { header: "Payment Reference", value: (p) => p.paymentReference },
        { header: "Status", value: (p) => (p.status === "active" ? "Active" : "Cancelled") },
        { header: "Recorded By", value: (p) => idx.users.get(p.createdBy)?.name },
      ]),
  },
  {
    id: "sales",
    label: "Sales",
    description: "Sales with buyers, prices, payments and balances",
    available: ({ can }) => can("sales.view"),
    build: ({ ds, idx, can, user }) => {
      const profit = can("finance.viewProfit");
      const rows = ds.sales
        .filter((s) => can("sales.viewAll") || s.soldBy === user.id)
        .sort((a, b) => b.saleDate.localeCompare(a.saleDate))
        .map((s) => saleView(s, idx));
      return sheet("Sales", rows, [
        { header: "Reference", value: (r) => r.sale.reference, width: 15 },
        { header: "Invoice No", value: (r) => invoiceNumber(r.sale.reference), width: 15 },
        { header: "Date", value: (r) => r.sale.saleDate, width: 12 },
        { header: "Vehicle", value: (r) => vehicleName(r.vehicle), width: 30 },
        { header: "Registration", value: (r) => r.vehicle?.registrationNumber, width: 15 },
        { header: "Buyer", value: (r) => r.customer?.name, width: 20 },
        { header: "Buyer Phone", value: (r) => r.customer?.phone, width: 14 },
        { header: "Sale Price", value: (r) => rupees(r.sale.salePricePaise), format: "money" },
        { header: "Received", value: (r) => rupees(r.totals.receivedPaise), format: "money" },
        { header: "Balance", value: (r) => rupees(r.sale.status === "completed" ? r.totals.balancePaise : 0), format: "money" },
        { header: "Payment Status", value: (r) => PAYMENT_STATUS_LABELS[r.totals.paymentStatus] },
        { header: "Status", value: (r) => SALE_STATUS_LABELS[r.sale.status] },
        profit && { header: "Gross Profit", value: (r) => rupees(r.sale.status === "completed" ? r.profitPaise : null), format: "money" },
        { header: "Sold By", value: (r) => r.soldBy?.name },
      ]);
    },
  },
  {
    id: "payments",
    label: "Payments received",
    description: "Every receipt from buyers",
    available: ({ can }) => can("sales.viewAll"),
    build: ({ ds, idx }) =>
      sheet("Payments", [...ds.payments].sort((a, b) => b.date.localeCompare(a.date)), [
        { header: "Receipt No", value: (p) => p.receiptNumber, width: 15 },
        { header: "Date", value: (p) => p.date, width: 12 },
        { header: "Sale", value: (p) => idx.sales.get(p.saleId)?.reference, width: 15 },
        { header: "Buyer", value: (p) => { const s = idx.sales.get(p.saleId); return s ? idx.customers.get(s.customerId)?.name : ""; }, width: 20 },
        { header: "Vehicle", value: (p) => { const s = idx.sales.get(p.saleId); return s ? vehicleName(idx.vehicles.get(s.vehicleId)) : ""; }, width: 30 },
        { header: "Amount", value: (p) => rupees(p.amountPaise), format: "money" },
        { header: "Method", value: (p) => PAYMENT_METHOD_LABELS[p.method] },
        { header: "Reference", value: (p) => p.reference },
        { header: "Type", value: (p) => (p.kind === "booking" ? "Booking" : "Payment") },
        { header: "Recorded By", value: (p) => idx.users.get(p.recordedBy)?.name },
      ]),
  },
  {
    id: "expenses",
    label: "Expenses",
    description: "Vehicle and showroom expenses",
    available: ({ can }) => can("expenses.view"),
    build: ({ ds, idx }) =>
      sheet("Expenses", [...ds.expenses].sort((a, b) => b.date.localeCompare(a.date)), [
        { header: "Date", value: (e) => e.date, width: 12 },
        { header: "Reference", value: (e) => e.reference, width: 15 },
        { header: "Category", value: (e) => EXPENSE_CATEGORY_LABELS[e.category], width: 15 },
        { header: "Description", value: (e) => e.description, width: 30 },
        { header: "Vendor", value: (e) => e.vendor, width: 20 },
        { header: "Vehicle Registration", value: (e) => (e.vehicleId ? idx.vehicles.get(e.vehicleId)?.registrationNumber : ""), width: 15 },
        { header: "Payment Method", value: (e) => PAYMENT_METHOD_LABELS[e.paymentMethod] },
        { header: "Amount", value: (e) => rupees(e.amountPaise), format: "money" },
        { header: "Notes", value: (e) => e.notes, width: 20 },
        { header: "Recorded By", value: (e) => idx.users.get(e.createdBy)?.name },
      ]),
  },
  {
    id: "customers",
    label: "Customers",
    description: "Buyers with their purchases and total spent",
    available: ({ can }) => can("sales.viewAll"),
    build: ({ ds }) => {
      const done = ds.sales.filter((s) => s.status === "completed");
      return sheet("Customers", [...ds.customers].sort((a, b) => a.name.localeCompare(b.name)), [
        { header: "Name", value: (c) => c.name, width: 20 },
        { header: "Phone", value: (c) => c.phone, width: 14 },
        { header: "Address", value: (c) => c.address, width: 25 },
        { header: "Cars Bought", value: (c) => done.filter((s) => s.customerId === c.id).length },
        { header: "Total Spent", value: (c) => rupees(done.filter((s) => s.customerId === c.id).reduce((a, s) => a + s.salePricePaise, 0)), format: "money" },
        { header: "Customer Since", value: (c) => c.createdAt.slice(0, 10), width: 12 },
        { header: "Notes", value: (c) => c.notes, width: 20 },
      ]);
    },
  },
  {
    id: "activity",
    label: "Activity log",
    description: "Who changed what, and when",
    available: ({ can }) => can("activity.view"),
    build: ({ ds, idx, user }) =>
      sheet("Activity", visibleActivity(ds.activity, user), [
        { header: "Time", value: (a) => formatDateTime(a.timestamp), width: 18 },
        { header: "Who", value: (a) => idx.users.get(a.actorId)?.name, width: 16 },
        { header: "Action", value: (a) => a.action, width: 18 },
        { header: "Description", value: (a) => a.description, width: 60 },
      ]),
  },
];

export function sheetToCsv(data: SheetData): string {
  return toCsv(data.rows, data.columns.map((c, i) => ({
    header: c.header,
    value: (row: Cell[]) => {
      const v = row[i];
      if (typeof v === "number" && c.format === "money") return v.toFixed(2);
      if (typeof v === "boolean") return v ? "Yes" : "No";
      return v;
    },
  })));
}
