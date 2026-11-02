import { z } from "zod";
import type { DealerDatabase } from "@/lib/db/database";
import { defaultAccounts, markInitialized } from "@/lib/db/bootstrap";
import { migrateAccounting } from "@/lib/db/migrate";
import { newId } from "@/lib/utils/ids";
import { ACCOUNT_KINDS, ROLES, VEHICLE_STATUSES, type User } from "@/types";

/**
 * Local backup / restore for browser-stored data. Images travel as data URLs inside the JSON file.
 * Production backups must be handled server-side (database snapshots + object storage versioning).
 */

const BACKUP_VERSION = 1;

const row = z.object({ id: z.string().min(1) }).passthrough();
const backupSchema = z.object({
  app: z.literal("dealeros"),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  tables: z.object({
    users: z.array(row.extend({ name: z.string(), role: z.enum(ROLES), status: z.string() })).min(1),
    vehicles: z.array(row.extend({ registrationNumber: z.string(), status: z.enum(VEHICLE_STATUSES), askingPricePaise: z.number().int() })),
    purchases: z.array(row.extend({ vehicleId: z.string(), purchasePricePaise: z.number().int(), amountPaidPaise: z.number().int() })),
    vehicleImages: z.array(row.extend({ vehicleId: z.string(), storageKey: z.string(), thumbKey: z.string() })),
    customers: z.array(row),
    reservations: z.array(row.extend({ vehicleId: z.string(), customerId: z.string() })),
    sales: z.array(row.extend({ vehicleId: z.string(), salePricePaise: z.number().int(), status: z.enum(["completed", "cancelled"]) })),
    salePayments: z.array(row.extend({ saleId: z.string(), amountPaise: z.number().int() })),
    // Older backups may still carry a "quotes" table; it is ignored (quotes were removed).
    expenses: z.array(row.extend({ amountPaise: z.number().int(), category: z.string() })),
    // Added with accounting; older backups have none and get the default accounts.
    accounts: z.array(row.extend({ name: z.string(), kind: z.enum(ACCOUNT_KINDS) })).optional(),
    vouchers: z.array(row.extend({ accountId: z.string(), amountPaise: z.number().int() })).optional(),
    documents: z.array(row.extend({ storageKey: z.string() })).optional(),
    // Added with branches and returns. The ledger itself is not backed up: it is rebuilt from these records.
    branches: z.array(row.extend({ name: z.string() })).optional(),
    purchasePayments: z.array(row.extend({ purchaseId: z.string(), accountId: z.string(), amountPaise: z.number().int() })).optional(),
    salesReturns: z.array(row.extend({ saleId: z.string(), returnAmountPaise: z.number().int() })).optional(),
    purchaseReturns: z.array(row.extend({ purchaseId: z.string(), returnAmountPaise: z.number().int() })).optional(),
    returnRefunds: z.array(row.extend({ returnId: z.string(), accountId: z.string(), amountPaise: z.number().int() })).optional(),
    dayCloses: z.array(row.extend({ branchId: z.string(), date: z.string() })).optional(),
    activity: z.array(row),
    settings: z.array(row).length(1),
    counters: z.array(z.object({ key: z.string(), value: z.number().int() })),
  }),
  blobs: z.array(z.object({ key: z.string(), dataUrl: z.string().startsWith("data:"), mimeType: z.string() })),
});

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

export async function exportBackup(db: DealerDatabase): Promise<string> {
  const [users, vehicles, purchases, vehicleImages, customers, reservations, sales, salePayments, expenses, accounts, vouchers, documents, activity, settings, counters, blobRows] =
    await Promise.all([
      db.users.toArray(), db.vehicles.toArray(), db.purchases.toArray(), db.vehicleImages.toArray(), db.customers.toArray(),
      db.reservations.toArray(), db.sales.toArray(), db.salePayments.toArray(), db.expenses.toArray(), db.accounts.toArray(),
      db.vouchers.toArray(), db.documents.toArray(), db.activity.toArray(), db.settings.toArray(), db.counters.toArray(), db.imageBlobs.toArray(),
    ]);
  const [branches, purchasePayments, salesReturns, purchaseReturns, returnRefunds, dayCloses] = await Promise.all([
    db.branches.toArray(), db.purchasePayments.toArray(), db.salesReturns.toArray(), db.purchaseReturns.toArray(), db.returnRefunds.toArray(), db.dayCloses.toArray(),
  ]);
  const blobs = await Promise.all(
    blobRows.map(async (b) => ({ key: b.key, mimeType: b.mimeType, dataUrl: await blobToDataUrl(b.blob) })),
  );
  return JSON.stringify({
    app: "dealeros",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      users, vehicles, purchases, vehicleImages, customers, reservations, sales, salePayments, expenses, accounts, vouchers, documents, activity, settings, counters,
      branches, purchasePayments, salesReturns, purchaseReturns, returnRefunds, dayCloses,
    },
    blobs,
  });
}

export type ImportResult = { ok: true; counts: Record<string, number> } | { ok: false; message: string };

