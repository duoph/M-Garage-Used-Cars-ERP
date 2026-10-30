import { beforeEach, describe, expect, it } from "vitest";
import { DealerDatabase } from "@/lib/db/database";
import { buildDemoData, DEMO_USER_IDS, EXTRA_DEMO_VEHICLES, seedDatabase } from "./fixtures/demo-seed";
import { createDealerService } from "@/lib/services/dealer-service";
import { BusinessError, type DealerCommands } from "@/lib/repositories/contracts";
import { indexDataset, periodSummary, vehicleView, type Dataset } from "@/lib/calculations/selectors";
import type { PurchaseFormInput } from "@/lib/validation/schemas";
import type { User } from "@/types";

let db: DealerDatabase;
let svc: DealerCommands;
let admin: User;
let sales: User;
let accountant: User;

const purchaseInput = (over: Partial<PurchaseFormInput> = {}): PurchaseFormInput => ({
  make: "Tata", model: "Punch", variant: "Creative", year: 2023, registrationNumber: "KL 07 ZZ 9999", chassisNumber: "MAT123456789XYZ01",
  engineNumber: "", fuelType: "petrol", transmission: "amt", mileageKm: 12000, color: "Blue", previousOwners: 1, notes: "",
  sellerName: "Test Seller", sellerContact: "9847000000", sellerAddress: "", sellerNotes: "", purchaseDate: "2026-01-05",
  purchasePricePaise: 6_00_000_00, amountPaidPaise: 6_00_000_00, askingPricePaise: 7_00_000_00, paymentMethod: "bank_transfer", paymentReference: "", purchaseNotes: "",
  ...over,
});
const buyer = { customerName: "Anand Pillai", customerPhone: "9000000001", customerAddress: "Kochi", customerNotes: "" };

async function snapshot(): Promise<Dataset> {
  const [users, vehicles, purchases, images, customers, reservations, salesRows, payments, quotes, expenses, activity, settings] = await Promise.all([
    db.users.toArray(), db.vehicles.toArray(), db.purchases.toArray(), db.vehicleImages.toArray(), db.customers.toArray(),
    db.reservations.toArray(), db.sales.toArray(), db.salePayments.toArray(), db.quotes.toArray(), db.expenses.toArray(), db.activity.toArray(), db.settings.get("business"),
  ]);
  return { users, vehicles, purchases, images, customers, reservations, sales: salesRows, payments, quotes, expenses, activity, settings: settings! };
}

beforeEach(async () => {
  db = new DealerDatabase(`test-${Math.random()}`);
  await seedDatabase(db);
  svc = createDealerService(() => db);
  admin = (await db.users.get(DEMO_USER_IDS.admin))!;
  sales = (await db.users.get(DEMO_USER_IDS.sales))!;
  accountant = (await db.users.get(DEMO_USER_IDS.accountant))!;
});

describe("seed data", () => {
  it("is internally consistent", async () => {
    const data = buildDemoData();
    expect(data.vehicles.length).toBeGreaterThanOrEqual(20);
    const statuses = new Set(data.vehicles.map((v) => v.status));
    expect(statuses).toEqual(new Set(["available", "reserved", "sold"]));
    for (const v of data.vehicles) expect(data.purchases.find((p) => p.id === v.purchaseId)?.vehicleId).toBe(v.id);
    for (const v of data.vehicles.filter((x) => x.status === "sold"))
      expect(data.sales.filter((s) => s.vehicleId === v.id && s.status === "completed")).toHaveLength(1);
    for (const s of data.sales) {
      const paid = data.salePayments.filter((p) => p.saleId === s.id).reduce((a, p) => a + p.amountPaise, 0);
      expect(paid).toBeLessThanOrEqual(s.salePricePaise);
    }
    expect(data.salePayments.some((p) => Number.isInteger(p.amountPaise))).toBe(true);
  });

  it("includes the generated extra cars with unique registration and chassis numbers", () => {
    const data = buildDemoData();
    expect(data.vehicles).toHaveLength(22 + EXTRA_DEMO_VEHICLES);
    expect(new Set(data.vehicles.map((v) => v.registrationNumber.replace(/\s/g, ""))).size).toBe(data.vehicles.length);
    expect(new Set(data.vehicles.map((v) => v.chassisNumber)).size).toBe(data.vehicles.length);
    for (const s of data.sales) {
      const purchase = data.purchases.find((p) => p.vehicleId === s.vehicleId)!;
      expect(s.saleDate >= purchase.purchaseDate).toBe(true);
    }
  });
});

