import type { DealerDatabase } from "@/lib/db/database";
import { getDb } from "@/lib/db/database";
import { branchScope, can, normalizeAccess, permissionsFor, type Permission } from "@/lib/permissions";
import {
  BusinessError,
  type CreatePurchaseResult,
  type DealerCommands,
  type PreparedPhoto,
  type RemoteImageStorage,
} from "@/lib/repositories/contracts";
import { r2Enabled, r2ImageStorage } from "@/lib/images/r2-storage";
import {
  R2_MAX_OBJECT_BYTES,
  documentObjectKey,
  isAcceptedDocumentType,
  isR2Key,
  logoObjectKey,
  toR2Key,
  vehiclePhotoObjectKeys,
} from "@/lib/images/r2-keys";
import {
  canCancelPurchase,
  canCancelReservation,
  canCancelSale,
  canReserve,
  canReturnPurchase,
  canReturnSale,
  canSell,
  statusAfterSaleCancellation,
} from "@/lib/calculations/state";
import { financePending, purchaseBalance, saleTotals, validatePayment } from "@/lib/calculations/finance";
import { purchaseReturnEffect, returnable, salesReturnEffect } from "@/lib/calculations/returns";
import { MONEY_KINDS, resolveAccountId, signed } from "@/lib/calculations/ledger";
import { assertCashNotNegative, syncLedger } from "@/lib/services/ledger-posting";
import { bookTables } from "@/lib/db/dataset";
import { MAIN_BRANCH_ID } from "@/lib/db/migrate";
import { formatDate, todayISO } from "@/lib/utils/dates";
import { sumPaise } from "@/lib/utils/money";
import {
  accountSchema,
  branchSchema,
  dayCloseSchema,
  documentMetaSchema,
  expenseSchema,
  lineTotal,
  linesOf,
  makeReceiveSchema,
  purchaseReturnSchema,
  refundSchema,
  salesReturnSchema,
  settleFinanceSchema,
  type PaymentLineInput,
  papersSchema,
  makePaymentSchema,
  makeSaleSchema,
  purchaseEditSchema,
  purchaseFormSchema,
  reservationSchema,
  settingsSchema,
  userSchema,
  vehicleEditSchema,
  voucherSchema,
} from "@/lib/validation/schemas";
import { formatReference, formatRegistration, newId, normalizeChassis, normalizeRegistration } from "@/lib/utils/ids";
import { formatINR } from "@/lib/utils/money";
import { ACCOUNT_KIND_LABELS, DOCUMENT_KIND_LABELS, EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS, ROLE_LABELS, VOUCHER_HEAD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { INVOICE_TEMPLATES } from "@/types";
import type {
  ActivityLog,
  ActivityMetadata,
  Branch,
  Customer,
  DayClose,
  PurchasePayment,
  PurchaseReturn,
  ReturnRefund,
  SalesReturn,
  Expense,
  ID,
  MoneyAccount,
  Purchase,
  Reservation,
  Sale,
  SalePayment,
  StoredDocument,
  User,
  Vehicle,
  VehicleImage,
  Voucher,
  VoucherHead,
} from "@/types";

type Db = DealerDatabase;

function authorize(actor: User, permission: Permission) {
  if (actor.status !== "active") throw new BusinessError("Your account is inactive.");
  if (!can(actor, permission)) throw new BusinessError("You do not have permission to perform this action.");
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string; path: PropertyKey[] }[] } } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new BusinessError(issue?.message ?? "Invalid input", issue?.path.join("."));
  }
  return result.data;
}

const now = () => new Date().toISOString();

async function nextReference(db: Db, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const current = await db.counters.get(key);
  const value = (current?.value ?? 0) + 1;
  await db.counters.put({ key, value });
  return formatReference(prefix, year, value);
}

async function nextStockNumber(db: Db): Promise<string> {
  const current = await db.counters.get("STK");
  const value = (current?.value ?? 0) + 1;
  await db.counters.put({ key: "STK", value });
  return `STK-${String(value).padStart(4, "0")}`;
}

function log(
  db: Db,
  actor: User,
  entry: Omit<ActivityLog, "id" | "actorId" | "timestamp" | "metadata"> & { metadata?: ActivityMetadata },
) {
  return db.activity.add({
    id: newId(),
    actorId: actor.id,
    timestamp: now(),
    metadata: entry.metadata ?? {},
    ...entry,
  });
}

/** Finds an existing active vehicle that collides on registration or chassis number. */
async function findDuplicateVehicle(
  db: Db,
  registration: string,
  chassis: string,
  excludeId?: ID,
): Promise<{ vehicle: Vehicle; field: "registrationNumber" | "chassisNumber" } | null> {
  const reg = normalizeRegistration(registration);
  const ch = chassis ? normalizeChassis(chassis) : "";
  const all = await db.vehicles.filter((v) => v.archivedAt === null && v.id !== excludeId).toArray();
  for (const v of all) {
    if (reg && normalizeRegistration(v.registrationNumber) === reg) return { vehicle: v, field: "registrationNumber" };
    if (ch && v.chassisNumber && normalizeChassis(v.chassisNumber) === ch) return { vehicle: v, field: "chassisNumber" };
  }
  return null;
}

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

