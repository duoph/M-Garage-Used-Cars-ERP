import type { DealerDatabase } from "@/lib/db/database";
import { getDb } from "@/lib/db/database";
import { can, type Permission } from "@/lib/permissions";
import {
  BusinessError,
  type CreatePurchaseResult,
  type DealerCommands,
  type PreparedPhoto,
  type RemoteImageStorage,
} from "@/lib/repositories/contracts";
import { r2Enabled, r2ImageStorage } from "@/lib/images/r2-storage";
import { toR2Key, vehiclePhotoObjectKeys } from "@/lib/images/r2-keys";
import {
  canCancelPurchase,
  canCancelReservation,
  canCancelSale,
  canReserve,
  canSell,
  statusAfterSaleCancellation,
} from "@/lib/calculations/state";
import { purchaseBalance, saleTotals, validatePayment } from "@/lib/calculations/finance";
import {
  expenseSchema,
  makePaymentSchema,
  makeSaleSchema,
  purchaseEditSchema,
  purchaseFormSchema,
  quoteSchema,
  reservationSchema,
  settingsSchema,
  userSchema,
  vehicleEditSchema,
} from "@/lib/validation/schemas";
import { formatReference, formatRegistration, newId, normalizeChassis, normalizeRegistration } from "@/lib/utils/ids";
import { formatINR } from "@/lib/utils/money";
import { EXPENSE_CATEGORY_LABELS, ROLE_LABELS, vehicleTitle } from "@/lib/utils/labels";
import type {
  ActivityLog,
  ActivityMetadata,
  Customer,
  Expense,
  ID,
  Purchase,
  Quote,
  Reservation,
  Sale,
  SalePayment,
  User,
  Vehicle,
  VehicleImage,
} from "@/types";

type Db = DealerDatabase;

