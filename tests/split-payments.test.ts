import { beforeEach, describe, expect, it } from "vitest";
import { DealerDatabase } from "@/lib/db/database";
import { ensureInitialized, OWNER_USER_ID } from "@/lib/db/bootstrap";
import { readBooks, readDataset } from "@/lib/db/dataset";
import { createDealerService } from "@/lib/services/dealer-service";
import { BusinessError, type DealerCommands } from "@/lib/repositories/contracts";
import { indexDataset } from "@/lib/calculations/selectors";
import { accountSummaries, moneyEntries } from "@/lib/calculations/ledger";
import { saleTotals } from "@/lib/calculations/finance";
import {
  balanceSummary,
  bankSummary,
  cashInHandReport,
  duesReport,
  paymentsReport,
  purchaseReport,
  purchaseReturnReport,
  salesReport,
  salesReturnReport,
} from "@/lib/calculations/reports";
import { todayISO } from "@/lib/utils/dates";
import type { PaymentLineInput, PurchaseFormInput } from "@/lib/validation/schemas";
import type { User } from "@/types";

const L = (lakhs: number) => Math.round(lakhs * 1_00_000) * 100;
const today = todayISO();
const range = { from: today, to: today };

let db: DealerDatabase;
let svc: DealerCommands;
let owner: User;

const line = (method: PaymentLineInput["method"], amountPaise: number, accountId: string | null, extra: Partial<PaymentLineInput> = {}): PaymentLineInput => ({
  method, amountPaise, accountId, reference: "", lenderName: "", loanReference: "", ...extra,
});

const car = (reg: string, chassis: string, price: number, payments: PaymentLineInput[]): PurchaseFormInput => ({
  make: "Maruti", model: "Swift", variant: "VXi", year: 2022, registrationNumber: reg, chassisNumber: chassis, engineNumber: "", fuelType: "petrol",
  transmission: "manual", mileageKm: 20000, color: "Red", previousOwners: 1, notes: "", sellerName: "Ravi Seller", sellerContact: "9847000011",
  sellerAddress: "", sellerNotes: "", purchaseDate: today, purchasePricePaise: price, amountPaidPaise: 0, askingPricePaise: L(7.5),
  paymentMethod: "bank_transfer", paymentReference: "", purchaseNotes: "", payments,
});

const buyer = { customerName: "Anand Pillai", customerPhone: "9000000001", customerAddress: "Kochi", customerNotes: "" };

async function books() {
  const ds = (await readDataset(db))!;
  return { ds, idx: indexDataset(ds) };
}
const balance = async (accountId: string) => {
  const { ds } = await books();
  return accountSummaries(ds.accounts, ds.ledger).find((s) => s.account.id === accountId)?.balancePaise ?? 0;
};

beforeEach(async () => {
  db = new DealerDatabase(`flow-${Math.random()}`);
  await ensureInitialized(db);
  svc = createDealerService(() => db, null);
  owner = (await db.users.get(OWNER_USER_ID))!;
  // Money already in the drawers before the test day.
  const cash = (await db.accounts.get("acc-cash"))!;
  const bank = (await db.accounts.get("acc-bank"))!;
  await svc.updateAccount(owner, cash.id, { ...cash, openingBalancePaise: L(5), openingDate: "2025-04-01" });
  await svc.updateAccount(owner, bank.id, { ...bank, openingBalancePaise: L(20), openingDate: "2025-04-01" });
});