async function upsertCustomer(
  db: Db,
  input: { customerName: string; customerPhone: string; customerAddress: string; customerNotes: string },
): Promise<Customer> {
  const key = phoneKey(input.customerPhone);
  const existing = (await db.customers.toArray()).find((c) => phoneKey(c.phone) === key);
  const ts = now();
  if (existing) {
    const updated: Customer = {
      ...existing,
      name: input.customerName,
      address: input.customerAddress || existing.address,
      notes: input.customerNotes || existing.notes,
      updatedAt: ts,
    };
    await db.customers.put(updated);
    return updated;
  }
  const customer: Customer = {
    id: newId(),
    name: input.customerName,
    phone: input.customerPhone.replace(/[\s-]/g, ""),
    address: input.customerAddress,
    notes: input.customerNotes,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.customers.add(customer);
  return customer;
}

interface UploadedPhoto {
  id: ID;
  storageKey: string;
  thumbKey: string;
}

function requirePhotoStorage(remote: RemoteImageStorage | null): RemoteImageStorage {
  if (!remote) throw new BusinessError("Images are stored in Cloudflare R2, and that storage is not configured.");
  return remote;
}

/**
 * Uploads photos to remote storage ahead of the IndexedDB transaction, which can't wait on the network.
 * If any upload fails, the ones that made it are deleted again.
 */
async function uploadPhotos(remote: RemoteImageStorage, vehicleId: ID, photos: readonly PreparedPhoto[]): Promise<UploadedPhoto[]> {
  const uploaded: UploadedPhoto[] = [];
  try {
    for (const p of photos) {
      const id = newId();
      const keys = vehiclePhotoObjectKeys(vehicleId, id, p.mimeType);
      // Recorded before uploading so a half-finished pair is still cleaned up.
      uploaded.push({ id, storageKey: toR2Key(keys.full), thumbKey: toR2Key(keys.thumb) });
      await Promise.all([remote.put(keys.full, p.full), remote.put(keys.thumb, p.thumb)]);
    }
  } catch (error) {
    await discardUploads(remote, uploaded);
    throw new BusinessError(error instanceof Error ? error.message : "Photo upload failed.");
  }
  return uploaded;
}

async function discardUploads(remote: RemoteImageStorage, uploaded: readonly UploadedPhoto[]) {
  await remote.remove(uploaded.flatMap((u) => [u.storageKey, u.thumbKey])).catch((e) => console.error("Could not clean up uploaded photos", e));
}

async function storePhotos(
  db: Db,
  vehicleId: ID,
  photos: readonly PreparedPhoto[],
  startOrder: number,
  hasCover: boolean,
  uploaded?: readonly UploadedPhoto[],
) {
  const ts = now();
  const images: VehicleImage[] = [];
  const explicitCover = photos.findIndex((p) => p.isCover);
  const coverIndex = explicitCover >= 0 ? explicitCover : 0;
  if (!uploaded || uploaded.length !== photos.length)
    throw new BusinessError("Photos must be uploaded to Cloudflare before they can be saved.");
  for (const [i, p] of photos.entries()) {
    const remote = uploaded[i];
    const id = remote.id;
    const storageKey = remote.storageKey;
    const thumbKey = remote.thumbKey;
    images.push({
      id,
      vehicleId,
      storageKey,
      thumbKey,
      mimeType: p.mimeType,
      size: p.full.size + p.thumb.size,
      width: p.width,
      height: p.height,
      order: startOrder + i,
      isCover: !hasCover && i === coverIndex,
      isPlaceholder: p.isPlaceholder ?? false,
      createdAt: ts,
      updatedAt: ts,
    });
  }
  await db.vehicleImages.bulkAdd(images);
  return images;
}

/** Default cash per branch, default bank overall: accounts that compete for "default" with this one. */
function sameDefaultGroup(a: MoneyAccount, b: MoneyAccount): boolean {
  return a.kind === b.kind && (a.kind !== "cash" || (a.branchId ?? null) === (b.branchId ?? null));
}

/** Only one default account per kind (per branch for cash): the newest default wins. */
async function keepOneDefault(db: Db, account: MoneyAccount) {
  if (!account.isDefault) return;
  const others = await db.accounts.where("kind").equals(account.kind).toArray();
  await Promise.all(others.filter((a) => a.id !== account.id && a.isDefault && sameDefaultGroup(a, account)).map((a) => db.accounts.update(a.id, { isDefault: false })));
}

/** The branch a person works at; records they enter belong there unless they choose another. */
async function actorBranch(db: Db, actor: User): Promise<ID> {
  if (actor.branchId && (await db.branches.get(actor.branchId))) return actor.branchId;
  return (await db.branches.toCollection().first())?.id ?? MAIN_BRANCH_ID;
}

function assertBranchAccess(actor: User, branchId: ID | null | undefined) {
  const scope = branchScope(actor);
  if (scope && branchId && !scope.includes(branchId)) throw new BusinessError("You can only enter records for your own branch.");
}

/** Cash accounts belong to a branch; other kinds are shared. */
async function accountBranch(db: Db, actor: User, input: { kind: MoneyAccount["kind"]; branchId?: ID | null }): Promise<ID | null> {
  if (input.kind !== "cash") return null;
  const branchId = input.branchId ?? (await actorBranch(db, actor));
  await getOrThrow(db.branches.get(branchId), "Branch");
  return branchId;
}

/** The lender's receivable account, created the first time a loan from them is recorded. */
async function lenderAccount(db: Db, name: string): Promise<MoneyAccount> {
  const key = name.trim().toLowerCase();
  const existing = (await db.accounts.where("kind").equals("finance").toArray()).find((a) => a.name.trim().toLowerCase() === key);
  if (existing) return existing;
  const ts = now();
  const account: MoneyAccount = {
    id: newId(), name: name.trim(), kind: "finance", bankName: name.trim(), accountNumber: "", ifsc: "", upiId: "", custodianId: null,
    openingBalancePaise: 0, openingDate: ts.slice(0, 10), isDefault: false, archived: false, notes: "Loans due from this lender", branchId: null,
    createdAt: ts, updatedAt: ts,
  };
  await db.accounts.add(account);
  return account;
}

type ResolvedLine = PaymentLineInput & { accountId: ID };

/**
 * Works out and checks the account each payment line posts to: cash into a cash account (the branch's
 * cash in hand by default), UPI / transfers / cheques / cards into a bank account, loans into the lender's
 * receivable.
 */
async function resolveLines(db: Db, lines: readonly PaymentLineInput[], branchId: ID | null, opts: { allowFinance: boolean; field: string }): Promise<ResolvedLine[]> {
  const accounts = await db.accounts.toArray();
  const resolved: ResolvedLine[] = [];
  for (const [i, line] of lines.entries()) {
    const field = opts.field ? `${opts.field}.${i}.accountId` : "accountId";
    if (line.method === "finance") {
      if (!opts.allowFinance) throw new BusinessError("Finance / loan can't be used here.", field);
      const explicit = line.accountId ? accounts.find((a) => a.id === line.accountId && a.kind === "finance") : undefined;
      const account = explicit ?? (await lenderAccount(db, line.lenderName));
      resolved.push({ ...line, lenderName: line.lenderName || account.name, accountId: account.id });
      continue;
    }
    const id = resolveAccountId(accounts, line.accountId, line.method, branchId);
    const account = accounts.find((a) => a.id === id);
    if (!account) throw new BusinessError("Add a cash or bank account first (Cash & Bank).", field);
    if (account.archived) throw new BusinessError(`${account.name} is archived. Pick an active account.`, field);
    const kind = line.method === "cash" ? "cash" : "bank";
    if (account.kind !== kind)
      throw new BusinessError(
        kind === "cash" ? `Cash goes through a cash account, not ${account.name}.` : `${PAYMENT_METHOD_LABELS[line.method]} goes through a bank account, not ${account.name}.`,
        field,
      );
    resolved.push({ ...line, accountId: id });
  }
  return resolved;
}

/** Sale payment rows for lines received together; they share one receipt number. */
async function paymentRows(db: Db, saleId: ID, lines: readonly ResolvedLine[], date: string, actorId: ID, notes: string, ts: string): Promise<SalePayment[]> {
  const receiptNumber = await nextReference(db, "RCT");
  return lines.map((l) => ({
    id: newId(),
    saleId,
    receiptNumber,
    amountPaise: l.amountPaise,
    date,
    method: l.method,
    reference: l.reference,
    notes,
    kind: "payment" as const,
    recordedBy: actorId,
    accountId: l.accountId,
    receivedBy: actorId,
    ...(l.method === "finance" ? { lenderName: l.lenderName, loanReference: l.loanReference, adjustedPaise: 0, settledOn: null, settledAccountId: null } : {}),
    createdAt: ts,
    updatedAt: ts,
  }));
}

async function refundRows(db: Db, returnType: ReturnRefund["returnType"], returnId: ID, lines: readonly ResolvedLine[], date: string, actorId: ID, ts: string): Promise<ReturnRefund[]> {
  const number = await nextReference(db, "RF");
  return lines.map((l) => ({
    id: newId(), returnType, returnId, number, date, method: l.method, amountPaise: l.amountPaise, accountId: l.accountId,
    reference: l.reference, recordedBy: actorId, createdAt: ts, updatedAt: ts,
  }));
}

/** "Paid from" must be an active cash or bank account that matches the payment mode. */
async function expenseAccount(db: Db, input: { accountId: ID; paymentMethod: Expense["paymentMethod"] }): Promise<MoneyAccount> {
  const account = await getOrThrow(db.accounts.get(input.accountId), "Account");
  if (!MONEY_KINDS.includes(account.kind)) throw new BusinessError("Expenses are paid from a cash or bank account.", "accountId");
  if (account.archived) throw new BusinessError(`${account.name} is archived. Pick an active account.`, "accountId");
  if (input.paymentMethod === "finance") throw new BusinessError("Expenses can't be paid by finance / loan.", "paymentMethod");
  if ((input.paymentMethod === "cash") !== (account.kind === "cash"))
    throw new BusinessError(account.kind === "cash" ? "Paying from cash in hand: set the mode to Cash." : `${account.name} is a bank account: pick UPI, bank transfer, cheque or card.`, "paymentMethod");
  return account;
}

/** What a document is attached to, for activity text and links. */
async function documentOwner(db: Db, type: StoredDocument["ownerType"], id: ID): Promise<{ vehicleId: ID | null; label: string; href: string }> {
  if (type === "vehicle") {
    const v = await getOrThrow(db.vehicles.get(id), "Vehicle");
    return { vehicleId: v.id, label: `${vehicleTitle(v)} (${v.registrationNumber})`, href: `/inventory/${v.id}` };
  }
  if (type === "purchase") {
    const p = await getOrThrow(db.purchases.get(id), "Purchase");
    return { vehicleId: p.vehicleId, label: `purchase ${p.reference}`, href: `/purchases/${p.id}` };
  }
  const s = await getOrThrow(db.sales.get(id), "Sale");
  return { vehicleId: s.vehicleId, label: `sale ${s.reference}`, href: `/sales/${s.id}` };
}

/** Admin accounts always have full access, and a list identical to the defaults is stored as "defaults". */
async function getOrThrow<T>(promise: Promise<T | undefined>, what: string): Promise<T> {
  const v = await promise;
  if (!v) throw new BusinessError(`${what} could not be found.`);
  return v;
}

/** `remote` is Cloudflare R2. New images are never written to the browser. Tests pass null and save no photos. */
export function createDealerService(
  dbFactory: () => Db = getDb,
  remote: RemoteImageStorage | null = r2Enabled ? r2ImageStorage : null,
): DealerCommands {
  const db = () => dbFactory();

  return {
    async createPurchase(actor, rawInput, photos): Promise<CreatePurchaseResult> {
      authorize(actor, "purchases.manage");
      const input = parse(purchaseFormSchema, rawInput);
      const d = db();
      if (photos.length > 0) {
        const settings = await d.settings.get("business");
        const max = settings?.maxPhotosPerVehicle ?? 20;
        if (photos.length > max) throw new BusinessError(`A vehicle can have at most ${max} photos.`);
      }
      const vehicleId = newId();
      const uploaded = photos.length ? await uploadPhotos(requirePhotoStorage(remote), vehicleId, photos) : undefined;
      try {
        return await d.transaction(
          "rw",
          [...bookTables(d), d.vehicleImages, d.imageBlobs],
          async () => {
            const dup = await findDuplicateVehicle(d, input.registrationNumber, input.chassisNumber);
            if (dup)
              throw new BusinessError(
                dup.field === "registrationNumber"
                  ? `A vehicle with registration ${dup.vehicle.registrationNumber} already exists in stock (${dup.vehicle.stockNumber}).`
                  : `A vehicle with this chassis number already exists in stock (${dup.vehicle.stockNumber}).`,
                dup.field,
              );
            const ts = now();
            const purchaseId = newId();
            const reference = await nextReference(d, "PUR");
            const branchId = input.branchId ?? (await actorBranch(d, actor));
            assertBranchAccess(actor, branchId);
            const lines = await resolveLines(d, linesOf(input), branchId, { allowFinance: false, field: "payments" });
            const stockNumber = await nextStockNumber(d);
            const vehicle: Vehicle = {
              id: vehicleId,
              stockNumber,
              purchaseId,
              make: input.make,
              model: input.model,
              variant: input.variant,
              year: input.year,
              registrationNumber: formatRegistration(input.registrationNumber),
              chassisNumber: normalizeChassis(input.chassisNumber),
              engineNumber: input.engineNumber.toUpperCase(),
              fuelType: input.fuelType,
              transmission: input.transmission,
              mileageKm: input.mileageKm,
              color: input.color,
              previousOwners: input.previousOwners,
              askingPricePaise: input.askingPricePaise,
              status: "available",
              coverImageId: null,
              notes: input.notes,
              archivedAt: null,
              branchId,
              createdAt: ts,
              updatedAt: ts,
            };
            const purchase: Purchase = {
              id: purchaseId,
              reference,
              vehicleId,
              sellerName: input.sellerName,
              sellerContact: input.sellerContact.replace(/[\s-]/g, ""),
              sellerAddress: input.sellerAddress,
              sellerNotes: input.sellerNotes,
              purchaseDate: input.purchaseDate,
              purchasePricePaise: input.purchasePricePaise,
              amountPaidPaise: lineTotal(lines),
              paymentMethod: lines[0]?.method ?? input.paymentMethod,
              paymentReference: lines[0]?.reference ?? input.paymentReference,
              notes: input.purchaseNotes,
              status: "active",
              createdBy: actor.id,
              cancelledAt: null,
              cancelReason: "",
              branchId,
              returnedPaise: 0,
              refundReceivedPaise: 0,
              returnStatus: "none",
              createdAt: ts,
              updatedAt: ts,
            };
            await d.purchases.add(purchase);
            await d.vehicles.add(vehicle);
            // "Paid from" lines; they carry the purchase reference.
            if (lines.length)
              await d.purchasePayments.bulkAdd(
                lines.map((l) => ({
                  id: newId(), purchaseId, number: reference, date: input.purchaseDate, method: l.method, amountPaise: l.amountPaise,
                  accountId: l.accountId, reference: l.reference, notes: "Paid at purchase", kind: "at_purchase" as const,
                  recordedBy: actor.id, createdAt: ts, updatedAt: ts,
                })),
              );
            if (photos.length) {
              const images = await storePhotos(d, vehicleId, photos, 0, false, uploaded);
              await d.vehicles.update(vehicleId, { coverImageId: images.find((i) => i.isCover)?.id ?? images[0].id });
            }
            await syncLedger(d);
            const title = `${vehicle.year} ${vehicleTitle(vehicle)}`;
            await log(d, actor, {
              entityType: "purchase",
              entityId: purchaseId,
              action: "purchase.created",
              description: `Purchased ${title} (${vehicle.registrationNumber}) from ${purchase.sellerName}`,
              href: `/purchases/${purchaseId}`,
              metadata: {
                sensitive: true,
                financial: [
                  { label: "Purchase price", after: purchase.purchasePricePaise },
                  { label: "Amount paid", after: purchase.amountPaidPaise },
                ],
              },
            });
            await log(d, actor, {
              entityType: "vehicle",
              entityId: vehicleId,
              action: "vehicle.created",
              description: `Added ${title} to stock as ${stockNumber}`,
              href: `/inventory/${vehicleId}`,
            });
            return { purchaseId, vehicleId };
          },
        );
      } catch (error) {
        if (remote && uploaded) await discardUploads(remote, uploaded);
        throw error;
      }
    },

    async updatePurchase(actor, purchaseId, rawInput, correctionReason) {
      authorize(actor, "purchases.manage");
      const input = parse(purchaseEditSchema, rawInput);
      const d = db();
      await d.transaction("rw", bookTables(d), async () => {
        const purchase = await getOrThrow(d.purchases.get(purchaseId), "Purchase");
        if (purchase.status === "cancelled") throw new BusinessError("Cancelled purchases cannot be edited.");
        if (purchase.returnStatus && purchase.returnStatus !== "none" && input.purchasePricePaise !== purchase.purchasePricePaise)
          throw new BusinessError("This purchase has a purchase return; its price can no longer change.", "purchasePricePaise");
        const vehicle = await d.vehicles.get(purchase.vehicleId);
        const financialChange =
          input.purchasePricePaise !== purchase.purchasePricePaise || input.amountPaidPaise !== purchase.amountPaidPaise;
        if (vehicle?.status === "sold" && financialChange) {
          if (actor.role !== "admin")
            throw new BusinessError("This vehicle has been sold. Only an Admin can correct its purchase figures.");
          if (!correctionReason || correctionReason.trim().length < 5)
            throw new BusinessError("Provide a correction reason for changing a sold vehicle's purchase figures.");
        }
        const vouchered = (await d.vouchers.where("purchaseId").equals(purchaseId).toArray())
          .filter((x) => x.status === "active" && x.head === "seller_payment")
          .reduce((sum, x) => sum + x.amountPaise, 0);
        if (input.amountPaidPaise < vouchered)
          throw new BusinessError(
            `${formatINR(vouchered)} has already been paid to the seller through payment vouchers. Amount paid cannot be lower.`,
            "amountPaidPaise",
          );
        // The amount paid at purchase can be corrected while it is a single line; later payments go through "Pay seller".
        const lines = await d.purchasePayments.where("purchaseId").equals(purchaseId).toArray();
        const atPurchase = input.amountPaidPaise - vouchered;
        const current = lines.find((l) => l.kind === "at_purchase");
        const paymentChanged = input.amountPaidPaise !== purchase.amountPaidPaise || (current ? current.method !== input.paymentMethod : atPurchase > 0);
        if (paymentChanged) {
          if (lines.length > 1 || lines.some((l) => l.kind !== "at_purchase"))
            throw new BusinessError("This purchase was paid in several parts. Record further payments with “Pay seller” instead of editing the amount.", "amountPaidPaise");
          const ts = now();
          if (atPurchase <= 0) {
            if (current) await d.purchasePayments.delete(current.id);
          } else {
            const accounts = await d.accounts.toArray();
            const keep = current && (current.method === "cash") === (input.paymentMethod === "cash");
            const accountId = keep ? current.accountId : resolveAccountId(accounts, null, input.paymentMethod, purchase.branchId);
            await d.purchasePayments.put({
              id: current?.id ?? newId(), purchaseId, number: purchase.reference, date: input.purchaseDate, method: input.paymentMethod,
              amountPaise: atPurchase, accountId, reference: input.paymentReference, notes: "Paid at purchase", kind: "at_purchase",
              recordedBy: current?.recordedBy ?? actor.id, createdAt: current?.createdAt ?? ts, updatedAt: ts,
            });
          }
        } else if (current && current.date !== input.purchaseDate) {
          await d.purchasePayments.update(current.id, { date: input.purchaseDate, reference: input.paymentReference, updatedAt: now() });
        }
        await d.purchases.update(purchaseId, {
          ...input,
          sellerContact: input.sellerContact.replace(/[\s-]/g, ""),
          updatedAt: now(),
        });
        await syncLedger(d);
        const changes: { field: string; before?: string; after?: string }[] = [];
        if (input.sellerName !== purchase.sellerName)
          changes.push({ field: "Seller", before: purchase.sellerName, after: input.sellerName });
        if (input.purchaseDate !== purchase.purchaseDate)
          changes.push({ field: "Purchase date", before: purchase.purchaseDate, after: input.purchaseDate });
        if (correctionReason) changes.push({ field: "Correction reason", after: correctionReason.trim() });
        await log(d, actor, {
          entityType: "purchase",
          entityId: purchaseId,
          action: "purchase.updated",
          description: `Updated purchase ${purchase.reference}${correctionReason ? " (authorised correction)" : ""}`,
          href: `/purchases/${purchaseId}`,
          metadata: {
            sensitive: true,
            changes,
            financial: financialChange
              ? [
                  { label: "Purchase price", before: purchase.purchasePricePaise, after: input.purchasePricePaise },
                  { label: "Amount paid", before: purchase.amountPaidPaise, after: input.amountPaidPaise },
                ]
              : undefined,
          },
        });
      });
    },

    async cancelPurchase(actor, purchaseId, reason) {
      authorize(actor, "purchases.manage");
      if (reason.trim().length < 5) throw new BusinessError("Please give a reason (at least 5 characters).", "reason");
      const d = db();
      await d.transaction("rw", bookTables(d), async () => {
        const purchase = await getOrThrow(d.purchases.get(purchaseId), "Purchase");
        if (purchase.status === "cancelled") throw new BusinessError("This purchase is already cancelled.");
        const vehicle = await d.vehicles.get(purchase.vehicleId);
        const check = canCancelPurchase(vehicle, purchase);
        if (!check.ok) throw new BusinessError(check.message);
        const ts = now();
        await d.purchases.update(purchaseId, { status: "cancelled", cancelledAt: ts, cancelReason: reason.trim(), updatedAt: ts });
        if (vehicle) await d.vehicles.update(vehicle.id, { archivedAt: ts, updatedAt: ts });
        await syncLedger(d);
        await log(d, actor, {
          entityType: "purchase",
          entityId: purchaseId,
          action: "purchase.cancelled",
          description: `Cancelled purchase ${purchase.reference}; vehicle archived from stock`,
          href: `/purchases/${purchaseId}`,
          metadata: { changes: [{ field: "Reason", after: reason.trim() }] },
        });
      });
    },

    async updateVehicle(actor, vehicleId, rawInput) {
      authorize(actor, "inventory.edit");
      const input = parse(vehicleEditSchema, rawInput);
      const d = db();
      await d.transaction("rw", [d.vehicles, d.activity], async () => {
        const vehicle = await getOrThrow(d.vehicles.get(vehicleId), "Vehicle");
        if (vehicle.archivedAt) throw new BusinessError("Archived vehicles cannot be edited.");
        const dup = await findDuplicateVehicle(d, input.registrationNumber, input.chassisNumber, vehicleId);
        if (dup)
          throw new BusinessError(
            dup.field === "registrationNumber"
              ? `Registration ${dup.vehicle.registrationNumber} is already used by ${dup.vehicle.stockNumber}.`
              : `This chassis number is already used by ${dup.vehicle.stockNumber}.`,
            dup.field,
          );
        if (vehicle.status === "sold" && input.askingPricePaise !== vehicle.askingPricePaise)
          throw new BusinessError("The asking price of a sold vehicle cannot be changed.", "askingPricePaise");
        const next = {
          ...input,
          registrationNumber: formatRegistration(input.registrationNumber),
          chassisNumber: normalizeChassis(input.chassisNumber),
          engineNumber: input.engineNumber.toUpperCase(),
          updatedAt: now(),
        };
        await d.vehicles.update(vehicleId, next);
        const fields: (keyof typeof input)[] = [
          "make", "model", "variant", "year", "registrationNumber", "chassisNumber", "fuelType",
          "transmission", "mileageKm", "color", "previousOwners",
        ];
        const changes = fields
          .filter((f) => String(next[f]) !== String(vehicle[f]))
          .map((f) => ({ field: f, before: String(vehicle[f]), after: String(next[f]) }));
        if (changes.length || input.notes !== vehicle.notes || input.engineNumber !== vehicle.engineNumber) {
          await log(d, actor, {
            entityType: "vehicle",
            entityId: vehicleId,
            action: "vehicle.updated",
            description: `Updated details of ${vehicleTitle(vehicle)} (${vehicle.registrationNumber})`,
            href: `/inventory/${vehicleId}`,
            metadata: { changes },
          });
        }
        if (input.askingPricePaise !== vehicle.askingPricePaise) {
          await log(d, actor, {
            entityType: "vehicle",
            entityId: vehicleId,
            action: "vehicle.price_changed",
            description: `Asking price of ${vehicleTitle(vehicle)} changed from ${formatINR(vehicle.askingPricePaise)} to ${formatINR(input.askingPricePaise)}`,
            href: `/inventory/${vehicleId}`,
          });
        }
      });
    },

    async addVehiclePhotos(actor, vehicleId, photos) {
      authorize(actor, "inventory.photos");
      if (photos.length === 0) return;
      const d = db();
      const settings = await d.settings.get("business");
      const max = settings?.maxPhotosPerVehicle ?? 20;
      const uploaded = await uploadPhotos(requirePhotoStorage(remote), vehicleId, photos);
      try {
        await d.transaction("rw", [d.vehicles, d.vehicleImages, d.imageBlobs, d.activity], async () => {
          const vehicle = await getOrThrow(d.vehicles.get(vehicleId), "Vehicle");
          const existing = await d.vehicleImages.where("vehicleId").equals(vehicleId).toArray();
          if (existing.length + photos.length > max)
            throw new BusinessError(`A vehicle can have at most ${max} photos (currently ${existing.length}).`);
          const startOrder = existing.reduce((m, i) => Math.max(m, i.order + 1), 0);
          const hasCover = existing.some((i) => i.isCover);
          const images = await storePhotos(d, vehicleId, photos, startOrder, hasCover, uploaded);
          if (!hasCover) await d.vehicles.update(vehicleId, { coverImageId: images.find((i) => i.isCover)?.id ?? images[0].id, updatedAt: now() });
          await log(d, actor, {
            entityType: "vehicle",
            entityId: vehicleId,
            action: "photo.added",
            description: `Added ${photos.length} photo${photos.length > 1 ? "s" : ""} to ${vehicleTitle(vehicle)}`,
            href: `/inventory/${vehicleId}`,
          });
        });
      } catch (error) {
        if (remote && uploaded) await discardUploads(remote, uploaded);
        throw error;
      }
    },

    async removeVehiclePhoto(actor, imageId) {
      authorize(actor, "inventory.photos");
      const d = db();
      const removed = await d.transaction("rw", [d.vehicles, d.vehicleImages, d.imageBlobs, d.activity], async () => {
        const image = await getOrThrow(d.vehicleImages.get(imageId), "Photo");
        const vehicle = await getOrThrow(d.vehicles.get(image.vehicleId), "Vehicle");
        await d.vehicleImages.delete(imageId);
        await d.imageBlobs.bulkDelete([image.storageKey, image.thumbKey]);
        const remaining = (await d.vehicleImages.where("vehicleId").equals(image.vehicleId).toArray()).sort(
          (a, b) => a.order - b.order,
        );
        await Promise.all(remaining.map((img, i) => d.vehicleImages.update(img.id, { order: i })));
        if (image.isCover) {
          const nextCover = remaining[0];
          if (nextCover) await d.vehicleImages.update(nextCover.id, { isCover: true });
          await d.vehicles.update(vehicle.id, { coverImageId: nextCover?.id ?? null, updatedAt: now() });
        }
        await log(d, actor, {
          entityType: "vehicle",
          entityId: vehicle.id,
          action: "photo.removed",
          description: `Removed a photo from ${vehicleTitle(vehicle)}`,
          href: `/inventory/${vehicle.id}`,
        });
        return image;
      });
      // The record is already gone, so a failed delete only leaves an orphaned object in the bucket.
      if (remote)
        await remote.remove([removed.storageKey, removed.thumbKey]).catch((e) => console.error("Could not delete photo from R2", e));
    },

    async reorderVehiclePhotos(actor, vehicleId, orderedIds) {
      authorize(actor, "inventory.photos");
      const d = db();
      await d.transaction("rw", [d.vehicleImages, d.vehicles, d.activity], async () => {
        const vehicle = await getOrThrow(d.vehicles.get(vehicleId), "Vehicle");
        const images = await d.vehicleImages.where("vehicleId").equals(vehicleId).toArray();
        const known = new Set(images.map((i) => i.id));
        if (orderedIds.length !== images.length || orderedIds.some((id) => !known.has(id)))
          throw new BusinessError("Photo order is out of date. Please try again.");
        await Promise.all(orderedIds.map((id, order) => d.vehicleImages.update(id, { order })));
        await log(d, actor, {
          entityType: "vehicle",
          entityId: vehicleId,
          action: "photo.reordered",
          description: `Reordered photos of ${vehicleTitle(vehicle)}`,
          href: `/inventory/${vehicleId}`,
        });
      });
    },

    async setCoverPhoto(actor, imageId) {
      authorize(actor, "inventory.photos");
      const d = db();
      await d.transaction("rw", [d.vehicleImages, d.vehicles], async () => {
        const image = await getOrThrow(d.vehicleImages.get(imageId), "Photo");
        const images = await d.vehicleImages.where("vehicleId").equals(image.vehicleId).toArray();
        await Promise.all(images.map((img) => d.vehicleImages.update(img.id, { isCover: img.id === imageId })));
        await d.vehicles.update(image.vehicleId, { coverImageId: imageId, updatedAt: now() });
      });
    },

    async reserveVehicle(actor, vehicleId, rawInput) {
      authorize(actor, "sales.create");
      const input = parse(reservationSchema, rawInput);
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const vehicle = await getOrThrow(d.vehicles.get(vehicleId), "Vehicle");
        const check = canReserve(vehicle);
        if (!check.ok) throw new BusinessError(check.message);
        const customer = await upsertCustomer(d, input);
        const ts = now();
        const reservation: Reservation = {
          id: newId(),
          reference: await nextReference(d, "RES"),
          vehicleId,
          customerId: customer.id,
          reservationDate: input.reservationDate,
          bookingAmountPaise: input.bookingAmountPaise,
          bookingMethod: input.bookingMethod,
          bookingReference: input.bookingReference,
          status: "active",
          notes: input.notes,
          createdBy: actor.id,
          saleId: null,
          cancelledAt: null,
          cancelReason: "",
          createdAt: ts,
          updatedAt: ts,
        };
        await d.reservations.add(reservation);
        await d.vehicles.update(vehicleId, { status: "reserved", updatedAt: ts });
        await syncLedger(d);
        await log(d, actor, {
          entityType: "reservation",
          entityId: reservation.id,
          action: "reservation.created",
          description: `Reserved ${vehicleTitle(vehicle)} (${vehicle.registrationNumber}) for ${customer.name}${
            input.bookingAmountPaise > 0 ? ` with booking of ${formatINR(input.bookingAmountPaise)}` : ""
          }`,
          href: `/inventory/${vehicleId}`,
        });
        return reservation.id;
      });
    },

    async cancelReservation(actor, reservationId, reason) {
      authorize(actor, "sales.create");
      if (reason.trim().length < 3) throw new BusinessError("Please give a reason for releasing the reservation.", "reason");
      const d = db();
      await d.transaction("rw", bookTables(d), async () => {
        const reservation = await getOrThrow(d.reservations.get(reservationId), "Reservation");
        const check = canCancelReservation(reservation);
        if (!check.ok) throw new BusinessError(check.message);
        const vehicle = await getOrThrow(d.vehicles.get(reservation.vehicleId), "Vehicle");
        const customer = await d.customers.get(reservation.customerId);
        const ts = now();
        await d.reservations.update(reservationId, {
          status: "cancelled",
          cancelledAt: ts,
          cancelReason: reason.trim(),
          updatedAt: ts,
        });
        if (vehicle.status === "reserved") await d.vehicles.update(vehicle.id, { status: "available", updatedAt: ts });
        await syncLedger(d);
        await log(d, actor, {
          entityType: "reservation",
          entityId: reservationId,
          action: "reservation.cancelled",
          description: `Released reservation of ${vehicleTitle(vehicle)} for ${customer?.name ?? "buyer"}`,
          href: `/inventory/${vehicle.id}`,
          metadata: { changes: [{ field: "Reason", after: reason.trim() }] },
        });
      });
    },

    async completeSale(actor, rawInput) {
      authorize(actor, "sales.create");
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const pre = rawInput as { reservationId?: string | null };
        const reservation = pre.reservationId ? await d.reservations.get(pre.reservationId) : undefined;
        const bookingPaise = reservation?.status === "active" ? reservation.bookingAmountPaise : 0;
        const input = parse(makeSaleSchema(bookingPaise), rawInput);
        const vehicle = await getOrThrow(d.vehicles.get(input.vehicleId), "Vehicle");
        const activeReservation =
          (await d.reservations.where("vehicleId").equals(vehicle.id).filter((r) => r.status === "active").first()) ?? null;
        const existingSale =
          (await d.sales.where("vehicleId").equals(vehicle.id).filter((s) => s.status === "completed" && s.returnStatus !== "returned").first()) ?? null;
        const check = canSell(vehicle, activeReservation, input.reservationId, existingSale);
        if (!check.ok) throw new BusinessError(check.message);

        const branchId = input.branchId ?? vehicle.branchId ?? (await actorBranch(d, actor));
        assertBranchAccess(actor, branchId);
        const lines = await resolveLines(d, linesOf(input), branchId, { allowFinance: true, field: "payments" });
        const customer = await upsertCustomer(d, input);
        const ts = now();
        const sale: Sale = {
          id: newId(),
          reference: await nextReference(d, "SAL"),
          vehicleId: vehicle.id,
          customerId: customer.id,
          reservationId: activeReservation?.id ?? null,
          saleDate: input.saleDate,
          salePricePaise: input.salePricePaise,
          status: "completed",
          notes: input.notes,
          soldBy: actor.id,
          cancelledAt: null,
          cancelReason: "",
          branchId,
          returnedPaise: 0,
          refundedPaise: 0,
          financeAdjustedPaise: 0,
          returnStatus: "none",
          createdAt: ts,
          updatedAt: ts,
        };
        await d.sales.add(sale);

        const payments: SalePayment[] = [];
        if (activeReservation && activeReservation.bookingAmountPaise > 0) {
          payments.push({
            id: newId(),
            saleId: sale.id,
            receiptNumber: await nextReference(d, "RCT"),
            amountPaise: activeReservation.bookingAmountPaise,
            date: activeReservation.reservationDate,
            method: activeReservation.bookingMethod,
            reference: activeReservation.bookingReference,
            notes: `Booking amount from reservation ${activeReservation.reference}`,
            kind: "booking",
            recordedBy: activeReservation.createdBy,
            createdAt: ts,
            updatedAt: ts,
          });
        }
        // Lines paid together at the sale share one receipt.
        if (lines.length) payments.push(...(await paymentRows(d, sale.id, lines, input.saleDate, actor.id, "Payment at sale", ts)));
        if (payments.length) await d.salePayments.bulkAdd(payments);
        if (activeReservation)
          await d.reservations.update(activeReservation.id, { status: "converted", saleId: sale.id, updatedAt: ts });
        await d.vehicles.update(vehicle.id, { status: "sold", updatedAt: ts });
        await syncLedger(d);
        await log(d, actor, {
          entityType: "sale",
          entityId: sale.id,
          action: "sale.completed",
          description: `Sold ${vehicleTitle(vehicle)} (${vehicle.registrationNumber}) to ${customer.name} for ${formatINR(sale.salePricePaise)}`,
          href: `/sales/${sale.id}`,
        });
        return sale.id;
      });
    },

    async cancelSale(actor, saleId, reason) {
      authorize(actor, "sales.cancel");
      if (reason.trim().length < 5) throw new BusinessError("Please give a reason (at least 5 characters).", "reason");
      const d = db();
      await d.transaction("rw", bookTables(d), async () => {
        const sale = await getOrThrow(d.sales.get(saleId), "Sale");
        const check = canCancelSale(sale);
        if (!check.ok) throw new BusinessError(check.message);
        const vehicle = await getOrThrow(d.vehicles.get(sale.vehicleId), "Vehicle");
        const ts = now();
        await d.sales.update(saleId, { status: "cancelled", cancelledAt: ts, cancelReason: reason.trim(), updatedAt: ts });
        // Only restore stock if the vehicle is still marked sold by this sale.
        if (vehicle.status === "sold" && !vehicle.archivedAt)
          await d.vehicles.update(vehicle.id, { status: statusAfterSaleCancellation(), updatedAt: ts });
        await syncLedger(d);
        await log(d, actor, {
          entityType: "sale",
          entityId: saleId,
          action: "sale.cancelled",
          description: `Cancelled sale ${sale.reference}; ${vehicleTitle(vehicle)} returned to available stock`,
          href: `/sales/${saleId}`,
          metadata: { changes: [{ field: "Reason", after: reason.trim() }] },
        });
      });
    },

    async recordPayment(actor, saleId, rawInput) {
      authorize(actor, "payments.record");
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const sale = await getOrThrow(d.sales.get(saleId), "Sale");
        const payments = await d.salePayments.where("saleId").equals(saleId).toArray();
        const totals = saleTotals(sale, payments);
        const input = parse(makePaymentSchema(totals.balancePaise), rawInput);
        const check = validatePayment(input.amountPaise, totals.balancePaise, sale.status);
        if (!check.ok) throw new BusinessError(check.message, "amountPaise");
        const [line] = await resolveLines(
          d,
          [{ method: input.method, amountPaise: input.amountPaise, accountId: input.accountId ?? null, reference: input.reference, lenderName: "", loanReference: "" }],
          sale.branchId ?? null,
          { allowFinance: false, field: "" },
        );
        const ts = now();
        const payment: SalePayment = {
          id: newId(),
          saleId,
          receiptNumber: await nextReference(d, "RCT"),
          amountPaise: input.amountPaise,
          date: input.date,
          method: input.method,
          reference: input.reference,
          notes: input.notes,
          kind: "payment",
          recordedBy: actor.id,
          accountId: line.accountId,
          receivedBy: input.receivedBy ?? actor.id,
          createdAt: ts,
          updatedAt: ts,
        };
        await d.salePayments.add(payment);
        await syncLedger(d);
        const customer = await d.customers.get(sale.customerId);
        await log(d, actor, {
          entityType: "payment",
          entityId: payment.id,
          action: "payment.recorded",
          description: `Received ${formatINR(input.amountPaise)} from ${customer?.name ?? "buyer"} against ${sale.reference}`,
          href: `/sales/${saleId}`,
          metadata: {
            financial: [{ label: "Balance due", before: totals.balancePaise, after: totals.balancePaise - input.amountPaise }],
          },
        });
        return payment.id;
      });
    },

    async receivePayments(actor, saleId, rawInput) {
      authorize(actor, "payments.record");
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const sale = await getOrThrow(d.sales.get(saleId), "Sale");
        if (sale.status !== "completed") throw new BusinessError("Payments cannot be recorded against a cancelled sale.");
        const totals = saleTotals(sale, await d.salePayments.where("saleId").equals(saleId).toArray());
        if (totals.balancePaise <= 0) throw new BusinessError("Nothing is due on this sale.");
        const input = parse(makeReceiveSchema(totals.balancePaise), rawInput);
        const lines = await resolveLines(d, input.lines, sale.branchId ?? null, { allowFinance: true, field: "lines" });
        const ts = now();
        const rows = (await paymentRows(d, saleId, lines, input.date, actor.id, input.notes, ts)).map((p) => ({ ...p, receivedBy: input.receivedBy ?? actor.id }));
        await d.salePayments.bulkAdd(rows);
        await syncLedger(d);
        const total = lineTotal(lines);
        const customer = await d.customers.get(sale.customerId);
        await log(d, actor, {
          entityType: "payment",
          entityId: rows[0].id,
          action: "payment.recorded",
          description: `Received ${formatINR(total)} from ${customer?.name ?? "buyer"} against ${sale.reference}${rows.length > 1 ? ` in ${rows.length} parts` : ""}`,
          href: `/sales/${saleId}`,
          metadata: { financial: [{ label: "Balance due", before: totals.balancePaise, after: totals.balancePaise - total }] },
        });
        return rows.map((r) => r.id);
      });
    },

    async settleFinance(actor, paymentId, rawInput) {
      authorize(actor, "payments.record");
      const input = parse(settleFinanceSchema, rawInput);
      const d = db();
      await d.transaction("rw", bookTables(d), async () => {
        const payment = await getOrThrow(d.salePayments.get(paymentId), "Payment");
        if (payment.method !== "finance") throw new BusinessError("Only loan lines are received from a lender.");
        if (payment.settledOn) throw new BusinessError("The lender has already paid this loan.");
        const pending = financePending(payment);
        if (pending <= 0) throw new BusinessError("Nothing is pending on this loan.");
        const account = await getOrThrow(d.accounts.get(input.accountId), "Account");
        if (!MONEY_KINDS.includes(account.kind) || account.archived) throw new BusinessError("Choose an active bank or cash account.", "accountId");
        if (input.date < payment.date) throw new BusinessError("The loan can't be received before the sale payment date.", "date");
        await d.salePayments.update(paymentId, {
          settledOn: input.date,
          settledAccountId: account.id,
          settledReference: input.reference,
          settledBy: actor.id,
          updatedAt: now(),
        });
        await syncLedger(d);
        const sale = await d.sales.get(payment.saleId);
        await log(d, actor, {
          entityType: "payment",
          entityId: paymentId,
          action: "payment.finance_settled",
          description: `Received ${formatINR(pending)} loan from ${payment.lenderName || "lender"} into ${account.name}${sale ? ` for ${sale.reference}` : ""}`,
          href: sale ? `/sales/${sale.id}` : null,
        });
      });
    },

    async payPurchase(actor, purchaseId, rawInput) {
      authorize(actor, "purchases.manage");
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const purchase = await getOrThrow(d.purchases.get(purchaseId), "Purchase");
        if (purchase.status !== "active") throw new BusinessError("This purchase was cancelled.");
        const balance = purchaseBalance(purchase);
        if (balance <= 0) throw new BusinessError(`Nothing is owed to ${purchase.sellerName}.`);
        const input = parse(makeReceiveSchema(balance), rawInput);
        const lines = await resolveLines(d, input.lines, purchase.branchId ?? null, { allowFinance: false, field: "lines" });
        const ts = now();
        const number = await nextReference(d, "PPY");
        const rows: PurchasePayment[] = lines.map((l) => ({
          id: newId(), purchaseId, number, date: input.date, method: l.method, amountPaise: l.amountPaise, accountId: l.accountId,
          reference: l.reference, notes: input.notes, kind: "payment", recordedBy: actor.id, createdAt: ts, updatedAt: ts,
        }));
        await d.purchasePayments.bulkAdd(rows);
        const total = lineTotal(lines);
        await d.purchases.update(purchaseId, { amountPaidPaise: purchase.amountPaidPaise + total, updatedAt: ts });
        await syncLedger(d);
        await log(d, actor, {
          entityType: "purchase",
          entityId: purchaseId,
          action: "purchase.payment_recorded",
          description: `Paid ${formatINR(total)} to ${purchase.sellerName} against ${purchase.reference} (${number})`,
          href: `/purchases/${purchaseId}`,
          metadata: { sensitive: true, financial: [{ label: "Seller balance", before: balance, after: balance - total }] },
        });
        return rows.map((r) => r.id);
      });
    },

    async createExpense(actor, rawInput) {
      authorize(actor, "expenses.manage");
      const input = parse(expenseSchema, rawInput);
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const vehicle = input.vehicleId ? await getOrThrow(d.vehicles.get(input.vehicleId), "Vehicle") : null;
        const account = await expenseAccount(d, input);
        const branchId = input.branchId ?? account.branchId ?? vehicle?.branchId ?? (await actorBranch(d, actor));
        assertBranchAccess(actor, branchId);
        const ts = now();
        const expense: Expense = {
          id: newId(),
          reference: await nextReference(d, "EXP"),
          ...input,
          paymentReference: input.paymentReference ?? "",
          branchId,
          createdBy: actor.id,
          createdAt: ts,
          updatedAt: ts,
        };
        await d.expenses.add(expense);
        await syncLedger(d);
        await log(d, actor, {
          entityType: "expense",
          entityId: expense.id,
          action: "expense.created",
          description: `Recorded ${EXPENSE_CATEGORY_LABELS[expense.category].toLowerCase()} expense${
            vehicle ? ` for ${vehicleTitle(vehicle)} (${vehicle.registrationNumber})` : ""
          }: ${expense.description} — paid from ${account.name}`,
          href: vehicle ? `/inventory/${vehicle.id}` : "/expenses",
          metadata: { sensitive: true, financial: [{ label: "Amount", after: expense.amountPaise }] },
        });
        return expense.id;
      });
    },

    async updateExpense(actor, expenseId, rawInput) {
      authorize(actor, "expenses.manage");
      const input = parse(expenseSchema, rawInput);
      const d = db();
      await d.transaction("rw", bookTables(d), async () => {
        const expense = await getOrThrow(d.expenses.get(expenseId), "Expense");
        if (input.vehicleId) await getOrThrow(d.vehicles.get(input.vehicleId), "Vehicle");
        const account = await expenseAccount(d, input);
        const branchId = input.branchId ?? account.branchId ?? expense.branchId ?? null;
        await d.expenses.update(expenseId, { ...input, paymentReference: input.paymentReference ?? "", branchId, updatedAt: now() });
        await syncLedger(d);
        const changes: { field: string; before?: string; after?: string }[] = [];
        if (input.vehicleId !== expense.vehicleId)
          changes.push({ field: "Linked vehicle", before: expense.vehicleId ?? "None", after: input.vehicleId ?? "None" });
        if (input.accountId !== expense.accountId) {
          const before = expense.accountId ? (await d.accounts.get(expense.accountId))?.name : undefined;
          changes.push({ field: "Paid from", before: before ?? "Unassigned", after: account.name });
        }
        await log(d, actor, {
          entityType: "expense",
          entityId: expenseId,
          action: "expense.updated",
          description: `Updated expense ${expense.reference}: ${input.description}`,
          href: "/expenses",
          metadata: {
            sensitive: true,
            financial:
              input.amountPaise !== expense.amountPaise
                ? [{ label: "Amount", before: expense.amountPaise, after: input.amountPaise }]
                : undefined,
            changes: changes.length ? changes : undefined,
          },
        });
      });
    },

    async deleteExpense(actor, expenseId) {
      authorize(actor, "expenses.manage");
      const d = db();
      await d.transaction("rw", bookTables(d), async () => {
        const expense = await getOrThrow(d.expenses.get(expenseId), "Expense");
        await d.expenses.delete(expenseId);
        await syncLedger(d);
        await log(d, actor, {
          entityType: "expense",
          entityId: expenseId,
          action: "expense.deleted",
          description: `Deleted expense ${expense.reference}: ${expense.description}`,
          href: null,
          metadata: { sensitive: true, financial: [{ label: "Amount", before: expense.amountPaise, after: null }] },
        });
      });
    },

    async updateVehiclePapers(actor, vehicleId, rawInput) {
      // Office staff keep the papers up to date without being able to edit the car itself.
      authorize(actor, can(actor, "documents.manage") ? "documents.manage" : "inventory.edit");
      const input = parse(papersSchema, rawInput);
      const d = db();
      await d.transaction("rw", [d.vehicles, d.activity], async () => {
        const vehicle = await getOrThrow(d.vehicles.get(vehicleId), "Vehicle");
        const papers = { ...input, financierName: input.hypothecated ? input.financierName : "", nocReceived: input.hypothecated && input.nocReceived };
        await d.vehicles.update(vehicleId, { papers, updatedAt: now() });
        const before = vehicle.papers;
        const changes: { field: string; before?: string; after?: string }[] = [];
        const track = (field: string, a: string | undefined, b: string) => {
          if ((a ?? "") !== b) changes.push({ field, before: a || "—", after: b || "—" });
        };
        track("Insurance valid till", before?.insuranceValidTill, papers.insuranceValidTill);
        track("PUC valid till", before?.pucValidTill, papers.pucValidTill);
        track("RC valid till", before?.rcValidTill, papers.rcValidTill);
        track("Hypothecation", before ? (before.hypothecated ? before.financierName : "None") : undefined, papers.hypothecated ? papers.financierName : "None");
        await log(d, actor, {
          entityType: "vehicle",
          entityId: vehicleId,
          action: "vehicle.papers_updated",
          description: `Updated papers of ${vehicleTitle(vehicle)} (${vehicle.registrationNumber})`,
          href: `/inventory/${vehicleId}`,
          metadata: { changes },
        });
      });
    },

    async createAccount(actor, rawInput) {
      authorize(actor, "accounts.manage");
      const input = parse(accountSchema, rawInput);
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        if (input.custodianId) await getOrThrow(d.users.get(input.custodianId), "Cash holder");
        const branchId = await accountBranch(d, actor, input);
        const ts = now();
        const account: MoneyAccount = { id: newId(), ...input, branchId, archived: false, createdAt: ts, updatedAt: ts };
        await d.accounts.add(account);
        await keepOneDefault(d, account);
        await syncLedger(d);
        await log(d, actor, {
          entityType: "account",
          entityId: account.id,
          action: "account.created",
          description: `Added ${ACCOUNT_KIND_LABELS[account.kind].toLowerCase()} account ${account.name}`,
          href: `/accounts?account=${account.id}`,
        });
        return account.id;
      });
    },

    async updateAccount(actor, accountId, rawInput) {
      authorize(actor, "accounts.manage");
      const input = parse(accountSchema, rawInput);
      const d = db();
      await d.transaction("rw", bookTables(d), async () => {
        const account = await getOrThrow(d.accounts.get(accountId), "Account");
        if (input.kind !== account.kind) throw new BusinessError("An account cannot switch between cash and bank. Add a new one instead.", "kind");
        if (input.custodianId) await getOrThrow(d.users.get(input.custodianId), "Cash holder");
        if (input.archived && input.isDefault && MONEY_KINDS.includes(account.kind))
          throw new BusinessError("Make another account the default before archiving this one.", "archived");
        const branchId = await accountBranch(d, actor, { ...input, branchId: input.branchId === undefined ? account.branchId : input.branchId });
        const next: MoneyAccount = { ...account, ...input, branchId, updatedAt: now() };
        await d.accounts.put(next);
        await keepOneDefault(d, next);
        if (MONEY_KINDS.includes(next.kind)) {
          const others = (await d.accounts.toArray()).filter((a) => sameDefaultGroup(a, next) && !a.archived);
          if (others.length && !others.some((a) => a.isDefault))
            throw new BusinessError(next.kind === "cash" ? "Keep one cash account as this branch's default." : "Keep one bank account as the default.", "isDefault");
        }
        await syncLedger(d);
        await log(d, actor, {
          entityType: "account",
          entityId: accountId,
          action: "account.updated",
          description: `Updated account ${next.name}${input.openingBalancePaise !== account.openingBalancePaise ? ` (opening balance ${formatINR(account.openingBalancePaise)} → ${formatINR(input.openingBalancePaise)})` : ""}`,
          href: `/accounts?account=${accountId}`,
        });
      });
    },

    async createVoucher(actor, rawInput) {
      authorize(actor, "accounts.manage");
      const input = parse(voucherSchema, rawInput);
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const from = await getOrThrow(d.accounts.get(input.accountId), "Account");
        if (from.archived) throw new BusinessError(`${from.name} is archived. Pick an active account.`, "accountId");
        let to: MoneyAccount | undefined;
        if (input.toAccountId) {
          to = await getOrThrow(d.accounts.get(input.toAccountId), "Account");
          if (to.archived) throw new BusinessError(`${to.name} is archived. Pick an active account.`, "toAccountId");
        }
        if (input.type !== "contra" && !MONEY_KINDS.includes(from.kind))
          throw new BusinessError("Receipts and payments go through a cash or bank account.", "accountId");
        if (input.type === "contra" && from.kind === "finance")
          throw new BusinessError("Loans due from lenders are received from the sale, not moved by transfer.", "accountId");
        await getOrThrow(d.users.get(input.handledBy), "Staff member");
        const branchId = input.branchId ?? from.branchId ?? to?.branchId ?? (await actorBranch(d, actor));
        const ts = now();
        let purchase: Purchase | undefined;
        if (input.head === "seller_payment" && input.purchaseId) {
          purchase = await getOrThrow(d.purchases.get(input.purchaseId), "Purchase");
          if (purchase.status !== "active") throw new BusinessError("This purchase was cancelled.", "purchaseId");
          const balance = purchaseBalance(purchase);
          if (input.amountPaise > balance)
            throw new BusinessError(`Only ${formatINR(balance)} is still owed to ${purchase.sellerName}.`, "amountPaise");
          await d.purchases.update(purchase.id, { amountPaidPaise: purchase.amountPaidPaise + input.amountPaise, updatedAt: ts });
        }
        if (input.saleId) await getOrThrow(d.sales.get(input.saleId), "Sale");
        const prefix = input.type === "receipt" ? "RV" : input.type === "payment" ? "PV" : "CV";
        const voucher: Voucher = {
          id: newId(),
          number: await nextReference(d, prefix),
          type: input.type,
          head: input.head as VoucherHead,
          date: input.date,
          amountPaise: input.amountPaise,
          method: input.method,
          accountId: input.accountId,
          toAccountId: input.type === "contra" ? input.toAccountId : null,
          partyName: purchase ? purchase.sellerName : input.partyName,
          partyPhone: purchase ? purchase.sellerContact : input.partyPhone.replace(/[\s-]/g, ""),
          reference: input.reference,
          narration: input.narration,
          purchaseId: purchase?.id ?? null,
          saleId: input.saleId,
          handledBy: input.handledBy,
          branchId,
          status: "active",
          createdBy: actor.id,
          cancelledAt: null,
          cancelReason: "",
          createdAt: ts,
          updatedAt: ts,
        };
        await d.vouchers.add(voucher);
        await syncLedger(d);
        // A branch can't hand over or deposit cash it doesn't have.
        if (voucher.type === "contra") await assertCashNotNegative(d, voucher.accountId, voucher.date);
        const what = VOUCHER_HEAD_LABELS[voucher.head].toLowerCase();
        await log(d, actor, {
          entityType: "voucher",
          entityId: voucher.id,
          action: "voucher.created",
          description:
            voucher.type === "contra"
              ? `Moved ${formatINR(voucher.amountPaise)} from ${from.name} to ${to?.name ?? "account"} (${voucher.number})`
              : `${voucher.type === "receipt" ? "Received" : "Paid"} ${formatINR(voucher.amountPaise)} ${voucher.type === "receipt" ? "from" : "to"} ${voucher.partyName} — ${what} (${voucher.number})`,
          href: `/voucher/${voucher.id}`,
          metadata: purchase ? { sensitive: true, financial: [{ label: "Seller balance", before: purchaseBalance(purchase), after: purchaseBalance(purchase) - voucher.amountPaise }] } : undefined,
        });
        return voucher.id;
      });
    },

    async cancelVoucher(actor, voucherId, reason) {
      authorize(actor, "accounts.manage");
      if (reason.trim().length < 5) throw new BusinessError("Please give a reason (at least 5 characters).", "reason");
      const d = db();
      await d.transaction("rw", bookTables(d), async () => {
        const voucher = await getOrThrow(d.vouchers.get(voucherId), "Voucher");
        if (voucher.status === "cancelled") throw new BusinessError("This voucher is already cancelled.");
        const ts = now();
        if (voucher.head === "seller_payment" && voucher.purchaseId) {
          const purchase = await d.purchases.get(voucher.purchaseId);
          if (purchase)
            await d.purchases.update(purchase.id, { amountPaidPaise: Math.max(0, purchase.amountPaidPaise - voucher.amountPaise), updatedAt: ts });
        }
        await d.vouchers.update(voucherId, { status: "cancelled", cancelledAt: ts, cancelReason: reason.trim(), updatedAt: ts });
        await syncLedger(d);
        // Cancelling a deposit into a cash account takes that cash back out.
        if (voucher.type === "contra" && voucher.toAccountId) await assertCashNotNegative(d, voucher.toAccountId, voucher.date);
        await log(d, actor, {
          entityType: "voucher",
          entityId: voucherId,
          action: "voucher.cancelled",
          description: `Cancelled voucher ${voucher.number} (${formatINR(voucher.amountPaise)})`,
          href: `/voucher/${voucherId}`,
          metadata: { changes: [{ field: "Reason", after: reason.trim() }] },
        });
      });
    },

    async createSalesReturn(actor, rawInput) {
      authorize(actor, "sales.cancel");
      const input = parse(salesReturnSchema, rawInput);
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const sale = await getOrThrow(d.sales.get(input.saleId), "Sale");
        const check = canReturnSale(sale);
        if (!check.ok) throw new BusinessError(check.message);
        if (input.date < sale.saleDate) throw new BusinessError("A return can't be dated before the sale.", "date");
        const limit = returnable(sale.salePricePaise, await d.salesReturns.where("saleId").equals(sale.id).toArray());
        if (input.returnAmountPaise > limit)
          throw new BusinessError(`At most ${formatINR(limit)} of this sale can still be returned.`, "returnAmountPaise");

        const payments = await d.salePayments.where("saleId").equals(sale.id).toArray();
        let loan: SalePayment | undefined;
        if (input.financeAdjustmentPaise > 0) {
          loan = payments.find((p) => p.id === input.financePaymentId && p.method === "finance");
          if (!loan) throw new BusinessError("Pick a loan line from this sale.", "financePaymentId");
          const pending = financePending(loan);
          if (input.financeAdjustmentPaise > pending)
            throw new BusinessError(`Only ${formatINR(pending)} of this loan is still due from ${loan.lenderName || "the lender"}.`, "financeAdjustmentPaise");
          if (input.financeAdjustmentPaise > input.returnAmountPaise - input.deductionPaise)
            throw new BusinessError("The loan adjustment can't be more than the return amount less deductions.", "financeAdjustmentPaise");
        }

        const ts = now();
        const effect = salesReturnEffect(sale, payments, input);
        const nextSale: Sale = { ...effect.next, updatedAt: ts };
        const refundDuePaise = effect.refundDuePaise;
        const refundLines = await resolveLines(d, input.refunds, sale.branchId ?? null, { allowFinance: false, field: "refunds" });
        const refunded = lineTotal(refundLines);
        if (refunded > refundDuePaise)
          throw new BusinessError(
            refundDuePaise === 0 ? "Nothing is refundable: the buyer hasn't paid more than the sale is now worth." : `Only ${formatINR(refundDuePaise)} is refundable on this return.`,
            "refunds",
          );

        const ret: SalesReturn = {
          id: newId(),
          number: await nextReference(d, "CN"),
          saleId: sale.id,
          customerId: sale.customerId,
          vehicleId: sale.vehicleId,
          branchId: sale.branchId ?? null,
          date: input.date,
          returnAmountPaise: input.returnAmountPaise,
          deductionPaise: input.deductionPaise,
          financePaymentId: loan?.id ?? null,
          financeAdjustmentPaise: input.financeAdjustmentPaise,
          refundDuePaise,
          vehicleReturned: input.vehicleReturned,
          reason: input.reason,
          notes: input.notes,
          createdBy: actor.id,
          createdAt: ts,
          updatedAt: ts,
        };
        await d.salesReturns.add(ret);
        if (loan) await d.salePayments.update(loan.id, { adjustedPaise: (loan.adjustedPaise ?? 0) + input.financeAdjustmentPaise, updatedAt: ts });
        await d.sales.put({ ...nextSale, refundedPaise: (sale.refundedPaise ?? 0) + refunded });
        if (refundLines.length) await d.returnRefunds.bulkAdd(await refundRows(d, "sales", ret.id, refundLines, input.date, actor.id, ts));
        // The car is back in the showroom, waiting to be checked before it goes on sale again.
        const vehicle = await getOrThrow(d.vehicles.get(sale.vehicleId), "Vehicle");
        if (input.vehicleReturned) await d.vehicles.update(vehicle.id, { status: "returned_inspection", updatedAt: ts });
        await syncLedger(d);
        const customer = await d.customers.get(sale.customerId);
        await log(d, actor, {
          entityType: "sales_return",
          entityId: ret.id,
          action: "sales_return.created",
          description: `Sales return ${ret.number} on ${sale.reference}: ${formatINR(ret.returnAmountPaise)} from ${customer?.name ?? "buyer"}${input.vehicleReturned ? `; ${vehicleTitle(vehicle)} back for inspection` : ""}`,
          href: `/sales/returns/${ret.id}`,
          metadata: {
            financial: [
              { label: "Return amount", after: ret.returnAmountPaise },
              { label: "Deduction", after: ret.deductionPaise },
              { label: "Refunded now", after: refunded },
            ],
          },
        });
        return ret.id;
      });
    },

    async createPurchaseReturn(actor, rawInput) {
      authorize(actor, "purchases.manage");
      const input = parse(purchaseReturnSchema, rawInput);
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const purchase = await getOrThrow(d.purchases.get(input.purchaseId), "Purchase");
        const vehicle = await d.vehicles.get(purchase.vehicleId);
        const check = canReturnPurchase(purchase, vehicle);
        if (!check.ok) throw new BusinessError(check.message);
        if (input.date < purchase.purchaseDate) throw new BusinessError("A return can't be dated before the purchase.", "date");
        const limit = returnable(purchase.purchasePricePaise, await d.purchaseReturns.where("purchaseId").equals(purchase.id).toArray());
        if (input.returnAmountPaise > limit)
          throw new BusinessError(`At most ${formatINR(limit)} of this purchase can still be returned.`, "returnAmountPaise");

        const ts = now();
        const effect = purchaseReturnEffect(purchase, input);
        const nextPurchase: Purchase = { ...effect.next, updatedAt: ts };
        const refundDuePaise = effect.refundDuePaise;
        const refundLines = await resolveLines(d, input.refunds, purchase.branchId ?? null, { allowFinance: false, field: "refunds" });
        const received = lineTotal(refundLines);
        if (received > refundDuePaise)
          throw new BusinessError(
            refundDuePaise === 0 ? "Nothing is refundable: less has been paid to the seller than the return leaves owing." : `Only ${formatINR(refundDuePaise)} is due back from the seller.`,
            "refunds",
          );

        const ret: PurchaseReturn = {
          id: newId(),
          number: await nextReference(d, "DN"),
          purchaseId: purchase.id,
          vehicleId: purchase.vehicleId,
          branchId: purchase.branchId ?? null,
          sellerName: purchase.sellerName,
          date: input.date,
          returnAmountPaise: input.returnAmountPaise,
          deductionPaise: input.deductionPaise,
          refundDuePaise,
          reason: input.reason,
          notes: input.notes,
          createdBy: actor.id,
          createdAt: ts,
          updatedAt: ts,
        };
        await d.purchaseReturns.add(ret);
        await d.purchases.put({ ...nextPurchase, refundReceivedPaise: (purchase.refundReceivedPaise ?? 0) + received });
        if (refundLines.length) await d.returnRefunds.bulkAdd(await refundRows(d, "purchase", ret.id, refundLines, input.date, actor.id, ts));
        // Out of stock in the same transaction as the money.
        if (vehicle) await d.vehicles.update(vehicle.id, { status: "returned_to_supplier", archivedAt: ts, updatedAt: ts });
        await syncLedger(d);
        await log(d, actor, {
          entityType: "purchase_return",
          entityId: ret.id,
          action: "purchase_return.created",
          description: `Purchase return ${ret.number}: ${vehicle ? `${vehicleTitle(vehicle)} (${vehicle.registrationNumber})` : "car"} sent back to ${purchase.sellerName}`,
          href: `/purchases/returns/${ret.id}`,
          metadata: {
            sensitive: true,
            financial: [
              { label: "Return amount", after: ret.returnAmountPaise },
              { label: "Deduction", after: ret.deductionPaise },
              { label: "Refund received now", after: received },
            ],
          },
        });
        return ret.id;
      });
    },

    async recordRefund(actor, returnType, returnId, rawInput) {
      authorize(actor, returnType === "sales" ? "payments.record" : "purchases.manage");
      const input = parse(refundSchema, rawInput);
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const ret = returnType === "sales" ? await getOrThrow(d.salesReturns.get(returnId), "Sales return") : await getOrThrow(d.purchaseReturns.get(returnId), "Purchase return");
        if (input.date < ret.date) throw new BusinessError("A refund can't be dated before its return.", "date");
        const paid = sumPaise((await d.returnRefunds.where("[returnType+returnId]").equals([returnType, returnId]).toArray()).map((r) => r.amountPaise));
        const pending = ret.refundDuePaise - paid;
        const lines = await resolveLines(d, input.lines, ret.branchId, { allowFinance: false, field: "lines" });
        const total = lineTotal(lines);
        if (pending <= 0) throw new BusinessError("This return's refund is already settled.");
        if (total > pending) throw new BusinessError(`Only ${formatINR(pending)} is still pending on ${ret.number}.`, "lines");
        const ts = now();
        const rows = await refundRows(d, returnType, returnId, lines, input.date, actor.id, ts);
        await d.returnRefunds.bulkAdd(rows);
        let party = "";
        if (returnType === "sales") {
          const r = ret as SalesReturn;
          const sale = await getOrThrow(d.sales.get(r.saleId), "Sale");
          await d.sales.update(sale.id, { refundedPaise: (sale.refundedPaise ?? 0) + total, updatedAt: ts });
          party = (await d.customers.get(r.customerId))?.name ?? "buyer";
        } else {
          const r = ret as PurchaseReturn;
          const purchase = await getOrThrow(d.purchases.get(r.purchaseId), "Purchase");
          await d.purchases.update(purchase.id, { refundReceivedPaise: (purchase.refundReceivedPaise ?? 0) + total, updatedAt: ts });
          party = r.sellerName;
        }
        await syncLedger(d);
        await log(d, actor, {
          entityType: returnType === "sales" ? "sales_return" : "purchase_return",
          entityId: returnId,
          action: "refund.recorded",
          description: `${returnType === "sales" ? `Refunded ${formatINR(total)} to` : `Received ${formatINR(total)} refund from`} ${party} on ${ret.number}`,
          href: returnType === "sales" ? `/sales/returns/${returnId}` : `/purchases/returns/${returnId}`,
          metadata: { financial: [{ label: "Refund pending", before: pending, after: pending - total }] },
        });
        return rows.map((r) => r.id);
      });
    },

    async backToStock(actor, vehicleId) {
      authorize(actor, "inventory.edit");
      const d = db();
      await d.transaction("rw", [d.vehicles, d.activity], async () => {
        const vehicle = await getOrThrow(d.vehicles.get(vehicleId), "Vehicle");
        if (vehicle.status !== "returned_inspection") throw new BusinessError("Only cars waiting for inspection after a return can be moved back to stock.");
        await d.vehicles.update(vehicleId, { status: "available", updatedAt: now() });
        await log(d, actor, {
          entityType: "vehicle",
          entityId: vehicleId,
          action: "vehicle.back_to_stock",
          description: `${vehicleTitle(vehicle)} (${vehicle.registrationNumber}) passed inspection and is back in stock`,
          href: `/inventory/${vehicleId}`,
        });
      });
    },

    async createBranch(actor, rawInput) {
      authorize(actor, "settings.manage");
      const input = parse(branchSchema, rawInput);
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const branches = await d.branches.toArray();
        if (branches.some((b) => b.code === input.code)) throw new BusinessError(`Code ${input.code} is already used by another branch.`, "code");
        const ts = now();
        const branch: Branch = { id: newId(), ...input, phone: input.phone.replace(/[\s-]/g, ""), archived: false, createdAt: ts, updatedAt: ts };
        await d.branches.add(branch);
        // Every branch keeps its own cash in hand.
        await d.accounts.add({
          id: newId(), name: `Cash in hand – ${branch.name}`, kind: "cash", bankName: "", accountNumber: "", ifsc: "", upiId: "", custodianId: null,
          openingBalancePaise: 0, openingDate: todayISO(), isDefault: true, archived: false, notes: "", branchId: branch.id, createdAt: ts, updatedAt: ts,
        });
        await log(d, actor, { entityType: "branch", entityId: branch.id, action: "branch.created", description: `Added branch ${branch.name} (${branch.code}) with its own cash in hand`, href: "/settings" });
        return branch.id;
      });
    },

    async updateBranch(actor, branchId, rawInput) {
      authorize(actor, "settings.manage");
      const input = parse(branchSchema, rawInput);
      const d = db();
      await d.transaction("rw", [d.branches, d.activity], async () => {
        const branch = await getOrThrow(d.branches.get(branchId), "Branch");
        const clash = (await d.branches.toArray()).find((b) => b.code === input.code && b.id !== branchId);
        if (clash) throw new BusinessError(`Code ${input.code} is already used by ${clash.name}.`, "code");
        if (input.archived && (await d.branches.filter((b) => !b.archived && b.id !== branchId).count()) === 0)
          throw new BusinessError("Keep at least one active branch.", "archived");
        await d.branches.update(branchId, { ...input, phone: input.phone.replace(/[\s-]/g, ""), updatedAt: now() });
        await log(d, actor, { entityType: "branch", entityId: branchId, action: "branch.updated", description: `Updated branch ${branch.name}`, href: "/settings" });
      });
    },

    async closeDay(actor, rawInput) {
      authorize(actor, "accounts.manage");
      const input = parse(dayCloseSchema, rawInput);
      const d = db();
      return d.transaction("rw", bookTables(d), async () => {
        const branch = await getOrThrow(d.branches.get(input.branchId), "Branch");
        assertBranchAccess(actor, branch.id);
        if (await d.dayCloses.where("[branchId+date]").equals([branch.id, input.date]).first())
          throw new BusinessError(`${formatDate(input.date, "dd-MM-yyyy")} is already closed for ${branch.name}.`, "date");
        const accounts: DayClose["accounts"] = [];
        for (const c of input.counted) {
          const account = await getOrThrow(d.accounts.get(c.accountId), "Account");
          if (account.kind !== "cash" || account.branchId !== branch.id) throw new BusinessError(`${account.name} is not ${branch.name}'s cash.`, "counted");
          const rows = await d.ledgerEntries.where("accountId").equals(account.id).toArray();
          const systemPaise = sumPaise(rows.filter((e) => e.date <= input.date).map(signed));
          accounts.push({ accountId: account.id, systemPaise, countedPaise: c.countedPaise });
        }
        const ts = now();
        const close: DayClose = {
          id: newId(),
          branchId: branch.id,
          date: input.date,
          accounts,
          differencePaise: sumPaise(accounts.map((a) => a.countedPaise - a.systemPaise)),
          notes: input.notes,
          closedBy: actor.id,
          createdAt: ts,
          updatedAt: ts,
        };
        await d.dayCloses.add(close);
        await log(d, actor, {
          entityType: "day_close",
          entityId: close.id,
          action: "day.closed",
          description: `Closed ${formatDate(close.date, "dd-MM-yyyy")} for ${branch.name}${close.differencePaise ? ` — cash ${close.differencePaise > 0 ? "over" : "short"} by ${formatINR(Math.abs(close.differencePaise))}` : " — cash matched"}`,
          href: `/accounts/day-book?date=${close.date}`,
          metadata: { financial: [{ label: "Counted − system cash", after: close.differencePaise }] },
        });
        return close.id;
      });
    },

    async reopenDay(actor, dayCloseId, reason) {
      if (actor.role !== "admin") throw new BusinessError("Only an Admin can reopen a closed day.");
      if (reason.trim().length < 5) throw new BusinessError("Please give a reason (at least 5 characters).", "reason");
      const d = db();
      await d.transaction("rw", [d.dayCloses, d.branches, d.activity], async () => {
        const close = await getOrThrow(d.dayCloses.get(dayCloseId), "Closed day");
        const branch = await d.branches.get(close.branchId);
        await d.dayCloses.delete(dayCloseId);
        await log(d, actor, {
          entityType: "day_close",
          entityId: dayCloseId,
          action: "day.reopened",
          description: `Reopened ${formatDate(close.date, "dd-MM-yyyy")} for ${branch?.name ?? "branch"}`,
          href: `/accounts/day-book?date=${close.date}`,
          metadata: { changes: [{ field: "Reason", after: reason.trim() }] },
        });
      });
    },

    async uploadDocument(actor, rawMeta, file, fileName) {
      authorize(actor, "documents.manage");
      const meta = parse(documentMetaSchema, rawMeta);
      if (!isAcceptedDocumentType(file.type)) throw new BusinessError("Upload a PDF, JPEG, PNG or WebP file.");
      if (file.size > R2_MAX_OBJECT_BYTES) throw new BusinessError(`Files must be under ${R2_MAX_OBJECT_BYTES / 1024 / 1024} MB.`);
      const d = db();
      const owner = await documentOwner(d, meta.ownerType, meta.ownerId);
      const id = newId();
      const storageKey = await requirePhotoStorage(remote).put(documentObjectKey(meta.ownerId, id, file.type), file);
      try {
        return await d.transaction("rw", [d.documents, d.activity], async () => {
          const ts = now();
          const doc: StoredDocument = {
            id,
            ownerType: meta.ownerType,
            ownerId: meta.ownerId,
            vehicleId: owner.vehicleId,
            kind: meta.kind,
            title: meta.title || DOCUMENT_KIND_LABELS[meta.kind],
            fileName: fileName.slice(0, 120),
            storageKey,
            mimeType: file.type,
            size: file.size,
            uploadedBy: actor.id,
            createdAt: ts,
            updatedAt: ts,
          };
          await d.documents.add(doc);
          await log(d, actor, {
            entityType: "document",
            entityId: id,
            action: "document.uploaded",
            description: `Uploaded ${doc.title.toLowerCase()} for ${owner.label}`,
            href: owner.href,
          });
          return id;
        });
      } catch (error) {
        await remote?.remove([storageKey]).catch((e) => console.error("Could not clean up uploaded document", e));
        throw error;
      }
    },

    async removeDocument(actor, documentId) {
      authorize(actor, "documents.manage");
      const d = db();
      const removed = await d.transaction("rw", [d.documents, d.vehicles, d.purchases, d.sales, d.activity], async () => {
        const doc = await getOrThrow(d.documents.get(documentId), "Document");
        const owner = await documentOwner(d, doc.ownerType, doc.ownerId).catch(() => ({ label: "a deleted record", href: null }));
        await d.documents.delete(documentId);
        await log(d, actor, {
          entityType: "document",
          entityId: documentId,
          action: "document.removed",
          description: `Removed ${doc.title.toLowerCase()} (${doc.fileName}) from ${owner.label}`,
          href: owner.href,
        });
        return doc;
      });
      if (remote) await remote.remove([removed.storageKey]).catch((e) => console.error("Could not delete document from R2", e));
    },

    async createUser(actor, rawInput, id) {
      authorize(actor, "users.manage");
      const input = parse(userSchema, rawInput);
      const d = db();
      return d.transaction("rw", [d.users, d.branches, d.activity], async () => {
        const clash = await d.users.where("email").equals(input.email).first();
        if (clash) throw new BusinessError("A user with this email already exists.", "email");
        const ts = now();
        const user: User = {
          id: id ?? newId(),
          ...input,
          designation: input.designation ?? "",
          permissions: normalizeAccess(input.role, input.permissions),
          branchId: input.branchId ?? (await d.branches.toCollection().first())?.id ?? MAIN_BRANCH_ID,
          allBranches: input.allBranches ?? null,
          createdAt: ts,
          updatedAt: ts,
        };
        await d.users.add(user);
        await log(d, actor, {
          entityType: "user",
          entityId: user.id,
          action: "user.created",
          description: `Added ${user.name} as ${ROLE_LABELS[user.role]}${user.permissions ? " with custom access" : ""}`,
          href: "/staff",
        });
        return user.id;
      });
    },

    async updateUser(actor, userId, rawInput) {
      authorize(actor, "users.manage");
      const input = parse(userSchema, rawInput);
      const d = db();
      await d.transaction("rw", [d.users, d.activity], async () => {
        const user = await getOrThrow(d.users.get(userId), "User");
        const clash = await d.users.where("email").equals(input.email).first();
        if (clash && clash.id !== userId) throw new BusinessError("A user with this email already exists.", "email");
        const users = await d.users.toArray();
        const activeAdmins = users.filter((u) => u.role === "admin" && u.status === "active");
        const losesAdmin = user.role === "admin" && user.status === "active" && (input.role !== "admin" || input.status !== "active");
        if (losesAdmin && activeAdmins.length <= 1)
          throw new BusinessError("At least one active Admin / Owner account is required.");
        if (userId === actor.id && input.status !== "active")
          throw new BusinessError("You cannot deactivate your own account.", "status");
        const kept = input.role === user.role ? [...permissionsFor(user)] : null;
        const permissions = normalizeAccess(input.role, input.permissions === undefined ? (user.permissions ? kept : null) : input.permissions);
        const designation = input.designation ?? user.designation ?? "";
        await d.users.update(userId, {
          ...input,
          designation,
          permissions,
          branchId: input.branchId === undefined ? user.branchId ?? null : input.branchId,
          allBranches: input.allBranches === undefined ? user.allBranches ?? null : input.allBranches,
          updatedAt: now(),
        });
        const before = [...permissionsFor(user)].sort().join();
        const after = [...permissionsFor({ role: input.role, permissions })].sort().join();
        if (input.role === user.role && before !== after)
          await log(d, actor, {
            entityType: "user",
            entityId: userId,
            action: "user.access_changed",
            description: permissions ? `Customised ${user.name}'s access` : `Reset ${user.name}'s access to ${ROLE_LABELS[input.role]} defaults`,
            href: "/staff",
          });
        if (input.role !== user.role)
          await log(d, actor, {
            entityType: "user",
            entityId: userId,
            action: "user.role_changed",
            description: `Changed ${user.name}'s role from ${ROLE_LABELS[user.role]} to ${ROLE_LABELS[input.role]}`,
            href: "/staff",
          });
        if (input.status !== user.status)
          await log(d, actor, {
            entityType: "user",
            entityId: userId,
            action: "user.status_changed",
            description: `${input.status === "active" ? "Reactivated" : "Deactivated"} ${user.name}`,
            href: "/staff",
          });
        if (input.name !== user.name || input.email !== user.email || input.phone !== user.phone || designation !== (user.designation ?? ""))
          await log(d, actor, {
            entityType: "user",
            entityId: userId,
            action: "user.updated",
            description: `Updated profile of ${input.name}`,
            href: "/staff",
          });
      });
    },

    async updateSettings(actor, rawInput) {
      authorize(actor, "settings.manage");
      const input = parse(settingsSchema, rawInput);
      const d = db();
      await d.transaction("rw", [d.settings, d.activity], async () => {
        const current = await getOrThrow(d.settings.get("business"), "Settings");
        await d.settings.put({ ...current, ...input, updatedAt: now() });
        await log(d, actor, {
          entityType: "settings",
          entityId: "business",
          action: "settings.updated",
          description: "Updated showroom settings",
          href: "/settings",
        });
      });
    },

    async setDesignations(actor, designations) {
      authorize(actor, "users.manage");
      const list = [...new Set(designations.map((x) => x.trim()).filter(Boolean))];
      if (list.some((x) => x.length > 60)) throw new BusinessError("Keep each designation under 60 characters.");
      const d = db();
      await d.transaction("rw", [d.settings, d.activity], async () => {
        const current = await getOrThrow(d.settings.get("business"), "Settings");
        await d.settings.put({ ...current, designations: list, updatedAt: now() });
        await log(d, actor, {
          entityType: "settings",
          entityId: "business",
          action: "settings.updated",
          description: "Updated staff designations",
          href: "/staff",
        });
      });
    },

    async setInvoiceTemplate(actor, template) {
      authorize(actor, "settings.manage");
      if (!INVOICE_TEMPLATES.includes(template)) throw new BusinessError("Unknown invoice template.");
      const d = db();
      await d.transaction("rw", [d.settings, d.activity], async () => {
        const current = await getOrThrow(d.settings.get("business"), "Settings");
        if (current.invoiceTemplate === template) return;
        await d.settings.put({ ...current, invoiceTemplate: template, updatedAt: now() });
        await log(d, actor, {
          entityType: "settings",
          entityId: "business",
          action: "settings.updated",
          description: `Changed the invoice template to ${template}`,
          href: "/settings",
        });
      });
    },

    async setLogo(actor, logo) {
      authorize(actor, "settings.manage");
      const d = db();
      const before = await getOrThrow(d.settings.get("business"), "Settings");
      let uploadedKey: string | null = null;
      if (logo) uploadedKey = await requirePhotoStorage(remote).put(logoObjectKey(newId()), logo);
      try {
        await d.transaction("rw", [d.settings, d.imageBlobs, d.activity], async () => {
          const current = await getOrThrow(d.settings.get("business"), "Settings");
          if (current.logoKey && !isR2Key(current.logoKey)) await d.imageBlobs.delete(current.logoKey);
          await d.settings.put({ ...current, logoKey: uploadedKey, updatedAt: now() });
          await log(d, actor, {
            entityType: "settings",
            entityId: "business",
            action: "settings.updated",
            description: logo ? "Updated showroom logo" : "Removed showroom logo",
            href: "/settings",
          });
        });
      } catch (error) {
        if (uploadedKey) await remote?.remove([uploadedKey]).catch((e) => console.error("Could not clean up uploaded logo", e));
        throw error;
      }
      if (before.logoKey && isR2Key(before.logoKey) && before.logoKey !== uploadedKey)
        await remote?.remove([before.logoKey]).catch((e) => console.error("Could not delete the previous logo from R2", e));
    },
  };
}

/** Purchase balance helper re-exported for convenience in UI. */
export { purchaseBalance };

export const dealerService = createDealerService();
