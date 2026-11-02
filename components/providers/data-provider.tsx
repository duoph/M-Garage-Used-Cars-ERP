"use client";
import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/database";
import { ensureInitialized } from "@/lib/db/bootstrap";
import { indexDataset, type Dataset, type DatasetIndex } from "@/lib/calculations/selectors";
import { scopeDataset } from "@/lib/calculations/branches";
import { readDataset } from "@/lib/db/dataset";
import { branchScope } from "@/lib/permissions";
import { useSessionStore } from "@/lib/store/session";
import type { MoneyAccount } from "@/types";
import { setPreferredDateFormat } from "@/lib/utils/dates";
import { BootScreen } from "@/components/shared/boot-screen";

interface DataContextValue {
  /** What the signed-in person may see: limited to their branch unless they see every branch. */
  ds: Dataset;
  idx: DatasetIndex;
  /** Every account in every branch, for picking the other side of a branch-to-branch transfer. */
  allAccounts: MoneyAccount[];
  /** Forces a fresh read from IndexedDB (data is otherwise live-updating). */
  reload: () => void;
}

const DataContext = React.createContext<DataContextValue | null>(null);

let initPromise: Promise<void> | null = null;
function initOnce() {
  initPromise ??= ensureInitialized(getDb());
  return initPromise;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [seeded, setSeeded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    initOnce()
      .then(() => setSeeded(true))
      .catch((e: unknown) => {
        console.error(e);
        setError(
          "M Garage could not open its local database. Private browsing modes or blocked site storage can prevent IndexedDB from working.",
        );
      });
  }, []);

  const [nonce, setNonce] = React.useState(0);
  const raw = useLiveQuery(() => (seeded ? readDataset(getDb()) : Promise.resolve(undefined)), [seeded, nonce]);
  const reload = React.useCallback(() => setNonce((n) => n + 1), []);
  const userId = useSessionStore((s) => s.userId);
  const user = raw?.users.find((u) => u.id === userId);
  const scopeKey = raw ? JSON.stringify(branchScope(user)) : "";

  const value = React.useMemo(() => {
    if (!raw) return null;
    const ds = scopeDataset(raw, JSON.parse(scopeKey) as string[] | null);
    return { ds, idx: indexDataset(ds), allAccounts: raw.accounts, reload };
  }, [raw, scopeKey, reload]);
  const ds = value?.ds;

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