describe("purchase → inventory", () => {
  it("creates exactly one available vehicle linked to the purchase, with activity", async () => {
    const before = await db.vehicles.count();
    const { purchaseId, vehicleId } = await svc.createPurchase(admin, purchaseInput(), []);
    const v = await db.vehicles.get(vehicleId);
    const p = await db.purchases.get(purchaseId);
    expect(await db.vehicles.count()).toBe(before + 1);
    expect(v?.status).toBe("available");
    expect(v?.purchaseId).toBe(purchaseId);
    expect(p?.vehicleId).toBe(vehicleId);
    expect(p?.reference).toMatch(/^PUR-\d{4}-\d{4}$/);
    expect((await db.activity.where("entityId").anyOf(purchaseId, vehicleId).toArray()).length).toBe(2);
  });

  it("detects duplicate registration (normalised) and chassis numbers", async () => {
    await svc.createPurchase(admin, purchaseInput(), []);
    await expect(svc.createPurchase(admin, purchaseInput({ registrationNumber: "kl07zz9999", chassisNumber: "" }), [])).rejects.toThrow(/already exists/);
    await expect(svc.createPurchase(admin, purchaseInput({ registrationNumber: "KL 07 ZZ 1111" }), [])).rejects.toThrow(/chassis/);
    // Missing chassis numbers never collide with each other.
    await svc.createPurchase(admin, purchaseInput({ registrationNumber: "KL 07 ZZ 2222", chassisNumber: "" }), []);
    await svc.createPurchase(admin, purchaseInput({ registrationNumber: "KL 07 ZZ 3333", chassisNumber: "" }), []);
  });

  it("does not leave partial records when a purchase fails", async () => {
    const before = { v: await db.vehicles.count(), p: await db.purchases.count(), a: await db.activity.count() };
    await expect(svc.createPurchase(admin, purchaseInput({ registrationNumber: "KL 07 CF 4521" }), [])).rejects.toBeInstanceOf(BusinessError);
    expect({ v: await db.vehicles.count(), p: await db.purchases.count(), a: await db.activity.count() }).toEqual(before);
  });

  it("enforces permissions server-side style in the service", async () => {
    await expect(svc.createPurchase(sales, purchaseInput(), [])).rejects.toThrow(/permission/);
    await expect(svc.createExpense(sales, { category: "rent", amountPaise: 100, date: "2026-01-01", description: "Rent", vendor: "", paymentMethod: "cash", vehicleId: null, notes: "" })).rejects.toThrow(/permission/);
  });
});

