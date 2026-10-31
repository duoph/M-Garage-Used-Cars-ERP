/**
 * Core domain model for DealerOS.
 *
 * Conventions
 * - All money is stored as integer paise (₹1 = 100 paise). Never floats.
 * - Business dates (purchase date, sale date…) are local calendar dates stored as `YYYY-MM-DD`.
 * - Timestamps (createdAt/updatedAt) are full ISO-8601 strings.
 * - Identifiers are UUIDs; human-facing references (PUR-2026-0001) are separate fields.
 */

export type ID = string;
/** Local calendar date, `YYYY-MM-DD`. */
export type ISODate = string;
/** Full ISO-8601 timestamp. */
export type ISODateTime = string;
/** Integer amount in paise. */
export type Paise = number;

export interface Timestamps {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ─── Enumerations ──────────────────────────────────────────────────────────────

export const ROLES = ["admin", "manager", "office", "sales", "accountant"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["active", "inactive"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const VEHICLE_STATUSES = ["available", "reserved", "sold"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const FUEL_TYPES = ["petrol", "diesel", "cng", "electric", "hybrid"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const TRANSMISSIONS = ["manual", "automatic", "amt", "cvt", "dct"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "cheque", "card", "finance"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PURCHASE_STATUSES = ["active", "cancelled"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const RESERVATION_STATUSES = ["active", "converted", "cancelled"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const SALE_STATUSES = ["completed", "cancelled"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const VEHICLE_EXPENSE_CATEGORIES = [
  "repair",
  "mechanical",
  "painting",
  "detailing",
  "transportation",
  "documentation",
  "vehicle_misc",
] as const;
export const GENERAL_EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salary",
  "marketing",
  "office",
  "maintenance",
  "general_misc",
] as const;
export const EXPENSE_CATEGORIES = [...VEHICLE_EXPENSE_CATEGORIES, ...GENERAL_EXPENSE_CATEGORIES] as const;
export type VehicleExpenseCategory = (typeof VEHICLE_EXPENSE_CATEGORIES)[number];
export type GeneralExpenseCategory = (typeof GENERAL_EXPENSE_CATEGORIES)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const ENTITY_TYPES = [
  "purchase",
  "vehicle",
  "reservation",
  "sale",
  "payment",
  "expense",
  "user",
  "settings",
  "account",
  "voucher",
  "document",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ACTIVITY_ACTIONS = [
  "purchase.created",
  "purchase.updated",
  "purchase.cancelled",
  "vehicle.created",
  "vehicle.updated",
  "vehicle.price_changed",
  "photo.added",
  "photo.removed",
  "photo.reordered",
  "reservation.created",
  "reservation.cancelled",
  "sale.completed",
  "sale.cancelled",
  "payment.recorded",
  "expense.created",
  "expense.updated",
  "expense.deleted",
  "user.created",
  "user.updated",
  "user.role_changed",
  "user.status_changed",
  "user.access_changed",
  "settings.updated",
  "data.imported",
  "data.reset",
  "vehicle.papers_updated",
  "account.created",
  "account.updated",
  "voucher.created",
  "voucher.cancelled",
  "document.uploaded",
  "document.removed",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

// ─── Entities ──────────────────────────────────────────────────────────────────

export interface User extends Timestamps {
  id: ID;
  name: string;
  email: string;
  phone: string;
  /** Account type: sets the default access (admin, manager, sales or accountant account). */
  role: Role;
  status: UserStatus;
  /** Job title shown on documents and in staff lists, picked from the showroom's designations. */
  designation?: string;
  /**
   * Custom access chosen by an admin, replacing the account type's defaults. Null/absent = defaults.
   * Ignored for admin accounts, which always have full access.
   */
  permissions?: string[] | null;
}

export interface Vehicle extends Timestamps {
  id: ID;
  /** Human stock number, e.g. STK-0012. */
  stockNumber: string;
  purchaseId: ID;
  make: string;
  model: string;
  variant: string;
  year: number;
  registrationNumber: string;
  chassisNumber: string;
  engineNumber: string;
  fuelType: FuelType;
  transmission: Transmission;
  mileageKm: number;
  color: string;
  previousOwners: number;
  askingPricePaise: Paise;
  status: VehicleStatus;
  coverImageId: ID | null;
  notes: string;
  /** Set when the originating purchase is cancelled; archived vehicles leave active stock. */
  archivedAt: ISODateTime | null;
  /** Insurance, pollution, RC validity and hypothecation. Absent on cars added before papers were tracked. */
  papers?: VehiclePapers;
}

export const INSURANCE_TYPES = ["comprehensive", "third_party", "zero_dep", "none"] as const;
export type InsuranceType = (typeof INSURANCE_TYPES)[number];

export interface VehiclePapers {
  insuranceType: InsuranceType;
  insuranceCompany: string;
  insurancePolicyNumber: string;
  /** Empty when unknown. */
  insuranceValidTill: ISODate | "";
  pucValidTill: ISODate | "";
  /** Registration (RC) validity. */
  rcValidTill: ISODate | "";
  fitnessValidTill: ISODate | "";
  hypothecated: boolean;
  financierName: string;
  /** Loan closure / NOC collected from the financier. */
  nocReceived: boolean;
  /** Original RC book/card with the showroom. */
  rcInHand: boolean;
  spareKey: boolean;
  serviceRecords: boolean;
  notes: string;
}

export interface Purchase extends Timestamps {
  id: ID;
  reference: string;
  vehicleId: ID;
  sellerName: string;
  sellerContact: string;
  sellerAddress: string;
  sellerNotes: string;
  purchaseDate: ISODate;
  purchasePricePaise: Paise;
  amountPaidPaise: Paise;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  notes: string;
  status: PurchaseStatus;
  createdBy: ID;
  cancelledAt: ISODateTime | null;
  cancelReason: string;
}

export interface VehicleImage extends Timestamps {
  id: ID;
  vehicleId: ID;
  /** `r2:`-prefixed keys live in Cloudflare R2. Keys without the prefix are leftover browser blobs. */
  storageKey: string;
  thumbKey: string;
  mimeType: string;
  /** Bytes of the optimised full-size image. */
  size: number;
  width: number;
  height: number;
  order: number;
  isCover: boolean;
  isPlaceholder: boolean;
}

export interface Customer extends Timestamps {
  id: ID;
  name: string;
  phone: string;
  address: string;
  notes: string;
}

export interface Reservation extends Timestamps {
  id: ID;
  reference: string;
  vehicleId: ID;
  customerId: ID;
  reservationDate: ISODate;
  bookingAmountPaise: Paise;
  bookingMethod: PaymentMethod;
  bookingReference: string;
  status: ReservationStatus;
  notes: string;
  createdBy: ID;
  saleId: ID | null;
  cancelledAt: ISODateTime | null;
  cancelReason: string;
}

export interface Sale extends Timestamps {
  id: ID;
  reference: string;
  vehicleId: ID;
  customerId: ID;
  reservationId: ID | null;
  saleDate: ISODate;
  salePricePaise: Paise;
  status: SaleStatus;
  notes: string;
  soldBy: ID;
  cancelledAt: ISODateTime | null;
  cancelReason: string;
}

export interface SalePayment extends Timestamps {
  id: ID;
  saleId: ID;
  receiptNumber: string;
  amountPaise: Paise;
  date: ISODate;
  method: PaymentMethod;
  reference: string;
  notes: string;
  /** "booking" payments originate from a reservation deposit. */
  kind: "booking" | "payment";
  recordedBy: ID;
  /** Cash or bank account the money went into. Absent = the default account for the payment method. */
  accountId?: ID | null;
  /** Staff member who physically received the money (the cash receiver). Absent = whoever recorded it. */
  receivedBy?: ID | null;
}

export interface Expense extends Timestamps {
  id: ID;
  reference: string;
  vehicleId: ID | null;
  category: ExpenseCategory;
  amountPaise: Paise;
  date: ISODate;
  description: string;
  vendor: string;
  paymentMethod: PaymentMethod;
  notes: string;
  createdBy: ID;
  /** Cash or bank account the expense was paid from. Absent = the default account for the payment method. */
  accountId?: ID | null;
}

// ─── Accounting ────────────────────────────────────────────────────────────────

export const ACCOUNT_KINDS = ["cash", "bank"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** A cash drawer or bank account money moves in and out of. */
export interface MoneyAccount extends Timestamps {
  id: ID;
  name: string;
  kind: AccountKind;
  bankName: string;
  /** Account number as printed; only the last digits are shown in lists. */
  accountNumber: string;
  ifsc: string;
  upiId: string;
  /** Cash accounts: the staff member who holds this cash (the cash receiver). */
  custodianId: ID | null;
  openingBalancePaise: Paise;
  openingDate: ISODate;
  /** Default cash account takes cash; default bank account takes UPI, cards, cheques and transfers. */
  isDefault: boolean;
  archived: boolean;
  notes: string;
}

export const VOUCHER_TYPES = ["receipt", "payment", "contra"] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

/** What a receipt voucher is for. Buyer payments against a sale are recorded as sale payments instead. */
export const RECEIPT_HEADS = [
  "other_income",
  "commission_received",
  "service_charges",
  "capital_introduced",
  "loan_received",
  "refund_from_seller",
  "misc_receipt",
] as const;
/** What a payment voucher is for. Showroom running costs are recorded as expenses instead. */
export const PAYMENT_HEADS = [
  "seller_payment",
  "refund_to_buyer",
  "commission_paid",
  "staff_advance",
  "owner_drawings",
  "loan_repayment",
  "misc_payment",
] as const;
export const CONTRA_HEADS = ["transfer"] as const;
export type ReceiptHead = (typeof RECEIPT_HEADS)[number];
export type PaymentHead = (typeof PAYMENT_HEADS)[number];
export type VoucherHead = ReceiptHead | PaymentHead | (typeof CONTRA_HEADS)[number];

export const VOUCHER_STATUSES = ["active", "cancelled"] as const;
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

/** Receipt (money in), payment (money out) or contra (between the showroom's own accounts). */
export interface Voucher extends Timestamps {
  id: ID;
  /** RV-2026-0001, PV-2026-0001 or CV-2026-0001. */
  number: string;
  type: VoucherType;
  head: VoucherHead;
  date: ISODate;
  amountPaise: Paise;
  method: PaymentMethod;
  /** Account money came into (receipt), went out of (payment), or left (contra). */
  accountId: ID;
  /** Contra only: the account the money moved to. */
  toAccountId: ID | null;
  partyName: string;
  partyPhone: string;
  /** Cheque / UTR / transaction number. */
  reference: string;
  narration: string;
  /** Seller payments settle this purchase's balance. */
  purchaseId: ID | null;
  /** Refunds to a buyer point at the cancelled sale. */
  saleId: ID | null;
  /** Staff member who handed over or received the money. */
  handledBy: ID;
  status: VoucherStatus;
  createdBy: ID;
  cancelledAt: ISODateTime | null;
  cancelReason: string;
}

// ─── Documents ─────────────────────────────────────────────────────────────────

export const DOCUMENT_KINDS = [
  "id_proof",
  "address_proof",
  "pan_card",
  "sale_letter",
  "delivery_note",
  "rc",
  "insurance",
  "puc",
  "noc",
  "form_29_30",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_OWNERS = ["vehicle", "purchase", "sale"] as const;
export type DocumentOwner = (typeof DOCUMENT_OWNERS)[number];

/** A scanned paper (ID proof, sale letter, RC…) stored in Cloudflare R2. */
export interface StoredDocument extends Timestamps {
  id: ID;
  ownerType: DocumentOwner;
  ownerId: ID;
  /** Vehicle the paper belongs to, so every paper of a car can be listed together. */
  vehicleId: ID | null;
  kind: DocumentKind;
  /** Free label, e.g. "Aadhaar — front". */
  title: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  size: number;
  uploadedBy: ID;
}

export interface ActivityLog {
  id: ID;
  actorId: ID;
  entityType: EntityType;
  entityId: ID;
  action: ActivityAction;
  timestamp: ISODateTime;
  description: string;
  /** Optional link target, e.g. `/inventory/<id>`. */
  href: string | null;
  metadata: ActivityMetadata;
}

export interface ActivityMetadata {
  /** Financial before/after values; only rendered for roles allowed to see costs. */
  financial?: { label: string; before?: Paise | null; after?: Paise | null }[];
  /** Non-sensitive field changes. */
  changes?: { field: string; before?: string; after?: string }[];
  /** True when the entry concerns purchase cost / profit and must be hidden from sales staff. */
  sensitive?: boolean;
}

export type DateFormatPreference = "dd MMM yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd";
export type InventoryViewPreference = "grid" | "table";

export interface BusinessSettings {
  id: "business";
  showroomName: string;
  legalName: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  gstin: string;
  logoKey: string | null;
  currency: "INR";
  dateFormat: DateFormatPreference;
  defaultInventoryView: InventoryViewPreference;
  receiptFooter: string;
  receiptTerms: string;
  maxUploadMb: number;
  maxPhotosPerVehicle: number;
  storageQuotaGb: number;
  /** Job titles admins can assign to staff (e.g. "Showroom Manager", "Driver"). */
  designations?: string[];
  /** Layout used for sale invoices. */
  invoiceTemplate?: InvoiceTemplateId;
  updatedAt: ISODateTime;
}

export const INVOICE_TEMPLATES = ["classic", "modern", "compact", "bold"] as const;
export type InvoiceTemplateId = (typeof INVOICE_TEMPLATES)[number];

export interface ImageBlobRecord {
  key: string;
  blob: Blob;
  size: number;
  mimeType: string;
  createdAt: ISODateTime;
}

export interface Counter {
  key: string;
  value: number;
}
