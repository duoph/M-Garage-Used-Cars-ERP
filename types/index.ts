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

export const ROLES = ["admin", "manager", "sales", "accountant"] as const;
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

export const QUOTE_STATUSES = ["open", "accepted", "declined"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

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
  "quote",
  "expense",
  "user",
  "settings",
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
  "quote.created",
  "quote.updated",
  "quote.status_changed",
  "expense.created",
  "expense.updated",
  "expense.deleted",
  "user.created",
  "user.updated",
  "user.role_changed",
  "user.status_changed",
  "settings.updated",
  "data.imported",
  "data.reset",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

// ─── Entities ──────────────────────────────────────────────────────────────────

export interface User extends Timestamps {
  id: ID;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: UserStatus;
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
  /** Key into the image blob store (IndexedDB now, Cloudflare R2 later). */
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
  /** Credit for third-party photos (e.g. Creative Commons demo images). */
  attribution?: PhotoAttribution | null;
}

export interface PhotoAttribution {
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
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
}

/** A price offer for one vehicle. Extras (insurance, transfer, accessories) are added to the car price. */
export interface Quote extends Timestamps {
  id: ID;
  reference: string;
  vehicleId: ID;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  quoteDate: ISODate;
  validUntil: ISODate;
  vehiclePricePaise: Paise;
  extras: QuoteExtra[];
  discountPaise: Paise;
  notes: string;
  status: QuoteStatus;
  /** Set when the quote turns into a sale. */
  saleId: ID | null;
  createdBy: ID;
}

export interface QuoteExtra {
  description: string;
  amountPaise: Paise;
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
  updatedAt: ISODateTime;
}

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
