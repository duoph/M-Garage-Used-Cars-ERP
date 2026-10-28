import type {
  BusinessSettings,
  ID,
  User,
} from "@/types";
import type {
  ExpenseInput,
  PaymentInput,
  PurchaseEditInput,
  PurchaseFormInput,
  ReservationInput,
  SaleInput,
  SettingsInput,
  UserInput,
  VehicleEditInput,
} from "@/lib/validation/schemas";

/**
 * Persistence contracts. The UI only talks to these interfaces, so the IndexedDB demo
 * implementation can be replaced by an HTTP client backed by Cloudflare D1 / PostgreSQL
 * and R2 without redesigning screens.
 */

/** Binary object storage for vehicle photos and the showroom logo (IndexedDB now, R2 later). */
export interface ImageStorage {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | undefined>;
  remove(keys: readonly string[]): Promise<void>;
  usageBytes(): Promise<number>;
}

/** A photo that has already been validated, resized and compressed on the client. */
export interface PreparedPhoto {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  mimeType: string;
  isPlaceholder?: boolean;
  /** Marks the preferred cover photo; defaults to the first photo. */
  isCover?: boolean;
}

export interface CreatePurchaseResult {
  purchaseId: ID;
  vehicleId: ID;
}

/**
 * Business operations. Each command is atomic: it either fully applies (records + status
 * changes + activity entry) or throws a `BusinessError` and leaves data untouched.
 */
export interface DealerCommands {
  createPurchase(actor: User, input: PurchaseFormInput, photos: readonly PreparedPhoto[]): Promise<CreatePurchaseResult>;
  updatePurchase(actor: User, purchaseId: ID, input: PurchaseEditInput, correctionReason?: string): Promise<void>;
  cancelPurchase(actor: User, purchaseId: ID, reason: string): Promise<void>;

  updateVehicle(actor: User, vehicleId: ID, input: VehicleEditInput): Promise<void>;
  addVehiclePhotos(actor: User, vehicleId: ID, photos: readonly PreparedPhoto[]): Promise<void>;
  removeVehiclePhoto(actor: User, imageId: ID): Promise<void>;
  reorderVehiclePhotos(actor: User, vehicleId: ID, orderedIds: readonly ID[]): Promise<void>;
  setCoverPhoto(actor: User, imageId: ID): Promise<void>;

  reserveVehicle(actor: User, vehicleId: ID, input: ReservationInput): Promise<ID>;
  cancelReservation(actor: User, reservationId: ID, reason: string): Promise<void>;

  completeSale(actor: User, input: SaleInput): Promise<ID>;
  cancelSale(actor: User, saleId: ID, reason: string): Promise<void>;
  recordPayment(actor: User, saleId: ID, input: PaymentInput): Promise<ID>;

  createExpense(actor: User, input: ExpenseInput): Promise<ID>;
  updateExpense(actor: User, expenseId: ID, input: ExpenseInput): Promise<void>;
  deleteExpense(actor: User, expenseId: ID): Promise<void>;

  createUser(actor: User, input: UserInput): Promise<ID>;
  updateUser(actor: User, userId: ID, input: UserInput): Promise<void>;

  updateSettings(actor: User, input: SettingsInput): Promise<void>;
  setLogo(actor: User, logo: Blob | null): Promise<void>;
}

export class BusinessError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}

export type { BusinessSettings };
