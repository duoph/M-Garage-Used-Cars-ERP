import type { DealerDatabase } from "@/lib/db/database";
import { readBooks } from "@/lib/db/dataset";
import { indexDataset } from "@/lib/calculations/selectors";
import { compareEntries, moneyEntries, signed } from "@/lib/calculations/ledger";
import { BusinessError } from "@/lib/repositories/contracts";
import { formatDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type { ID, ISODate, LedgerEntry } from "@/types";

const FIELDS: (keyof LedgerEntry)[] = [
  "source", "date", "createdAt", "accountId", "branchId", "direction", "amountPaise", "number", "typeLabel", "party",
  "particulars", "method", "handledBy", "enteredBy", "href", "voucherId", "transfer",
];
const MONEY_FIELDS: (keyof LedgerEntry)[] = ["date", "accountId", "branchId", "direction", "amountPaise"];

const differs = (a: LedgerEntry, b: LedgerEntry, fields: (keyof LedgerEntry)[]) => fields.some((f) => (a[f] ?? null) !== (b[f] ?? null));

/**
 * Posts the records' money movements into `ledgerEntries`. Must run inside the command's own transaction
 * (over `bookTables`), so a record and its ledger rows are saved together or not at all.
 *
 * Only changed rows are written. A change to the amount, account or date of a row on a closed day is
 * refused, so a counted day can't move under the cash that was counted. `rebuild` skips that check (used
 * by the one-time migration).
 */
export async function syncLedger(db: DealerDatabase, opts: { rebuild?: boolean } = {}): Promise<void> {
  const ds = await readBooks(db);
  const next = moneyEntries(ds, indexDataset(ds));
  const stored = await db.ledgerEntries.toArray();
  const storedByKey = new Map(stored.map((e) => [e.key, e]));
  const nextKeys = new Set(next.map((e) => e.key));
  const closed = new Set(ds.dayCloses.map((c) => `${c.branchId}|${c.date}`));
  const guard = (e: LedgerEntry) => {
    if (opts.rebuild || !e.branchId || !closed.has(`${e.branchId}|${e.date}`)) return;
    const branch = ds.branches.find((b) => b.id === e.branchId)?.name ?? "this branch";
    throw new BusinessError(`${formatDate(e.date, "dd-MM-yyyy")} is closed for ${branch}. Reopen the day before changing its entries.`);
  };

  const puts: LedgerEntry[] = [];
  for (const e of next) {
    const old = storedByKey.get(e.key);
    if (old && !differs(old, e, FIELDS)) continue;
    if (!old || differs(old, e, MONEY_FIELDS)) {
      guard(e);
      if (old) guard(old);
    }
    puts.push(e);
  }
  const removed = stored.filter((e) => !nextKeys.has(e.key));
  removed.forEach(guard);
  if (puts.length) await db.ledgerEntries.bulkPut(puts);
  if (removed.length) await db.ledgerEntries.bulkDelete(removed.map((e) => e.key));
}

/**
 * Refuses to let a cash account dip below zero on or after `fromDate`. Runs after `syncLedger`, so the
 * new entry is already counted.
 */
export async function assertCashNotNegative(db: DealerDatabase, accountId: ID, fromDate: ISODate): Promise<void> {
  const account = await db.accounts.get(accountId);
  if (!account || account.kind !== "cash") return;
  const rows = (await db.ledgerEntries.where("accountId").equals(accountId).toArray()).sort(compareEntries);
  let running = 0;
  let lowest: { date: ISODate; balance: number } | null = null;
  for (const e of rows) {
    running += signed(e);
    if (e.date >= fromDate && running < 0 && (!lowest || running < lowest.balance)) lowest = { date: e.date, balance: running };
  }
  if (lowest)
    throw new BusinessError(
      `${account.name} doesn't have enough cash: its balance would go to ${formatINR(lowest.balance)} on ${formatDate(lowest.date, "dd-MM-yyyy")}.`,
      "amountPaise",
    );
}