describe("reservation and sale", () => {
  it("reserve → complete sale carries booking as a payment and marks the vehicle sold", async () => {
    const { vehicleId } = await svc.createPurchase(admin, purchaseInput(), []);
    const reservationId = await svc.reserveVehicle(sales, vehicleId, { ...buyer, reservationDate: "2026-01-06", bookingAmountPaise: 50_000_00, bookingMethod: "upi", bookingReference: "", notes: "" });
    expect((await db.vehicles.get(vehicleId))?.status).toBe("reserved");

    // A direct (unrelated) sale is refused while reserved.
    await expect(
      svc.completeSale(sales, { ...buyer, customerName: "Someone Else", customerPhone: "9000000002", vehicleId, reservationId: null, saleDate: "2026-01-07", salePricePaise: 6_90_000_00, amountReceivedPaise: 0, paymentMethod: "cash", paymentReference: "", notes: "" }),
    ).rejects.toThrow(/reserved for another buyer/);

    const saleId = await svc.completeSale(sales, { ...buyer, vehicleId, reservationId, saleDate: "2026-01-08", salePricePaise: 6_90_000_00, amountReceivedPaise: 4_00_000_00, paymentMethod: "bank_transfer", paymentReference: "", notes: "" });
    expect((await db.vehicles.get(vehicleId))?.status).toBe("sold");
    expect((await db.reservations.get(reservationId))?.status).toBe("converted");
    const payments = await db.salePayments.where("saleId").equals(saleId).toArray();
    expect(payments.map((p) => p.amountPaise).sort()).toEqual([4_00_000_00, 50_000_00].sort());

    // Cannot sell twice.
    await expect(
      svc.completeSale(sales, { ...buyer, vehicleId, reservationId: null, saleDate: "2026-01-09", salePricePaise: 1, amountReceivedPaise: 0, paymentMethod: "cash", paymentReference: "", notes: "" }),
    ).rejects.toThrow(/already been sold/);
  });

  it("records multiple payments and blocks overpayment", async () => {
    const { vehicleId } = await svc.createPurchase(admin, purchaseInput(), []);
    const saleId = await svc.completeSale(sales, { ...buyer, vehicleId, reservationId: null, saleDate: "2026-01-08", salePricePaise: 7_00_000_00, amountReceivedPaise: 2_00_000_00, paymentMethod: "cash", paymentReference: "", notes: "" });
    await svc.recordPayment(accountant, saleId, { amountPaise: 3_00_000_00, date: "2026-01-09", method: "upi", reference: "", notes: "" });
    await expect(svc.recordPayment(accountant, saleId, { amountPaise: 2_00_000_01, date: "2026-01-10", method: "upi", reference: "", notes: "" })).rejects.toThrow(/exceeds/);
    await svc.recordPayment(accountant, saleId, { amountPaise: 2_00_000_00, date: "2026-01-10", method: "upi", reference: "", notes: "" });
    const total = (await db.salePayments.where("saleId").equals(saleId).toArray()).reduce((a, p) => a + p.amountPaise, 0);
    expect(total).toBe(7_00_000_00);
    await expect(svc.recordPayment(accountant, saleId, { amountPaise: 1, date: "2026-01-10", method: "upi", reference: "", notes: "" })).rejects.toThrow();
  });

  it("cancelling a reservation releases the vehicle; cancelling a sale restores stock but keeps history", async () => {
    const { vehicleId } = await svc.createPurchase(admin, purchaseInput(), []);
    const r = await svc.reserveVehicle(sales, vehicleId, { ...buyer, reservationDate: "2026-01-06", bookingAmountPaise: 0, bookingMethod: "cash", bookingReference: "", notes: "" });
    await svc.cancelReservation(sales, r, "Buyer withdrew");
    expect((await db.vehicles.get(vehicleId))?.status).toBe("available");

    const saleId = await svc.completeSale(sales, { ...buyer, vehicleId, reservationId: null, saleDate: "2026-01-08", salePricePaise: 7_00_000_00, amountReceivedPaise: 1_00_000_00, paymentMethod: "cash", paymentReference: "", notes: "" });
    await expect(svc.cancelSale(sales, saleId, "Mistake entry")).rejects.toThrow(/permission/);
    await svc.cancelSale(admin, saleId, "Buyer returned the car");
    expect((await db.vehicles.get(vehicleId))?.status).toBe("available");
    expect((await db.sales.get(saleId))?.status).toBe("cancelled");
    expect(await db.salePayments.where("saleId").equals(saleId).count()).toBe(1);
  });
});

