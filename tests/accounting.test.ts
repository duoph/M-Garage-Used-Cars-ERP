import { beforeEach, describe, expect, it } from "vitest";
import { DealerDatabase } from "@/lib/db/database";
import { readDataset } from "@/lib/db/dataset";
import { DEMO_USER_IDS, seedDatabase } from "./fixtures/demo-seed";
import { createDealerService } from "@/lib/services/dealer-service";
import { BusinessError, type DealerCommands } from "@/lib/repositories/contracts";
import { indexDataset, type Dataset } from "@/lib/calculations/selectors";
import { accountSummaries, moneyEntries, parties, profitAndLoss } from "@/lib/calculations/ledger";
import { paperChecks } from "@/lib/calculations/papers";
import { can } from "@/lib/permissions";
import type { VoucherInput } from "@/lib/validation/schemas";
import type { User } from "@/types";

let db: DealerDatabase;
let svc: DealerCommands;
let admin: User;
let sales: User;

async function snapshot(): Promise<Dataset> {
  return (await readDataset(db))!;
}

const voucher = (over: Partial<VoucherInput>): VoucherInput => ({
  type: "receipt", head: "other_income", date: "2026-01-10", amountPaise: 1_000_00, method: "cash", accountId: "acc-cash", toAccountId: null,
  partyName: "Someone", partyPhone: "", reference: "", narration: "", purchaseId: null, saleId: null, handledBy: DEMO_USER_IDS.admin,
  ...over,
});

beforeEach(async () => {
  db = new DealerDatabase(`acc-${Math.random()}`);
  await seedDatabase(db);
  svc = createDealerService(() => db, null);
  admin = (await db.users.get(DEMO_USER_IDS.admin))!;
  sales = (await db.users.get(DEMO_USER_IDS.sales))!;
});

describe("cash book", () => {
  it("routes cash to the cash account and everything else to the bank", async () => {
    const ds = await snapshot();
    const entries = moneyEntries(ds, indexDataset(ds));
    // Older expenses have no "Paid from" yet and stay Unassigned rather than guessing.
    for (const e of entries.filter((x) => x.method && x.source !== "expense")) expect(e.accountId).toBe(e.method === "cash" ? "acc-cash" : "acc-bank");
    expect(entries.filter((x) => x.source === "expense").every((e) => e.accountId === "unassigned")).toBe(true);
  });

  it("moves money between accounts with a contra without changing the total", async () => {
    const cash = (await db.accounts.get("acc-cash"))!;
    await svc.updateAccount(admin, cash.id, { ...cash, openingBalancePaise: 10_00_000_00, openingDate: "2025-01-01" });
    const before = await snapshot();
    const totalBefore = accountSummaries(before.accounts, moneyEntries(before, indexDataset(before))).reduce((s, a) => s + a.balancePaise, 0);
    await svc.createVoucher(admin, voucher({ type: "contra", head: "transfer", accountId: "acc-cash", toAccountId: "acc-bank", amountPaise: 5_000_00, partyName: "" }));
    const after = await snapshot();
    const sums = accountSummaries(after.accounts, moneyEntries(after, indexDataset(after)));
    expect(sums.reduce((s, a) => s + a.balancePaise, 0)).toBe(totalBefore);
    const cashBefore = accountSummaries(before.accounts, moneyEntries(before, indexDataset(before))).find((a) => a.account.id === "acc-cash")!.balancePaise;
    expect(sums.find((a) => a.account.id === "acc-cash")!.balancePaise).toBe(cashBefore - 5_000_00);
  });

  it("refuses a transfer that would take a branch's cash below zero", async () => {
    const ds = await snapshot();
    const cash = ds.ledger.filter((e) => e.accountId === "acc-cash").reduce((s, e) => s + (e.direction === "in" ? e.amountPaise : -e.amountPaise), 0);
    await expect(
      svc.createVoucher(admin, voucher({ type: "contra", head: "transfer", accountId: "acc-cash", toAccountId: "acc-owner", amountPaise: Math.max(cash, 0) + 1_00, partyName: "" })),
    ).rejects.toThrow(/enough cash/);
    expect(await db.vouchers.count()).toBe(0);
  });

  it("rejects a contra into the same account", async () => {
    await expect(svc.createVoucher(admin, voucher({ type: "contra", head: "transfer", toAccountId: "acc-cash", partyName: "" }))).rejects.toBeInstanceOf(BusinessError);
  });
});

