import type {
  ExpenseCategory,
  FuelType,
  PaymentMethod,
  PaymentStatus,
  ReservationStatus,
  Role,
  SaleStatus,
  Transmission,
  VehicleStatus,
} from "@/types";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin / Owner",
  manager: "Manager",
  sales: "Sales Staff",
  accountant: "Accountant",
};

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

export const FUEL_LABELS: Record<FuelType, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  cng: "CNG",
  electric: "Electric",
  hybrid: "Hybrid",
};

export const TRANSMISSION_LABELS: Record<Transmission, string> = {
  manual: "Manual",
  automatic: "Automatic",
  amt: "AMT",
  cvt: "CVT",
  dct: "DCT",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  card: "Card",
  finance: "Finance / Loan",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partially Paid",
  paid: "Paid",
};

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  completed: "Completed",
  cancelled: "Cancelled",
};

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  active: "Active",
  converted: "Converted to sale",
  cancelled: "Cancelled",
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  repair: "Repair",
  mechanical: "Mechanical work",
  painting: "Painting",
  detailing: "Detailing / cleaning",
  transportation: "Transportation",
  documentation: "Registration / documentation",
  vehicle_misc: "Misc. vehicle expense",
  rent: "Rent",
  utilities: "Utilities",
  salary: "Salary",
  marketing: "Marketing",
  office: "Office expenses",
  maintenance: "Maintenance",
  general_misc: "Miscellaneous",
};

export function vehicleTitle(v: { make: string; model: string }): string {
  return `${v.make} ${v.model}`;
}

export function vehicleSubtitle(v: { variant: string; year: number }): string {
  return [v.year, v.variant].filter(Boolean).join(" · ");
}

export function formatKm(km: number): string {
  return `${new Intl.NumberFormat("en-IN").format(km)} km`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
