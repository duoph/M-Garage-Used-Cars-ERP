import Dexie, { type EntityTable } from "dexie";
import type {
  ActivityLog,
  BusinessSettings,
  Counter,
  Customer,
  Expense,
  ImageBlobRecord,
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
} from "@/types";

/**
 * Browser persistence for the Phase 1 demo (IndexedDB via Dexie).
 * Images are stored as Blobs in `imageBlobs`, never as base64 in localStorage.
 * Swap this for D1/PostgreSQL + R2 by implementing the contracts in `lib/repositories`.
 */
export class DealerDatabase extends Dexie {
  users!: EntityTable<User, "id">;
  vehicles!: EntityTable<Vehicle, "id">;
  purchases!: EntityTable<Purchase, "id">;
  vehicleImages!: EntityTable<VehicleImage, "id">;
  imageBlobs!: EntityTable<ImageBlobRecord, "key">;
  customers!: EntityTable<Customer, "id">;
  reservations!: EntityTable<Reservation, "id">;
  sales!: EntityTable<Sale, "id">;
  salePayments!: EntityTable<SalePayment, "id">;
  expenses!: EntityTable<Expense, "id">;
  accounts!: EntityTable<MoneyAccount, "id">;
  vouchers!: EntityTable<Voucher, "id">;
  documents!: EntityTable<StoredDocument, "id">;
  activity!: EntityTable<ActivityLog, "id">;
  settings!: EntityTable<BusinessSettings, "id">;
  counters!: EntityTable<Counter, "key">;
  meta!: EntityTable<{ key: string; value: string }, "key">;

  constructor(name = "dealeros") {
    super(name);
    this.version(1).stores({
      users: "id, email, role, status",
      vehicles: "id, purchaseId, status, registrationNumber, chassisNumber, createdAt",
      purchases: "id, vehicleId, purchaseDate, status, reference",
      vehicleImages: "id, vehicleId, order",
      imageBlobs: "key",
      customers: "id, phone",
      reservations: "id, vehicleId, customerId, status",
      sales: "id, vehicleId, customerId, saleDate, status, reference",
      salePayments: "id, saleId, date",
      expenses: "id, vehicleId, date, category",
      activity: "id, timestamp, entityId, actorId",
      settings: "id",
      counters: "key",
      meta: "key",
    });
    this.version(2).stores({ quotes: "id, vehicleId, status, quoteDate, reference" });
    // Quotes were removed from the app; v3 drops the table and its data.
    this.version(3).stores({ quotes: null });
    this.version(4).stores({
      accounts: "id, kind",
      vouchers: "id, type, date, accountId, toAccountId, purchaseId, saleId, status, number",
      documents: "id, [ownerType+ownerId], vehicleId, kind",
    });
  }
}

let instance: DealerDatabase | null = null;

export function getDb(): DealerDatabase {
  if (!instance) instance = new DealerDatabase();
  return instance;
}

/** Test hook: use an isolated database instance. */
export function setDb(db: DealerDatabase) {
  instance = db;
}

export const DATA_TABLES = [
  "users",
  "vehicles",
  "purchases",
  "vehicleImages",
  "customers",
  "reservations",
  "sales",
  "salePayments",
  "expenses",
  "accounts",
  "vouchers",
  "documents",
  "activity",
  "settings",
  "counters",
] as const;
export type DataTableName = (typeof DATA_TABLES)[number];
