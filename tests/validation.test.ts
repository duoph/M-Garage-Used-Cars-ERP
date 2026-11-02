import { describe, expect, it } from "vitest";
import { expenseSchema, makeSaleSchema, purchaseFormSchema, registrationNumber } from "@/lib/validation/schemas";
import { formatRegistration, normalizeRegistration } from "@/lib/utils/ids";

const validPurchase = {
  make: "Hyundai", model: "Creta", variant: "SX", year: 2021, registrationNumber: "KL 07 CD 4521", chassisNumber: "MALC381CLLM112233",
  engineNumber: "", fuelType: "diesel", transmission: "manual", mileageKm: 40000, color: "White", previousOwners: 1, notes: "",
  sellerName: "Thomas", sellerContact: "98470 12345", sellerAddress: "", sellerNotes: "", purchaseDate: "2026-01-10",
  purchasePricePaise: 10_00_000_00, amountPaidPaise: 5_00_000_00, askingPricePaise: 12_00_000_00, paymentMethod: "upi", paymentReference: "", purchaseNotes: "",
};

describe("registration numbers", () => {
  it("accepts standard and BH formats", () => {
    for (const r of ["KL 07 CD 4521", "kl07cd4521", "KA-03-MN-6612", "22 BH 1234 AA", "DL 3C AB 1234"]) expect(registrationNumber.safeParse(r).success, r).toBe(true);
  });
  it("rejects junk", () => {
    for (const r of ["", "HELLO", "1234"]) expect(registrationNumber.safeParse(r).success, r).toBe(false);
  });
  it("normalises for duplicate detection and formats for display", () => {
    expect(normalizeRegistration("kl 07 cd-4521")).toBe("KL07CD4521");
    expect(formatRegistration("kl07cd4521")).toBe("KL 07 CD 4521");
  });
});

describe("purchase form", () => {
  it("accepts a valid purchase", () => {
    expect(purchaseFormSchema.safeParse(validPurchase).success).toBe(true);
  });
  it("rejects amount paid above purchase price with a field error", () => {
    const r = purchaseFormSchema.safeParse({ ...validPurchase, amountPaidPaise: 11_00_000_00 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["amountPaidPaise"]);
  });
  it("rejects invalid phone, future dates and missing fields", () => {
    expect(purchaseFormSchema.safeParse({ ...validPurchase, sellerContact: "12345" }).success).toBe(false);
    expect(purchaseFormSchema.safeParse({ ...validPurchase, purchaseDate: "2999-01-01" }).success).toBe(false);
    expect(purchaseFormSchema.safeParse({ ...validPurchase, make: "" }).success).toBe(false);
    expect(purchaseFormSchema.safeParse({ ...validPurchase, purchasePricePaise: 0 }).success).toBe(false);
  });
});

describe("sale form", () => {
  const sale = {
    vehicleId: "v1", reservationId: null, customerName: "Anand", customerPhone: "9847012345", customerAddress: "", customerNotes: "",
    saleDate: "2026-01-10", salePricePaise: 100_000, amountReceivedPaise: 50_000, paymentMethod: "cash", paymentReference: "", notes: "",
  };
  it("prevents total received exceeding the sale price (including booking)", () => {
    expect(makeSaleSchema(0).safeParse(sale).success).toBe(true);
    expect(makeSaleSchema(60_000).safeParse(sale).success).toBe(false);
    expect(makeSaleSchema(50_000).safeParse(sale).success).toBe(true);
  });
});

describe("expense form", () => {
  const base = { accountId: "acc-cash", category: "repair", amountPaise: 5000, date: "2026-01-10", description: "Bumper", vendor: "", paymentMethod: "cash", vehicleId: "v1", notes: "" };
  it("requires a vehicle for vehicle categories", () => {
    expect(expenseSchema.safeParse(base).success).toBe(true);
    expect(expenseSchema.safeParse({ ...base, vehicleId: null }).success).toBe(false);
  });
  it("forbids linking a general category to a vehicle", () => {
    expect(expenseSchema.safeParse({ ...base, category: "rent" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, category: "rent", vehicleId: null }).success).toBe(true);
  });
});
