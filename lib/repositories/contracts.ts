import type {
  BusinessSettings,
  InvoiceTemplateId,
  ID,
  User,
} from "@/types";
import type {
  AccountInput,
  BranchInput,
  DayCloseInput,
  PurchaseReturnInput,
  ReceiveInput,
  RefundInput,
  SalesReturnInput,
  SettleFinanceInput,
  DocumentMetaInput,
  ExpenseInput,
  PapersInput,
  PaymentInput,
  PurchaseEditInput,
  PurchaseFormInput,
  ReservationInput,
  SaleInput,
  SettingsInput,
  UserInput,
  VehicleEditInput,
  VoucherInput,
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

/** Object storage reached over the network (Cloudflare R2). Keys it returns are prefixed `r2:`. */
export interface RemoteImageStorage {
  /** Uploads one object and returns the key to store on the image record. */
  put(objectKey: string, blob: Blob): Promise<string>;
  /** Deletes objects by stored key; keys that aren't remote are ignored. */
  remove(keys: readonly string[]): Promise<void>;
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
  updateVehiclePapers(actor: User, vehicleId: ID, input: PapersInput): Promise<void>;

  reserveVehicle(actor: User, vehicleId: ID, input: ReservationInput): Promise<ID>;
  cancelReservation(actor: User, reservationId: ID, reason: string): Promise<void>;

  completeSale(actor: User, input: SaleInput): Promise<ID>;
  cancelSale(actor: User, saleId: ID, reason: string): Promise<void>;
  recordPayment(actor: User, saleId: ID, input: PaymentInput): Promise<ID>;
  /** "Receive Payment": one or more payment lines against a sale's balance. Returns the payment ids. */
  receivePayments(actor: User, saleId: ID, input: ReceiveInput): Promise<ID[]>;
  /** The lender paid a loan line into a bank account. */
  settleFinance(actor: User, paymentId: ID, input: SettleFinanceInput): Promise<void>;
  /** Pays the seller against a purchase's balance, from one or more accounts. */
  payPurchase(actor: User, purchaseId: ID, input: ReceiveInput): Promise<ID[]>;

  createSalesReturn(actor: User, input: SalesReturnInput): Promise<ID>;
  createPurchaseReturn(actor: User, input: PurchaseReturnInput): Promise<ID>;
  /** Refund paid to the buyer (sales return) or received from the seller (purchase return). */
  recordRefund(actor: User, returnType: "sales" | "purchase", returnId: ID, input: RefundInput): Promise<ID[]>;
  /** A car back from a sales return passed inspection and is for sale again. */
  backToStock(actor: User, vehicleId: ID): Promise<void>;

  createBranch(actor: User, input: BranchInput): Promise<ID>;
  updateBranch(actor: User, branchId: ID, input: BranchInput): Promise<void>;
  closeDay(actor: User, input: DayCloseInput): Promise<ID>;
  reopenDay(actor: User, dayCloseId: ID, reason: string): Promise<void>;

  createExpense(actor: User, input: ExpenseInput): Promise<ID>;
  updateExpense(actor: User, expenseId: ID, input: ExpenseInput): Promise<void>;
  deleteExpense(actor: User, expenseId: ID): Promise<void>;

  createAccount(actor: User, input: AccountInput): Promise<ID>;
  updateAccount(actor: User, accountId: ID, input: AccountInput): Promise<void>;
  createVoucher(actor: User, input: VoucherInput): Promise<ID>;
  cancelVoucher(actor: User, voucherId: ID, reason: string): Promise<void>;

  uploadDocument(actor: User, meta: DocumentMetaInput, file: Blob, fileName: string): Promise<ID>;
  removeDocument(actor: User, documentId: ID): Promise<void>;

  /** `id` lets the caller choose the id, e.g. to match a profile already created in Supabase. */
  createUser(actor: User, input: UserInput, id?: ID): Promise<ID>;
  updateUser(actor: User, userId: ID, input: UserInput): Promise<void>;

  updateSettings(actor: User, input: SettingsInput): Promise<void>;
  setDesignations(actor: User, designations: readonly string[]): Promise<void>;
  setInvoiceTemplate(actor: User, template: InvoiceTemplateId): Promise<void>;
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