describe("expenses and profit", () => {
  it("vehicle expenses change landed cost and profit; general expenses do not", async () => {
    const { vehicleId } = await svc.createPurchase(admin, purchaseInput(), []);
    await svc.createExpense(accountant, { category: "painting", amountPaise: 15_000_00, date: "2026-01-06", description: "Repaint", vendor: "", paymentMethod: "cash", vehicleId, notes: "" });
    await svc.completeSale(sales, { ...buyer, vehicleId, reservationId: null, saleDate: "2026-01-08", salePricePaise: 7_00_000_00, amountReceivedPaise: 0, paymentMethod: "cash", paymentReference: "", notes: "" });

    let ds = await snapshot();
    let view = vehicleView(ds.vehicles.find((v) => v.id === vehicleId)!, indexDataset(ds));
    expect(view.landedCostPaise).toBe(6_15_000_00);
    expect(view.profitPaise).toBe(85_000_00);

    await svc.createExpense(accountant, { category: "rent", amountPaise: 85_000_00, date: "2026-01-08", description: "Rent", vendor: "", paymentMethod: "upi", vehicleId: null, notes: "" });
    ds = await snapshot();
    const idx = indexDataset(ds);
    view = vehicleView(ds.vehicles.find((v) => v.id === vehicleId)!, idx);
    expect(view.profitPaise).toBe(85_000_00);

    const summary = periodSummary(ds, idx, { from: "2026-01-01", to: "2026-01-31" });
    expect(summary.grossProfitPaise).toBeGreaterThanOrEqual(85_000_00);
    expect(summary.netContributionPaise).toBe(summary.grossProfitPaise - summary.operatingExpensesPaise);
  });
});

describe("users", () => {
  it("keeps at least one active admin and logs role changes", async () => {
    await expect(svc.updateUser(admin, admin.id, { name: admin.name, email: admin.email, phone: admin.phone, role: "manager", status: "active" })).rejects.toThrow(/Admin/);
    await svc.updateUser(admin, sales.id, { name: sales.name, email: sales.email, phone: sales.phone, role: "manager", status: "active" });
    expect((await db.users.get(sales.id))?.role).toBe("manager");
    expect(await db.activity.filter((a) => a.action === "user.role_changed").count()).toBe(1);
  });
});

describe("quotes", () => {
  const quoteInput = (vehicleId: string) => ({
    vehicleId, customerName: "Meera Das", customerPhone: "98950 11223", customerAddress: "Kochi",
    quoteDate: "2026-01-10", validUntil: "2026-01-25", vehiclePricePaise: 7_00_000_00,
    extras: [{ description: "Insurance", amountPaise: 18_000_00 }], discountPaise: 5_000_00, notes: "",
  });

  it("creates a quote and marks it sold when a sale is recorded from it", async () => {
    const { vehicleId } = await svc.createPurchase(admin, purchaseInput(), []);
    const quoteId = await svc.createQuote(sales, quoteInput(vehicleId));
    const quote = (await db.quotes.get(quoteId))!;
    expect(quote.reference).toMatch(/^QUO-\d{4}-\d{4}$/);
    expect(quote.customerPhone).toBe("9895011223");

    const saleId = await svc.completeSale(sales, {
      ...buyer, customerName: "Meera Das", customerPhone: "9895011223", vehicleId, reservationId: null, quoteId,
      saleDate: "2026-01-12", salePricePaise: 7_13_000_00, amountReceivedPaise: 0, paymentMethod: "cash", paymentReference: "", notes: "",
    });
    expect(await db.quotes.get(quoteId)).toMatchObject({ status: "accepted", saleId });
    await expect(svc.updateQuote(sales, quoteId, quoteInput(vehicleId))).rejects.toThrow(BusinessError);
  });

  it("rejects a discount larger than the total, and sold cars", async () => {
    const { vehicleId } = await svc.createPurchase(admin, purchaseInput(), []);
    await expect(svc.createQuote(sales, { ...quoteInput(vehicleId), discountPaise: 8_00_000_00 })).rejects.toThrow("Discount cannot exceed the total");
    const sold = (await db.vehicles.where("status").equals("sold").first())!;
    await expect(svc.createQuote(sales, quoteInput(sold.id))).rejects.toThrow("no longer in stock");
  });

  it("only lets sales staff change their own quotes", async () => {
    const { vehicleId } = await svc.createPurchase(admin, purchaseInput(), []);
    const quoteId = await svc.createQuote(admin, quoteInput(vehicleId));
    await expect(svc.setQuoteStatus(sales, quoteId, "declined")).rejects.toThrow("your own quotes");
    await svc.setQuoteStatus(admin, quoteId, "declined");
    expect((await db.quotes.get(quoteId))?.status).toBe("declined");
  });
});

