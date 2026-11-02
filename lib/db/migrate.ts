import type { DealerDatabase } from "@/lib/db/database";
import { bookTables } from "@/lib/db/dataset";
import { initialPurchasePayment, resolveAccountId, sellerVoucherTotals } from "@/lib/calculations/ledger";
import { syncLedger } from "@/lib/services/ledger-posting";
import { newId } from "@/lib/utils/ids";
import type { Branch, MoneyAccount, PurchasePayment } from "@/types";

export const MAIN_BRANCH_ID = "br-main";
export const OWNER_ACCOUNT_ID = "acc-owner";

/** Bumped when the accounting data needs converting again. */
const ACCOUNTING_VERSION = "1";

export function mainBranch(): Branch {
  const ts = new Date().toISOString();
  return { id: MAIN_BRANCH_ID, name: "Main Branch", code: "MAIN", address: "", phone: "", archived: false, createdAt: ts, updatedAt: ts };
}

export function ownerAccount(): MoneyAccount {
  const ts = new Date().toISOString();
  return {
    id: OWNER_ACCOUNT_ID, name: "Owner", kind: "owner", bankName: "", accountNumber: "", ifsc: "", upiId: "", custodianId: null,
    openingBalancePaise: 0, openingDate: ts.slice(0, 10), isDefault: true, archived: false, notes: "Cash handed over to the owner", branchId: null,
    createdAt: ts, updatedAt: ts,
  };
}

/**
 * Brings a database up to the branch + stored-ledger model:
 * - creates the main branch and the owner account, and puts every existing record and cash drawer on that branch;
 * - turns each purchase's "paid at purchase" amount into a payment line from the account it was counted in;
 * - fills `ledgerEntries` from the records.
 *
 * Older expenses keep no "Paid from" account and show as Unassigned until edited. Safe to run repeatedly.
 */
export async function migrateAccounting(db: DealerDatabase): Promise<void> {
  const done = await db.meta.get("accountingVersion");
  if (done?.value === ACCOUNTING_VERSION) return;
  await db.transaction("rw", [...bookTables(db), db.meta], async () => {
    if ((await db.branches.count()) === 0) await db.branches.add(mainBranch());
    const branchId = (await db.branches.toCollection().first())!.id;
    const unbranched = <T extends { branchId?: string | null }>(rows: T[]) => rows.filter((r) => r.branchId === undefined);

    if (!(await db.accounts.get(OWNER_ACCOUNT_ID)) && !(await db.accounts.where("kind").equals("owner").count()))
      await db.accounts.add(ownerAccount());
    for (const a of unbranched(await db.accounts.toArray())) await db.accounts.update(a.id, { branchId: a.kind === "cash" ? branchId : null });
    for (const u of unbranched(await db.users.toArray())) await db.users.update(u.id, { branchId });
    for (const v of unbranched(await db.vehicles.toArray())) await db.vehicles.update(v.id, { branchId });
    for (const p of unbranched(await db.purchases.toArray())) await db.purchases.update(p.id, { branchId });
    for (const s of unbranched(await db.sales.toArray())) await db.sales.update(s.id, { branchId });
    for (const e of unbranched(await db.expenses.toArray())) await db.expenses.update(e.id, { branchId });
    for (const v of unbranched(await db.vouchers.toArray())) await db.vouchers.update(v.id, { branchId });

    const accounts = await db.accounts.toArray();
    const voucherTotals = sellerVoucherTotals(await db.vouchers.toArray());
    const lines: PurchasePayment[] = [];
    for (const p of await db.purchases.toArray()) {
      if ((await db.purchasePayments.where("purchaseId").equals(p.id).count()) > 0) continue;
      const amount = initialPurchasePayment(p, voucherTotals);
      if (amount <= 0) continue;
      lines.push({
        id: newId(),
        purchaseId: p.id,
        number: p.reference,
        date: p.purchaseDate,
        method: p.paymentMethod,
        amountPaise: amount,
        accountId: resolveAccountId(accounts, null, p.paymentMethod, p.branchId ?? branchId),
        reference: p.paymentReference,
        notes: "Paid at purchase",
        kind: "at_purchase",
        recordedBy: p.createdBy,
        createdAt: p.createdAt,
        updatedAt: p.createdAt,
      });
    }
    if (lines.length) await db.purchasePayments.bulkAdd(lines);

    await syncLedger(db, { rebuild: true });
    await db.meta.put({ key: "accountingVersion", value: ACCOUNTING_VERSION });
  });
}
