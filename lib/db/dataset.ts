import type { DealerDatabase } from "@/lib/db/database";
import { emptyDataset, type Dataset } from "@/lib/calculations/selectors";
import { defaultSettings } from "@/lib/db/bootstrap";
import { compareEntries } from "@/lib/calculations/ledger";

/** Tables the posting rules read. Money commands open their transaction over these (plus their own). */
export function bookTables(db: DealerDatabase) {
  return [
    db.accounts, db.branches, db.vehicles, db.purchases, db.purchasePayments, db.customers, db.reservations, db.sales,
    db.salePayments, db.expenses, db.vouchers, db.salesReturns, db.purchaseReturns, db.returnRefunds, db.ledgerEntries,
    db.dayCloses, db.settings, db.counters, db.activity, db.users,
  ];
}

/** Just what the posting rules need: no photos, documents or activity. Must run inside a transaction over `bookTables`. */
export async function readBooks(db: DealerDatabase): Promise<Dataset> {
  const [accounts, branches, vehicles, purchases, purchasePayments, customers, reservations, sales, payments, expenses, vouchers, salesReturns, purchaseReturns, refunds, dayCloses, settings] =
    await Promise.all([
      db.accounts.toArray(), db.branches.toArray(), db.vehicles.toArray(), db.purchases.toArray(), db.purchasePayments.toArray(),
      db.customers.toArray(), db.reservations.toArray(), db.sales.toArray(), db.salePayments.toArray(), db.expenses.toArray(),
      db.vouchers.toArray(), db.salesReturns.toArray(), db.purchaseReturns.toArray(), db.returnRefunds.toArray(), db.dayCloses.toArray(),
      db.settings.get("business"),
    ]);
  return {
    ...emptyDataset(settings ?? defaultSettings()),
    accounts, branches, vehicles, purchases, purchasePayments, customers, reservations, sales, payments, expenses, vouchers,
    salesReturns, purchaseReturns, refunds, dayCloses,
  };
}

/** The full snapshot every screen derives from. Returns null before the showroom is set up. */
export async function readDataset(db: DealerDatabase): Promise<Dataset | null> {
  return db.transaction(
    "r",
    [...bookTables(db), db.vehicleImages, db.documents],
    async () => {
      const [books, users, images, documents, activity, ledger, settings] = await Promise.all([
        readBooks(db),
        db.users.toArray(),
        db.vehicleImages.toArray(),
        db.documents.toArray(),
        db.activity.orderBy("timestamp").reverse().toArray(),
        db.ledgerEntries.toArray(),
        db.settings.get("business"),
      ]);
      if (!settings) return null;
      return { ...books, users, images, documents, activity, ledger: ledger.sort(compareEntries), settings };
    },
  );
}