function authorize(actor: User, permission: Permission) {
  if (actor.status !== "active") throw new BusinessError("Your account is inactive.");
  if (!can(actor.role, permission)) throw new BusinessError("You do not have permission to perform this action.");
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
  for (const [i, p] of photos.entries()) {
    const remote = uploaded?.[i];
    const id = remote?.id ?? newId();
    const storageKey = remote?.storageKey ?? `vehicles/${vehicleId}/${id}`;
    const thumbKey = remote?.thumbKey ?? `${storageKey}/thumb`;
    if (!remote)
      await db.imageBlobs.bulkPut([
        { key: storageKey, blob: p.full, size: p.full.size, mimeType: p.mimeType, createdAt: ts },
        { key: thumbKey, blob: p.thumb, size: p.thumb.size, mimeType: p.mimeType, createdAt: ts },
      ]);
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

async function getOrThrow<T>(promise: Promise<T | undefined>, what: string): Promise<T> {
  const v = await promise;
  if (!v) throw new BusinessError(`${what} could not be found.`);
  return v;
}

/** `remote` is where new photos are uploaded; null keeps them in IndexedDB (the default when R2 isn't configured). */
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
      const uploaded = remote && photos.length ? await uploadPhotos(remote, vehicleId, photos) : undefined;
      try {
        return await d.transaction(
          "rw",
          [d.vehicles, d.purchases, d.vehicleImages, d.imageBlobs, d.counters, d.activity],
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
              amountPaidPaise: input.amountPaidPaise,
              paymentMethod: input.paymentMethod,
              paymentReference: input.paymentReference,
              notes: input.purchaseNotes,
              status: "active",
              createdBy: actor.id,
              cancelledAt: null,
              cancelReason: "",
              createdAt: ts,
              updatedAt: ts,
            };
            await d.purchases.add(purchase);
            await d.vehicles.add(vehicle);
            if (photos.length) {
              const images = await storePhotos(d, vehicleId, photos, 0, false, uploaded);
              await d.vehicles.update(vehicleId, { coverImageId: images.find((i) => i.isCover)?.id ?? images[0].id });
            }
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
      await d.transaction("rw", [d.purchases, d.vehicles, d.activity], async () => {
        const purchase = await getOrThrow(d.purchases.get(purchaseId), "Purchase");
        if (purchase.status === "cancelled") throw new BusinessError("Cancelled purchases cannot be edited.");
        const vehicle = await d.vehicles.get(purchase.vehicleId);
        const financialChange =
          input.purchasePricePaise !== purchase.purchasePricePaise || input.amountPaidPaise !== purchase.amountPaidPaise;
        if (vehicle?.status === "sold" && financialChange) {
          if (actor.role !== "admin")
            throw new BusinessError("This vehicle has been sold. Only an Admin can correct its purchase figures.");
          if (!correctionReason || correctionReason.trim().length < 5)
            throw new BusinessError("Provide a correction reason for changing a sold vehicle's purchase figures.");
        }
        await d.purchases.update(purchaseId, {
          ...input,
          sellerContact: input.sellerContact.replace(/[\s-]/g, ""),
          updatedAt: now(),
        });
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
      await d.transaction("rw", [d.purchases, d.vehicles, d.activity], async () => {
        const purchase = await getOrThrow(d.purchases.get(purchaseId), "Purchase");
        if (purchase.status === "cancelled") throw new BusinessError("This purchase is already cancelled.");
        const vehicle = await d.vehicles.get(purchase.vehicleId);
        const check = canCancelPurchase(vehicle);
        if (!check.ok) throw new BusinessError(check.message);
        const ts = now();
        await d.purchases.update(purchaseId, { status: "cancelled", cancelledAt: ts, cancelReason: reason.trim(), updatedAt: ts });
        if (vehicle) await d.vehicles.update(vehicle.id, { archivedAt: ts, updatedAt: ts });
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
      const uploaded = remote ? await uploadPhotos(remote, vehicleId, photos) : undefined;
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
      return d.transaction("rw", [d.vehicles, d.reservations, d.customers, d.counters, d.activity], async () => {
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
      await d.transaction("rw", [d.vehicles, d.reservations, d.customers, d.activity], async () => {
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
      return d.transaction(
        "rw",
        [d.vehicles, d.reservations, d.customers, d.sales, d.salePayments, d.quotes, d.counters, d.activity],
        async () => {
          const pre = rawInput as { reservationId?: string | null };
          const reservation = pre.reservationId ? await d.reservations.get(pre.reservationId) : undefined;
          const bookingPaise = reservation?.status === "active" ? reservation.bookingAmountPaise : 0;
          const input = parse(makeSaleSchema(bookingPaise), rawInput);
          const vehicle = await getOrThrow(d.vehicles.get(input.vehicleId), "Vehicle");
          const activeReservation =
            (await d.reservations.where("vehicleId").equals(vehicle.id).filter((r) => r.status === "active").first()) ?? null;
          const existingSale =
            (await d.sales.where("vehicleId").equals(vehicle.id).filter((s) => s.status === "completed").first()) ?? null;
          const check = canSell(vehicle, activeReservation, input.reservationId, existingSale);
          if (!check.ok) throw new BusinessError(check.message);

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
          if (input.amountReceivedPaise > 0) {
            payments.push({
              id: newId(),
              saleId: sale.id,
              receiptNumber: await nextReference(d, "RCT"),
              amountPaise: input.amountReceivedPaise,
              date: input.saleDate,
              method: input.paymentMethod,
              reference: input.paymentReference,
              notes: "Payment at sale",
              kind: "payment",
              recordedBy: actor.id,
              createdAt: ts,
              updatedAt: ts,
            });
          }
          if (payments.length) await d.salePayments.bulkAdd(payments);
          if (activeReservation)
            await d.reservations.update(activeReservation.id, { status: "converted", saleId: sale.id, updatedAt: ts });
          await d.vehicles.update(vehicle.id, { status: "sold", updatedAt: ts });
          if (input.quoteId) {
            const quote = await d.quotes.get(input.quoteId);
            if (quote && quote.vehicleId === vehicle.id && quote.status !== "accepted")
              await d.quotes.update(quote.id, { status: "accepted", saleId: sale.id, updatedAt: ts });
          }
          await log(d, actor, {
            entityType: "sale",
            entityId: sale.id,
            action: "sale.completed",
            description: `Sold ${vehicleTitle(vehicle)} (${vehicle.registrationNumber}) to ${customer.name} for ${formatINR(sale.salePricePaise)}`,
            href: `/sales/${sale.id}`,
          });
          return sale.id;
        },
      );
    },

    async cancelSale(actor, saleId, reason) {
      authorize(actor, "sales.cancel");
      if (reason.trim().length < 5) throw new BusinessError("Please give a reason (at least 5 characters).", "reason");
      const d = db();
      await d.transaction("rw", [d.sales, d.vehicles, d.activity], async () => {
        const sale = await getOrThrow(d.sales.get(saleId), "Sale");
        const check = canCancelSale(sale);
        if (!check.ok) throw new BusinessError(check.message);
        const vehicle = await getOrThrow(d.vehicles.get(sale.vehicleId), "Vehicle");
        const ts = now();
        await d.sales.update(saleId, { status: "cancelled", cancelledAt: ts, cancelReason: reason.trim(), updatedAt: ts });
        // Only restore stock if the vehicle is still marked sold by this sale.
        if (vehicle.status === "sold" && !vehicle.archivedAt)
          await d.vehicles.update(vehicle.id, { status: statusAfterSaleCancellation(), updatedAt: ts });
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
      return d.transaction("rw", [d.sales, d.salePayments, d.customers, d.counters, d.activity], async () => {
        const sale = await getOrThrow(d.sales.get(saleId), "Sale");
        const payments = await d.salePayments.where("saleId").equals(saleId).toArray();
        const totals = saleTotals(sale, payments);
        const input = parse(makePaymentSchema(totals.balancePaise), rawInput);
        const check = validatePayment(input.amountPaise, totals.balancePaise, sale.status);
        if (!check.ok) throw new BusinessError(check.message, "amountPaise");
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
          createdAt: ts,
          updatedAt: ts,
        };
        await d.salePayments.add(payment);
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

    async createQuote(actor, rawInput) {
      authorize(actor, "sales.create");
      const input = parse(quoteSchema, rawInput);
      const d = db();
      return d.transaction("rw", [d.quotes, d.vehicles, d.counters, d.activity], async () => {
        const vehicle = await getOrThrow(d.vehicles.get(input.vehicleId), "Vehicle");
        if (vehicle.archivedAt || vehicle.status === "sold") throw new BusinessError("This vehicle is no longer in stock.", "vehicleId");
        if (vehicle.status === "reserved") throw new BusinessError("This vehicle is reserved for another buyer.", "vehicleId");
        const ts = now();
        const quote: Quote = {
          id: newId(),
          reference: await nextReference(d, "QUO"),
          ...input,
          customerPhone: input.customerPhone.replace(/[\s-]/g, ""),
          status: "open",
          saleId: null,
          createdBy: actor.id,
          createdAt: ts,
          updatedAt: ts,
        };
        await d.quotes.add(quote);
        await log(d, actor, {
          entityType: "quote",
          entityId: quote.id,
          action: "quote.created",
          description: `Quoted ${vehicleTitle(vehicle)} (${vehicle.registrationNumber}) to ${quote.customerName}`,
          href: `/quote/${quote.id}`,
        });
        return quote.id;
      });
    },

    async updateQuote(actor, quoteId, rawInput) {
      authorize(actor, "sales.create");
      const input = parse(quoteSchema, rawInput);
      const d = db();
      await d.transaction("rw", [d.quotes, d.vehicles, d.activity], async () => {
        const quote = await getOrThrow(d.quotes.get(quoteId), "Quote");
        if (!can(actor.role, "sales.viewAll") && quote.createdBy !== actor.id)
          throw new BusinessError("You can only edit your own quotes.");
        if (quote.status === "accepted") throw new BusinessError("This quote has already turned into a sale.");
        const vehicle = await getOrThrow(d.vehicles.get(input.vehicleId), "Vehicle");
        await d.quotes.update(quoteId, { ...input, customerPhone: input.customerPhone.replace(/[\s-]/g, ""), updatedAt: now() });
        await log(d, actor, {
          entityType: "quote",
          entityId: quoteId,
          action: "quote.updated",
          description: `Updated quote ${quote.reference} for ${vehicleTitle(vehicle)}`,
          href: `/quote/${quoteId}`,
        });
      });
    },

    async setQuoteStatus(actor, quoteId, status) {
      authorize(actor, "sales.create");
      const d = db();
      await d.transaction("rw", [d.quotes, d.activity], async () => {
        const quote = await getOrThrow(d.quotes.get(quoteId), "Quote");
        if (!can(actor.role, "sales.viewAll") && quote.createdBy !== actor.id)
          throw new BusinessError("You can only change your own quotes.");
        if (quote.status === "accepted") throw new BusinessError("This quote has already turned into a sale.");
        if (quote.status === status) return;
        await d.quotes.update(quoteId, { status, updatedAt: now() });
        await log(d, actor, {
          entityType: "quote",
          entityId: quoteId,
          action: "quote.status_changed",
          description: `${status === "declined" ? "Marked as declined" : "Reopened"} quote ${quote.reference} for ${quote.customerName}`,
          href: `/quote/${quoteId}`,
        });
      });
    },

    async createExpense(actor, rawInput) {
      authorize(actor, "expenses.manage");
      const input = parse(expenseSchema, rawInput);
      const d = db();
      return d.transaction("rw", [d.expenses, d.vehicles, d.counters, d.activity], async () => {
        const vehicle = input.vehicleId ? await getOrThrow(d.vehicles.get(input.vehicleId), "Vehicle") : null;
        const ts = now();
        const expense: Expense = {
          id: newId(),
          reference: await nextReference(d, "EXP"),
          ...input,
          createdBy: actor.id,
          createdAt: ts,
          updatedAt: ts,
        };
        await d.expenses.add(expense);
        await log(d, actor, {
          entityType: "expense",
          entityId: expense.id,
          action: "expense.created",
          description: `Recorded ${EXPENSE_CATEGORY_LABELS[expense.category].toLowerCase()} expense${
            vehicle ? ` for ${vehicleTitle(vehicle)} (${vehicle.registrationNumber})` : ""
          }: ${expense.description}`,
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
      await d.transaction("rw", [d.expenses, d.vehicles, d.activity], async () => {
        const expense = await getOrThrow(d.expenses.get(expenseId), "Expense");
        if (input.vehicleId) await getOrThrow(d.vehicles.get(input.vehicleId), "Vehicle");
        await d.expenses.update(expenseId, { ...input, updatedAt: now() });
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
            changes:
              input.vehicleId !== expense.vehicleId
                ? [{ field: "Linked vehicle", before: expense.vehicleId ?? "None", after: input.vehicleId ?? "None" }]
                : undefined,
          },
        });
      });
    },

    async deleteExpense(actor, expenseId) {
      authorize(actor, "expenses.manage");
      const d = db();
      await d.transaction("rw", [d.expenses, d.activity], async () => {
        const expense = await getOrThrow(d.expenses.get(expenseId), "Expense");
        await d.expenses.delete(expenseId);
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

    async createUser(actor, rawInput) {
      authorize(actor, "users.manage");
      const input = parse(userSchema, rawInput);
      const d = db();
      return d.transaction("rw", [d.users, d.activity], async () => {
        const clash = await d.users.where("email").equals(input.email).first();
        if (clash) throw new BusinessError("A user with this email already exists.", "email");
        const ts = now();
        const user: User = { id: newId(), ...input, createdAt: ts, updatedAt: ts };
        await d.users.add(user);
        await log(d, actor, {
          entityType: "user",
          entityId: user.id,
          action: "user.created",
          description: `Added ${user.name} as ${ROLE_LABELS[user.role]}`,
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
        await d.users.update(userId, { ...input, updatedAt: now() });
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
        if (input.name !== user.name || input.email !== user.email || input.phone !== user.phone)
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

    async setLogo(actor, logo) {
      authorize(actor, "settings.manage");
      const d = db();
      await d.transaction("rw", [d.settings, d.imageBlobs, d.activity], async () => {
        const current = await getOrThrow(d.settings.get("business"), "Settings");
        if (current.logoKey) await d.imageBlobs.delete(current.logoKey);
        let logoKey: string | null = null;
        if (logo) {
          logoKey = `branding/logo-${newId()}`;
          await d.imageBlobs.put({ key: logoKey, blob: logo, size: logo.size, mimeType: logo.type, createdAt: now() });
        }
        await d.settings.put({ ...current, logoKey, updatedAt: now() });
        await log(d, actor, {
          entityType: "settings",
          entityId: "business",
          action: "settings.updated",
          description: logo ? "Updated showroom logo" : "Removed showroom logo",
          href: "/settings",
        });
      });
    },
  };
}

/** Purchase balance helper re-exported for convenience in UI. */
export { purchaseBalance };

export const dealerService = createDealerService();
