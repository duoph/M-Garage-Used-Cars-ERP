import type { Expense, ID, Paise, PaymentStatus, Purchase, Sale, SalePayment } from "@/types";
import { sumPaise } from "@/lib/utils/money";

/** Payment status derived purely from amounts due and received. */
export function paymentStatusFor(duePaise: Paise, receivedPaise: Paise): PaymentStatus {
  if (receivedPaise <= 0) return duePaise <= 0 ? "paid" : "unpaid";
  return receivedPaise >= duePaise ? "paid" : "partial";
}

export function purchasePaymentStatus(p: Pick<Purchase, "purchasePricePaise" | "amountPaidPaise">): PaymentStatus {
  return paymentStatusFor(p.purchasePricePaise, p.amountPaidPaise);
}

export function purchaseBalance(p: Pick<Purchase, "purchasePricePaise" | "amountPaidPaise">): Paise {
  return Math.max(0, p.purchasePricePaise - p.amountPaidPaise);
}

/** Total received for a sale is always the sum of its payment records — never a stored copy. */
export function totalReceived(saleId: ID, payments: readonly SalePayment[]): Paise {
  return sumPaise(payments.filter((p) => p.saleId === saleId).map((p) => p.amountPaise));
}

export interface SaleTotals {
  salePricePaise: Paise;
  receivedPaise: Paise;
  balancePaise: Paise;
  paymentStatus: PaymentStatus;
}

export function saleTotals(sale: Pick<Sale, "id" | "salePricePaise">, payments: readonly SalePayment[]): SaleTotals {
  const receivedPaise = totalReceived(sale.id, payments);
  return {
    salePricePaise: sale.salePricePaise,
    receivedPaise,
    balancePaise: Math.max(0, sale.salePricePaise - receivedPaise),
    paymentStatus: paymentStatusFor(sale.salePricePaise, receivedPaise),
  };
}

/** Sum of expenses directly linked to a vehicle. General showroom expenses are excluded by definition. */
export function vehicleExpenseTotal(vehicleId: ID, expenses: readonly Expense[]): Paise {
  return sumPaise(expenses.filter((e) => e.vehicleId === vehicleId).map((e) => e.amountPaise));
}

/** Landed cost = purchase price + vehicle-specific expenses. */
export function landedCost(purchasePricePaise: Paise, vehicleExpensesPaise: Paise): Paise {
  return purchasePricePaise + vehicleExpensesPaise;
}

/** Realised gross profit = sale price − purchase price − vehicle-specific expenses. */
export function grossProfit(salePricePaise: Paise, purchasePricePaise: Paise, vehicleExpensesPaise: Paise): Paise {
  return salePricePaise - purchasePricePaise - vehicleExpensesPaise;
}

/** Gross margin as a percentage of sale price, rounded to one decimal. Null when sale price is zero. */
export function grossMarginPct(profitPaise: Paise, salePricePaise: Paise): number | null {
  if (salePricePaise <= 0) return null;
  return Math.round((profitPaise / salePricePaise) * 1000) / 10;
}

export type PaymentValidation =
  | { ok: true }
  | { ok: false; reason: "not_positive" | "not_integer" | "exceeds_balance" | "sale_cancelled"; message: string };

/** Guards against negative / zero payments and silent overpayment. */
export function validatePayment(amountPaise: Paise, balancePaise: Paise, saleStatus: Sale["status"]): PaymentValidation {
  if (saleStatus !== "completed")
    return { ok: false, reason: "sale_cancelled", message: "Payments cannot be recorded against a cancelled sale." };
  if (!Number.isSafeInteger(amountPaise)) return { ok: false, reason: "not_integer", message: "Enter a valid amount." };
  if (amountPaise <= 0) return { ok: false, reason: "not_positive", message: "Amount must be greater than zero." };
  if (amountPaise > balancePaise)
    return {
      ok: false,
      reason: "exceeds_balance",
      message: "Amount exceeds the outstanding balance. Record overpayments through a correction instead.",
    };
  return { ok: true };
}