describe("the client's test flow", () => {
  it("split sale → bank expense → sales return → purchase + purchase return, with every report agreeing", async () => {
    // Stock: a car bought for ₹6,00,000 paid from the bank.
    const { vehicleId } = await svc.createPurchase(owner, car("KL 07 AB 1234", "MA3SWIFT00000001", L(6), [line("bank_transfer", L(6), "acc-bank")]), []);

    // 1. Sell it for ₹7,00,000: ₹2,50,000 cash + ₹2,00,000 UPI + ₹2,50,000 loan.
    const saleId = await svc.completeSale(owner, {
      ...buyer, vehicleId, reservationId: null, saleDate: today, salePricePaise: L(7), notes: "",
      payments: [line("cash", L(2.5), "acc-cash"), line("upi", L(2), "acc-bank", { reference: "UPI123" }), line("finance", L(2.5), null, { lenderName: "HDFC Finance", loanReference: "LN-77" })],
    });
    let { ds, idx } = await books();
    const lender = ds.accounts.find((a) => a.kind === "finance" && a.name === "HDFC Finance")!;
    let t = saleTotals(idx.sales.get(saleId)!, idx.paymentsBySale.get(saleId)!);
    expect(t).toMatchObject({ receivedPaise: L(7), balancePaise: 0, financePendingPaise: L(2.5), paymentStatus: "paid" });
    expect(await balance("acc-cash")).toBe(L(5) + L(2.5));
    expect(await balance(lender.id)).toBe(L(2.5));
    // One receipt number for the three lines.
    expect(new Set(idx.paymentsBySale.get(saleId)!.map((p) => p.receiptNumber)).size).toBe(1);

    // 2. ₹60,000 maintenance paid from the bank.
    await svc.createExpense(owner, { category: "maintenance", amountPaise: L(0.6), date: today, description: "Workshop maintenance", vendor: "City Auto", paymentMethod: "bank_transfer", vehicleId: null, notes: "", accountId: "acc-bank", paymentReference: "UTR9" });
    expect(await balance("acc-bank")).toBe(L(20) - L(6) + L(2) - L(0.6));

    // 3. The buyer returns the car: ₹50,000 deduction, the pending loan is cancelled with the lender, the rest refunded in cash.
    ({ ds, idx } = await books());
    const loan = idx.paymentsBySale.get(saleId)!.find((p) => p.method === "finance")!;
    await expect(
      svc.createSalesReturn(owner, { saleId, date: today, returnAmountPaise: L(7) + 1, deductionPaise: L(0.5), vehicleReturned: true, financePaymentId: loan.id, financeAdjustmentPaise: L(2.5), reason: "Changed mind", notes: "", refunds: [] }),
    ).rejects.toThrow(/can still be returned/);
    const returnId = await svc.createSalesReturn(owner, {
      saleId, date: today, returnAmountPaise: L(7), deductionPaise: L(0.5), vehicleReturned: true, financePaymentId: loan.id, financeAdjustmentPaise: L(2.5),
      reason: "Changed mind", notes: "", refunds: [line("cash", L(4), "acc-cash")],
    });
    ({ ds, idx } = await books());
    const ret = ds.salesReturns.find((r) => r.id === returnId)!;
    expect(ret.number).toMatch(/^CN-\d{4}-\d{4}$/);
    expect(ret.refundDuePaise).toBe(L(4));
    expect(idx.sales.get(saleId)!.returnStatus).toBe("returned");
    expect(idx.vehicles.get(vehicleId)!.status).toBe("returned_inspection");
    t = saleTotals(idx.sales.get(saleId)!, idx.paymentsBySale.get(saleId)!);
    expect(t).toMatchObject({ netPricePaise: L(0.5), balancePaise: 0, refundDuePaise: 0, financePendingPaise: 0 });
    expect(await balance("acc-cash")).toBe(L(5) + L(2.5) - L(4));
    expect(await balance(lender.id)).toBe(0);
    // No second return on a car that came back; it goes back on sale after inspection.
    await expect(svc.createSalesReturn(owner, { saleId, date: today, returnAmountPaise: 100, deductionPaise: 0, vehicleReturned: false, financePaymentId: null, financeAdjustmentPaise: 0, reason: "Again", notes: "", refunds: [] })).rejects.toThrow(BusinessError);
    await svc.backToStock(owner, vehicleId);
    expect((await db.vehicles.get(vehicleId))!.status).toBe("available");

    // 4. Buy another car for ₹5,00,000 (₹2,00,000 cash + ₹3,00,000 bank) and send it back: ₹20,000 deduction, ₹4,80,000 refunded into the bank.
    const second = await svc.createPurchase(owner, car("KL 07 AB 5678", "MA3SWIFT00000002", L(5), [line("cash", L(2), "acc-cash"), line("bank_transfer", L(3), "acc-bank")]), []);
    const prId = await svc.createPurchaseReturn(owner, { purchaseId: second.purchaseId, date: today, returnAmountPaise: L(5), deductionPaise: L(0.2), reason: "Flood damage found", notes: "", refunds: [line("bank_transfer", L(4.8), "acc-bank")] });
    ({ ds, idx } = await books());
    expect(ds.purchaseReturns.find((r) => r.id === prId)!.number).toMatch(/^DN-\d{4}-\d{4}$/);
    expect(idx.vehicles.get(second.vehicleId)).toMatchObject({ status: "returned_to_supplier" });
    expect(idx.vehicles.get(second.vehicleId)!.archivedAt).not.toBeNull();

    // ─── Reports ───
    const cashEnd = L(5) + L(2.5) - L(4) - L(2);
    const bankEnd = L(20) - L(6) + L(2) - L(0.6) - L(3) + L(4.8);
    const sales = salesReport(ds, idx, range, null);
    expect(sales).toMatchObject({ grossPaise: L(7), receivedPaise: L(7), duePaise: 0 });
    expect(Object.fromEntries(sales.byMode.map((m) => [m.method, m.amountPaise]))).toEqual({ cash: L(2.5), upi: L(2), finance: L(2.5) });

    expect(salesReturnReport(ds, idx, range, null)).toMatchObject({ returnsPaise: L(7), deductionsPaise: L(0.5), paidPaise: L(4), pendingPaise: 0, netSalesPaise: 0 });
    expect(purchaseReport(ds, idx, range, null)).toMatchObject({ amountPaise: L(11), paidPaise: L(11), payablePaise: 0 });
    expect(purchaseReturnReport(ds, idx, range, null)).toMatchObject({ returnsPaise: L(5), deductionsPaise: L(0.2), receivedPaise: L(4.8), pendingPaise: 0, netPurchasesPaise: L(6) });

    const cash = cashInHandReport(ds, range, null);
    expect(cash).toMatchObject({ openingPaise: L(5), inPaise: L(2.5), outPaise: L(4) + L(2), closingPaise: cashEnd });
    const bank = bankSummary(ds, range, null).find((b) => b.account.id === "acc-bank")!;
    expect(bank).toMatchObject({ openingPaise: L(20), inPaise: L(2) + L(4.8), outPaise: L(6) + L(0.6) + L(3), closingPaise: bankEnd });

    const out = paymentsReport(ds, idx, range, null);
    expect(out.totalPaise).toBe(L(6) + L(0.6) + L(4) + L(5));
    expect(Object.fromEntries(out.byCategory.map((c) => [c.label, c.amountPaise]))).toEqual({ "Supplier payments": L(11), "Sales return refunds": L(4), "Expense · Maintenance": L(0.6) });

    const dues = duesReport(ds, idx, today, { from: null, to: null }, null);
    expect(dues).toMatchObject({ receivablePaise: 0, payablePaise: 0, netPaise: 0 });

    const summary = balanceSummary(ds, today, null);
    expect(summary).toMatchObject({ cashPaise: cashEnd, bankPaise: bankEnd, financePaise: 0, grandTotalPaise: cashEnd + bankEnd });

    // The stored ledger is exactly what the records post: nothing drifted.
    const rebuilt = moneyEntries(await readBooks(db), indexDataset(await readBooks(db)));
    expect(ds.ledger.map((e) => [e.key, e.accountId, e.direction, e.amountPaise]).sort()).toEqual(rebuilt.map((e) => [e.key, e.accountId, e.direction, e.amountPaise]).sort());
  });

  it("tracks partial payment and a loan as receivables, then collects both later", async () => {
    const { vehicleId } = await svc.createPurchase(owner, car("KL 07 AB 9999", "MA3SWIFT00000003", L(6), [line("bank_transfer", L(6), "acc-bank")]), []);
    await expect(
      svc.completeSale(owner, { ...buyer, vehicleId, reservationId: null, saleDate: today, salePricePaise: L(7), notes: "", payments: [line("cash", L(7), "acc-cash"), line("upi", 1, "acc-bank")] }),
    ).rejects.toThrow(/exceed the sale total/);
    const saleId = await svc.completeSale(owner, {
      ...buyer, vehicleId, reservationId: null, saleDate: today, salePricePaise: L(7), notes: "",
      payments: [line("cash", L(1), "acc-cash"), line("finance", L(4), null, { lenderName: "Bajaj Finance" })],
    });
    let { ds, idx } = await books();
    let dues = duesReport(ds, idx, today, { from: null, to: null }, null);
    expect(dues.rows.map((r) => [r.kind, r.outstandingPaise])).toEqual(expect.arrayContaining([["Loan pending from lender", L(4)], ["Buyer balance", L(2)]]));
    expect(dues.receivablePaise).toBe(L(6));
    expect(saleTotals(idx.sales.get(saleId)!, idx.paymentsBySale.get(saleId)!).paymentStatus).toBe("partial");

    await svc.receivePayments(owner, saleId, { date: today, lines: [line("cash", L(0.5), "acc-cash"), line("bank_transfer", L(1.5), "acc-bank")], notes: "", receivedBy: owner.id });
    const loan = (await db.salePayments.where("saleId").equals(saleId).toArray()).find((p) => p.method === "finance")!;
    await svc.settleFinance(owner, loan.id, { date: today, accountId: "acc-bank", reference: "DISB-1" });
    ({ ds, idx } = await books());
    dues = duesReport(ds, idx, today, { from: null, to: null }, null);
    expect(dues.receivablePaise).toBe(0);
    expect(balanceSummary(ds, today, null).financePaise).toBe(0);
    expect(await balance("acc-bank")).toBe(L(20) - L(6) + L(1.5) + L(4));
  });
});