describe("staff access and designations", () => {
  it("lets an admin give one person custom access, and reset it", async () => {
    const base = { name: sales.name, email: sales.email, phone: sales.phone, role: sales.role, status: sales.status };
    await svc.updateUser(admin, sales.id, { ...base, permissions: ["inventory.view", "sales.view", "finance.viewCost"] });
    let user = (await db.users.get(sales.id))!;
    expect(user.permissions).toEqual(["inventory.view", "sales.view", "finance.viewCost"]);
    expect((await db.activity.toArray()).some((a) => a.action === "user.access_changed")).toBe(true);

    // The custom list is now enforced by the service, not just the UI.
    await expect(svc.createExpense(user, { category: "rent", amountPaise: 100, date: "2026-01-05", description: "x", vendor: "", paymentMethod: "cash", notes: "", vehicleId: null })).rejects.toThrow(BusinessError);

    // Saving without touching access keeps it.
    await svc.updateUser(admin, sales.id, { ...base, name: "Rahul V" });
    expect((await db.users.get(sales.id))!.permissions).toHaveLength(3);

    await svc.updateUser(admin, sales.id, { ...base, permissions: null });
    user = (await db.users.get(sales.id))!;
    expect(user.permissions).toBeNull();
  });

  it("stores a list equal to the defaults as defaults, and ignores custom access for admins", async () => {
    const base = { name: accountant.name, email: accountant.email, phone: accountant.phone, role: accountant.role, status: accountant.status };
    const { ROLE_PERMISSIONS } = await import("@/lib/permissions");
    await svc.updateUser(admin, accountant.id, { ...base, permissions: [...ROLE_PERMISSIONS.accountant] });
    expect((await db.users.get(accountant.id))!.permissions).toBeNull();
    await svc.updateUser(admin, accountant.id, { ...base, role: "admin", permissions: ["inventory.view"] });
    expect((await db.users.get(accountant.id))!.permissions).toBeNull();
  });

  it("only staff managers can change access or designations", async () => {
    const base = { name: sales.name, email: sales.email, phone: sales.phone, role: sales.role, status: sales.status };
    await expect(svc.updateUser(accountant, sales.id, { ...base, permissions: ["users.manage"] })).rejects.toThrow(BusinessError);
    await expect(svc.setDesignations(sales, ["Boss"])).rejects.toThrow(BusinessError);
  });

  it("keeps a clean designation list and stores a person's designation", async () => {
    await svc.setDesignations(admin, [" Showroom Manager ", "Driver", "Driver", ""]);
    expect((await db.settings.get("business"))!.designations).toEqual(["Showroom Manager", "Driver"]);
    await svc.updateUser(admin, sales.id, { name: sales.name, email: sales.email, phone: sales.phone, role: sales.role, status: sales.status, designation: "Driver" });
    expect((await db.users.get(sales.id))!.designation).toBe("Driver");
  });

  it("saves the invoice template", async () => {
    await svc.setInvoiceTemplate(admin, "modern");
    expect((await db.settings.get("business"))!.invoiceTemplate).toBe("modern");
    await expect(svc.setInvoiceTemplate(sales, "bold")).rejects.toThrow(BusinessError);
  });
});
