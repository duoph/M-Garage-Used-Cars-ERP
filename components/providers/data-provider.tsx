"use client";
import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/database";
import { ensureSeeded, upgradeDemoPhotos } from "@/lib/db/seed";
import { indexDataset, type Dataset, type DatasetIndex } from "@/lib/calculations/selectors";
import { setPreferredDateFormat } from "@/lib/utils/dates";
import { BootScreen } from "@/components/shared/boot-screen";

interface DataContextValue {
  ds: Dataset;
  idx: DatasetIndex;
  /** Forces a fresh read from IndexedDB (data is otherwise live-updating). */
  reload: () => void;
}

const DataContext = React.createContext<DataContextValue | null>(null);

let seedPromise: Promise<boolean> | null = null;
function seedOnce() {
  seedPromise ??= ensureSeeded(getDb()).then((seeded) => {
    // Non-blocking: swap old placeholder demo images for the bundled real photos.
    upgradeDemoPhotos(getDb()).catch((e: unknown) => console.warn("Demo photo upgrade skipped", e));
    return seeded;
  });
  return seedPromise;
}

async function loadDataset(): Promise<Dataset | null> {
  const db = getDb();
  return db.transaction(
    "r",
    [db.users, db.vehicles, db.purchases, db.vehicleImages, db.customers, db.reservations, db.sales, db.salePayments, db.expenses, db.activity, db.settings],
    async () => {
      const [users, vehicles, purchases, images, customers, reservations, sales, payments, expenses, activity, settings] = await Promise.all([
        db.users.toArray(),
        db.vehicles.toArray(),
        db.purchases.toArray(),
        db.vehicleImages.toArray(),
        db.customers.toArray(),
        db.reservations.toArray(),
        db.sales.toArray(),
        db.salePayments.toArray(),
        db.expenses.toArray(),
        db.activity.orderBy("timestamp").reverse().toArray(),
        db.settings.get("business"),
      ]);
      if (!settings) return null;
      return { users, vehicles, purchases, images, customers, reservations, sales, payments, expenses, activity, settings };
    },
  );
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [seeded, setSeeded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    seedOnce()
      .then(() => setSeeded(true))
      .catch((e: unknown) => {
        console.error(e);
        setError(
          "DealerOS could not open its local database. Private browsing modes or blocked site storage can prevent IndexedDB from working.",
        );
      });
  }, []);

  const [nonce, setNonce] = React.useState(0);
  const ds = useLiveQuery(() => (seeded ? loadDataset() : Promise.resolve(undefined)), [seeded, nonce]);
  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  const value = React.useMemo(() => (ds ? { ds, idx: indexDataset(ds), reload } : null), [ds, reload]);

  React.useEffect(() => {
    if (ds) setPreferredDateFormat(ds.settings.dateFormat);
  }, [ds]);

  if (error) return <BootScreen error={error} />;
  if (!value) return <BootScreen />;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = React.useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}