describe("branch cash and closed days", () => {
  it("keeps each branch's cash separate, refuses negative cash, and locks a closed day", async () => {
    const branchId = await svc.createBranch(owner, { name: "Thrissur", code: "TCR", address: "", phone: "", archived: false });
    const branchCash = (await db.accounts.where("branchId").equals(branchId).first())!;
    expect(branchCash.kind).toBe("cash");

    const contra = (from: string, to: string, amountPaise: number) =>
      svc.createVoucher(owner, { type: "contra", head: "transfer", date: today, amountPaise, method: "cash", accountId: from, toAccountId: to, partyName: "", partyPhone: "", reference: "", narration: "", purchaseId: null, saleId: null, handledBy: owner.id });
    await contra("acc-cash", branchCash.id, L(1));
    await expect(contra(branchCash.id, "acc-owner", L(1) + 1)).rejects.toThrow(/enough cash/);
    await contra(branchCash.id, "acc-owner", L(0.4));
    await contra(branchCash.id, "acc-bank", L(0.6));
    expect(await balance(branchCash.id)).toBe(0);
    expect(await balance("acc-owner")).toBe(L(0.4));

    const { ds, idx } = await books();
    const cash = cashInHandReport(ds, range, [branchId]);
    expect(cash.sections).toHaveLength(1);
    expect(cash).toMatchObject({ openingPaise: 0, inPaise: L(1), outPaise: L(1), closingPaise: 0 });
    expect(paymentsReport(ds, idx, range, null).byCategory).toEqual([{ label: "Cash paid to owner", amountPaise: L(0.4) }]);

    const mainBranch = (await db.branches.get("br-main"))!.id;
    const closeId = await svc.closeDay(owner, { branchId: mainBranch, date: today, counted: [{ accountId: "acc-cash", countedPaise: L(4) - 500_00 }], notes: "" });
    expect((await db.dayCloses.get(closeId))!.differencePaise).toBe(-500_00);
    await expect(
      svc.createExpense(owner, { category: "rent", amountPaise: 100_00, date: today, description: "Tea", vendor: "", paymentMethod: "cash", vehicleId: null, notes: "", accountId: "acc-cash" }),
    ).rejects.toThrow(/is closed/);
    await svc.reopenDay(owner, closeId, "Recount needed");
    await svc.createExpense(owner, { category: "rent", amountPaise: 100_00, date: today, description: "Tea", vendor: "", paymentMethod: "cash", vehicleId: null, notes: "", accountId: "acc-cash" });
  });

  it("shows older expenses without an account as Unassigned until edited", async () => {
    await db.expenses.add({ id: "old-1", reference: "EXP-2025-0001", vehicleId: null, category: "rent", amountPaise: 10_000_00, date: "2025-06-01", description: "Old rent", vendor: "", paymentMethod: "cash", notes: "", createdBy: owner.id, createdAt: "2025-06-01T10:00:00.000Z", updatedAt: "2025-06-01T10:00:00.000Z" });
    await db.meta.delete("accountingVersion");
    const { migrateAccounting } = await import("@/lib/db/migrate");
    await migrateAccounting(db);
    expect(await balance("unassigned")).toBe(-10_000_00);
    const old = (await db.expenses.get("old-1"))!;
    await svc.updateExpense(owner, old.id, { ...old, accountId: "acc-cash", paymentReference: "" });
    expect(await balance("unassigned")).toBe(0);
    expect(await balance("acc-cash")).toBe(L(5) - 10_000_00);
  });
});
