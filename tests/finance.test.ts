import { describe, expect, it } from "vitest";
import {
  grossMarginPct,
  grossProfit,
  landedCost,
  paymentStatusFor,
  saleTotals,
  validatePayment,
  vehicleExpenseTotal,
} from "@/lib/calculations/finance";
import { formatINR, formatINRCompact, rupeesToPaise, paiseToRupeeInput } from "@/lib/utils/money";
import { paiseToWords } from "@/lib/utils/words";
import type { Expense, SalePayment } from "@/types";

const pay = (saleId: string, amountPaise: number): SalePayment => ({
  id: Math.random().toString(), saleId, receiptNumber: "", amountPaise, date: "2026-01-01", method: "cash", reference: "", notes: "",
  kind: "payment", recordedBy: "u", createdAt: "", updatedAt: "",
});
const exp = (vehicleId: string | null, amountPaise: number): Expense => ({
  id: Math.random().toString(), reference: "", vehicleId, category: vehicleId ? "repair" : "rent", amountPaise, date: "2026-01-01",
  description: "x", vendor: "", paymentMethod: "cash", notes: "", createdBy: "u", createdAt: "", updatedAt: "",
});

describe("money helpers", () => {
  it("parses rupee input to integer paise without float error", () => {
    expect(rupeesToPaise("540000")).toBe(54_000_000);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("1,23,456.78")).toBe(12_345_678);
    expect(rupeesToPaise("19.99")).toBe(1999);
    expect(rupeesToPaise("abc")).toBeNull();
    expect(rupeesToPaise("1.234")).toBeNull();
    expect(rupeesToPaise("")).toBeNull();
  });
  it("round-trips paise to input text", () => {
    expect(paiseToRupeeInput(1999)).toBe("19.99");
    expect(paiseToRupeeInput(54_000_000)).toBe("540000");
  });
  it("formats INR with Indian grouping", () => {
    expect(formatINR(54_000_000)).toBe("₹5,40,000");
    expect(formatINRCompact(1_24_00_000)).toBe("₹1.24L");
    expect(formatINRCompact(2_50_00_00_000)).toBe("₹2.5Cr");
  });
  it("spells amounts in Indian words", () => {
    expect(paiseToWords(54_000_050)).toBe("Rupees Five Lakh Forty Thousand and Fifty Paise Only");
    expect(paiseToWords(1_00_00_000_00)).toBe("Rupees One Crore Only");
  });
});

describe("payment status", () => {
  it("derives unpaid / partial / paid", () => {
    expect(paymentStatusFor(1000, 0)).toBe("unpaid");
    expect(paymentStatusFor(1000, 400)).toBe("partial");
    expect(paymentStatusFor(1000, 1000)).toBe("paid");
  });
  it("derives sale totals only from payment records", () => {
    const t = saleTotals({ id: "s1", salePricePaise: 10_000 }, [pay("s1", 3000), pay("s1", 2000), pay("other", 9999)]);
    expect(t).toEqual({ salePricePaise: 10_000, receivedPaise: 5000, balancePaise: 5000, paymentStatus: "partial" });
  });
});

describe("profit", () => {
  it("landed cost = purchase + vehicle expenses", () => {
    expect(landedCost(50_000_00, 12_000_00)).toBe(62_000_00);
  });
  it("gross profit excludes general showroom expenses", () => {
    const expenses = [exp("v1", 10_000_00), exp("v1", 2_500_00), exp(null, 85_000_00), exp("v2", 4_000_00)];
    const vehicleExp = vehicleExpenseTotal("v1", expenses);
    expect(vehicleExp).toBe(12_500_00);
    expect(grossProfit(7_00_000_00, 6_00_000_00, vehicleExp)).toBe(87_500_00);
  });
  it("computes margin percentage", () => {
    expect(grossMarginPct(87_500_00, 7_00_000_00)).toBe(12.5);
    expect(grossMarginPct(100, 0)).toBeNull();
  });
});

describe("payment validation", () => {
  it("rejects zero, negative and overpayments", () => {
    expect(validatePayment(0, 1000, "completed").ok).toBe(false);
    expect(validatePayment(-5, 1000, "completed").ok).toBe(false);
    expect(validatePayment(1001, 1000, "completed")).toMatchObject({ ok: false, reason: "exceeds_balance" });
    expect(validatePayment(1000, 1000, "completed").ok).toBe(true);
    expect(validatePayment(10, 1000, "cancelled")).toMatchObject({ ok: false, reason: "sale_cancelled" });
  });
});