export async function importBackup(db: DealerDatabase, json: string, actor: User): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, message: "The selected file is not valid JSON." };
  }
  const result = backupSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, message: `This is not a valid M Garage backup (${issue.path.join(".") || "root"}: ${issue.message}).` };
  }
  const { tables, blobs } = result.data;

  // Referential checks before touching any data.
  const vehicleIds = new Set(tables.vehicles.map((v) => v.id));
  const saleIds = new Set(tables.sales.map((s) => s.id));
  if (tables.purchases.some((p) => !vehicleIds.has(p.vehicleId)))
    return { ok: false, message: "Backup is inconsistent: a purchase references a missing vehicle." };
  if (tables.salePayments.some((p) => !saleIds.has(p.saleId)))
    return { ok: false, message: "Backup is inconsistent: a payment references a missing sale." };
  if (!tables.users.some((u) => u.role === "admin" && u.status === "active"))
    return { ok: false, message: "Backup must contain at least one active Admin / Owner." };

  const blobRecords = await Promise.all(
    blobs.map(async (b) => {
      const blob = await dataUrlToBlob(b.dataUrl);
      return { key: b.key, blob, size: blob.size, mimeType: b.mimeType, createdAt: new Date().toISOString() };
    }),
  );

  /* eslint-disable @typescript-eslint/no-explicit-any -- validated above; Dexie tables accept the shapes as-is */
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.users.bulkAdd(tables.users as any);
    await db.vehicles.bulkAdd(tables.vehicles as any);
    await db.purchases.bulkAdd(tables.purchases as any);
    await db.vehicleImages.bulkAdd(tables.vehicleImages as any);
    await db.customers.bulkAdd(tables.customers as any);
    await db.reservations.bulkAdd(tables.reservations as any);
    await db.sales.bulkAdd(tables.sales as any);
    await db.salePayments.bulkAdd(tables.salePayments as any);
    await db.expenses.bulkAdd(tables.expenses as any);
    await db.accounts.bulkAdd((tables.accounts?.length ? tables.accounts : defaultAccounts()) as any);
    await db.vouchers.bulkAdd((tables.vouchers ?? []) as any);
    await db.documents.bulkAdd((tables.documents ?? []) as any);
    await db.branches.bulkAdd((tables.branches ?? []) as any);
    await db.purchasePayments.bulkAdd((tables.purchasePayments ?? []) as any);
    await db.salesReturns.bulkAdd((tables.salesReturns ?? []) as any);
    await db.purchaseReturns.bulkAdd((tables.purchaseReturns ?? []) as any);
    await db.returnRefunds.bulkAdd((tables.returnRefunds ?? []) as any);
    await db.dayCloses.bulkAdd((tables.dayCloses ?? []) as any);
    await db.activity.bulkAdd(tables.activity as any);
    await db.settings.bulkAdd(tables.settings as any);
    await db.counters.bulkAdd(tables.counters);
    await db.imageBlobs.bulkAdd(blobRecords);
    await db.meta.put({ key: "seededAt", value: new Date().toISOString() });
    // Without this, the next load would treat the restored data as the old demo and wipe it.
    await markInitialized(db);
    await db.activity.add({
      id: newId(), actorId: actor.id, entityType: "settings", entityId: "business", action: "data.imported",
      timestamp: new Date().toISOString(), description: "Restored data from a local backup file", href: null, metadata: {},
    });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  // Older backups gain the main branch and their payment lines; every backup gets its ledger rebuilt.
  await migrateAccounting(db);

  return {
    ok: true,
    counts: { vehicles: tables.vehicles.length, sales: tables.sales.length, expenses: tables.expenses.length, photos: tables.vehicleImages.length },
  };
}

/** Removes all business records but keeps staff accounts, branches, cash/bank accounts and showroom settings. */
export async function clearBusinessData(db: DealerDatabase, actor: User) {
  const cleared = [
    db.vehicles, db.purchases, db.vehicleImages, db.imageBlobs, db.customers, db.reservations, db.sales, db.salePayments, db.expenses, db.vouchers,
    db.documents, db.activity, db.counters, db.purchasePayments, db.salesReturns, db.purchaseReturns, db.returnRefunds, db.dayCloses,
  ];
  await db.transaction(
    "rw",
    [...cleared, db.settings, db.ledgerEntries, db.meta],
    async () => {
      const settings = await db.settings.get("business");
      const logoKey = settings?.logoKey;
      const logo = logoKey ? await db.imageBlobs.get(logoKey) : undefined;
      await Promise.all(cleared.map((t) => t.clear()));
      // Only opening balances remain; the migration step re-posts them.
      await db.ledgerEntries.clear();
      await db.meta.delete("accountingVersion");
      if (logo) await db.imageBlobs.put(logo);
      await db.activity.add({
        id: newId(), actorId: actor.id, entityType: "settings", entityId: "business", action: "data.reset",
        timestamp: new Date().toISOString(), description: "Cleared all business data", href: null, metadata: {},
      });
    },
  );
  await migrateAccounting(db);
}
