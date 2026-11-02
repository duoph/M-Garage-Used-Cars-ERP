import type {
  AccountKind,
  DocumentKind,
  ExpenseCategory,
  InsuranceType,
  VoucherHead,
  VoucherType,
  FuelType,
  PaymentMethod,
  PaymentStatus,
  ReservationStatus,
  Role,
  SaleStatus,
  Transmission,
  VehicleStatus,
} from "@/types";

/** Account types. Internal ids stay short; the labels match the account names used in the business. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin account",
  manager: "Manager account",
  office: "Office Admin account",
  sales: "Sales account",
  accountant: "Accountant account",
};

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  returned_inspection: "Returned – Inspection",
  returned_to_supplier: "Returned to Supplier",
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

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: "Cash in hand",
  bank: "Bank account",
  owner: "Owner",
  finance: "Loan due from lender",
};

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  receipt: "Receipt voucher",
  payment: "Payment voucher",
  contra: "Contra voucher",
};

export const VOUCHER_HEAD_LABELS: Record<VoucherHead, string> = {
  other_income: "Other income",
  commission_received: "Commission received",
  service_charges: "Service / RTO charges collected",
  capital_introduced: "Capital introduced",
  loan_received: "Loan received",
  refund_from_seller: "Refund from seller",
  misc_receipt: "Miscellaneous receipt",
  seller_payment: "Payment to seller",
  refund_to_buyer: "Refund to buyer",
  commission_paid: "Commission / brokerage paid",
  staff_advance: "Staff advance",
  owner_drawings: "Owner drawings",
  loan_repayment: "Loan repayment",
  misc_payment: "Miscellaneous payment",
  transfer: "Transfer between accounts",
};

export const INSURANCE_TYPE_LABELS: Record<InsuranceType, string> = {
  comprehensive: "Comprehensive",
  third_party: "Third party",
  zero_dep: "Zero depreciation",
  none: "Not insured",
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  id_proof: "ID proof",
  address_proof: "Address proof",
  pan_card: "PAN card",
  sale_letter: "Sale letter",
  delivery_note: "Delivery note",
  rc: "RC book / card",
  insurance: "Insurance policy",
  puc: "Pollution (PUC)",
  noc: "Bank NOC",
  form_29_30: "Form 29 / 30",
  other: "Other",
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