describe("seller payments", () => {
  it("settles the purchase balance and is reversed on cancel, without double counting", async () => {
    // An unsold car, so editing its figures needs no admin correction reason.
    const vehicles = await db.vehicles.toArray();
    const owed = (await db.purchases.toArray()).find((p) => p.status === "active" && p.purchasePricePaise > p.amountPaidPaise && vehicles.find((v) => v.id === p.vehicleId)?.status !== "sold")!;
    const balance = owed.purchasePricePaise - owed.amountPaidPaise;
    const ds0 = await snapshot();
    const out0 = moneyEntries(ds0, indexDataset(ds0)).filter((e) => e.direction === "out").reduce((s, e) => s + e.amountPaise, 0);

    await expect(svc.createVoucher(admin, voucher({ type: "payment", head: "seller_payment", purchaseId: owed.id, amountPaise: balance + 1 }))).rejects.toThrow(/still owed/);
    const id = await svc.createVoucher(admin, voucher({ type: "payment", head: "seller_payment", purchaseId: owed.id, amountPaise: balance }));
    expect((await db.purchases.get(owed.id))!.amountPaidPaise).toBe(owed.purchasePricePaise);

    const ds1 = await snapshot();
    const out1 = moneyEntries(ds1, indexDataset(ds1)).filter((e) => e.direction === "out").reduce((s, e) => s + e.amountPaise, 0);
    expect(out1 - out0).toBe(balance);
    const seller = parties(ds1, indexDataset(ds1)).find((p) => p.kind === "seller" && p.lines.some((l) => l.number === owed.reference))!;
    expect(seller.lines.some((l) => l.description === "Payment to seller")).toBe(true);

    await expect(svc.updatePurchase(admin, owed.id, { ...owed, amountPaidPaise: 0 })).rejects.toThrow(/payment vouchers/);
    await svc.cancelVoucher(admin, id, "Entered by mistake");
    expect((await db.purchases.get(owed.id))!.amountPaidPaise).toBe(owed.amountPaidPaise);
  });
});

describe("profit and loss", () => {
  it("adds income vouchers and ignores capital", async () => {
    const range = { from: "2026-01-01", to: "2026-01-31" };
    const ds0 = await snapshot();
    const before = profitAndLoss(ds0, indexDataset(ds0), range);
    await svc.createVoucher(admin, voucher({ head: "commission_received", amountPaise: 2_000_00 }));
    await svc.createVoucher(admin, voucher({ head: "capital_introduced", amountPaise: 50_000_00 }));
    const ds1 = await snapshot();
    const after = profitAndLoss(ds1, indexDataset(ds1), range);
    expect(after.netProfitPaise - before.netProfitPaise).toBe(2_000_00);
  });
});

describe("access", () => {
  it("lets the office admin run vouchers and papers but not see profit", () => {
    expect(can("office", "accounts.manage")).toBe(true);
    expect(can("office", "documents.manage")).toBe(true);
    expect(can("office", "finance.viewProfit")).toBe(false);
    expect(can("sales", "accounts.view")).toBe(false);
  });

  it("refuses vouchers from sales staff", async () => {
    await expect(svc.createVoucher(sales, voucher({}))).rejects.toThrow(/permission/);
  });
});

describe("vehicle papers", () => {
  it("flags expired insurance and a pending NOC", async () => {
    const v = (await db.vehicles.toArray()).find((x) => x.status === "available")!;
    await svc.updateVehiclePapers(admin, v.id, {
      insuranceType: "comprehensive", insuranceCompany: "", insurancePolicyNumber: "", insuranceValidTill: "2020-01-01", pucValidTill: "", rcValidTill: "",
      fitnessValidTill: "", hypothecated: true, financierName: "HDFC Bank", nocReceived: false, rcInHand: true, spareKey: false, serviceRecords: false, notes: "",
    });
    const checks = paperChecks((await db.vehicles.get(v.id))!);
    expect(checks.find((c) => c.key === "insurance")?.status).toBe("expired");
    expect(checks.find((c) => c.key === "noc")?.status).toBe("expired");
  });
});
