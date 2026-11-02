import type { Expense, ID, Paise, PaymentStatus, Purchase, ReturnStatus, Sale, SalePayment } from "@/types";
import { sumPaise } from "@/lib/utils/money";

/** Payment status derived purely from amounts due and received. */
export function paymentStatusFor(duePaise: Paise, receivedPaise: Paise): PaymentStatus {
  if (receivedPaise <= 0) return duePaise <= 0 ? "paid" : "unpaid";
  return receivedPaise >= duePaise ? "paid" : "partial";
}

type PurchaseAmounts = Pick<Purchase, "purchasePricePaise" | "amountPaidPaise"> &
  Partial<Pick<Purchase, "returnedPaise" | "refundReceivedPaise">>;

/** Purchase price less what purchase returns took off it. */
export function netPurchasePrice(p: PurchaseAmounts): Paise {
  return p.purchasePricePaise - (p.returnedPaise ?? 0);
}

/** Paid to the seller, less refunds the seller has given back. */
function netPaidToSeller(p: PurchaseAmounts): Paise {
  return p.amountPaidPaise - (p.refundReceivedPaise ?? 0);
}

export function purchasePaymentStatus(p: PurchaseAmounts): PaymentStatus {
  return paymentStatusFor(netPurchasePrice(p), netPaidToSeller(p));
}

/** Still owed to the seller (a payable). */
export function purchaseBalance(p: PurchaseAmounts): Paise {
  return Math.max(0, netPurchasePrice(p) - netPaidToSeller(p));
}

/** Owed back by the seller after a purchase return (a receivable). */
export function purchaseRefundDue(p: PurchaseAmounts): Paise {
  return Math.max(0, netPaidToSeller(p) - netPurchasePrice(p));
}

/** Total received for a sale is always the sum of its payment records — never a stored copy. */
export function totalReceived(saleId: ID, payments: readonly SalePayment[]): Paise {
  return sumPaise(payments.filter((p) => p.saleId === saleId).map((p) => p.amountPaise));
}

/** Part of a finance line the lender still has to pay. */
export function financePending(p: Pick<SalePayment, "method" | "amountPaise" | "adjustedPaise" | "settledOn">): Paise {
  if (p.method !== "finance" || p.settledOn) return 0;
  return Math.max(0, p.amountPaise - (p.adjustedPaise ?? 0));
}

export interface SaleTotals {
  salePricePaise: Paise;
  /** Sale price less sales returns (net of deductions). */
  netPricePaise: Paise;
  /** Every payment line, loans included. */
  receivedPaise: Paise;
  /** Still to collect from the buyer (a receivable). */
  balancePaise: Paise;
  /** Owed back to the buyer after a return (a payable). */
  refundDuePaise: Paise;
  /** Loan amounts the lender has not paid in yet. */
  financePendingPaise: Paise;
  paymentStatus: PaymentStatus;
}

type SaleAmounts = Pick<Sale, "id" | "salePricePaise"> & Partial<Pick<Sale, "returnedPaise" | "refundedPaise" | "financeAdjustedPaise">>;

export function saleTotals(sale: SaleAmounts, payments: readonly SalePayment[]): SaleTotals {
  const own = payments.filter((p) => p.saleId === sale.id);
  const receivedPaise = sumPaise(own.map((p) => p.amountPaise));
  const netPricePaise = sale.salePricePaise - (sale.returnedPaise ?? 0);
  // What the buyer has effectively paid: loans cancelled by a return and refunds handed back don't count.
  const credited = receivedPaise - (sale.financeAdjustedPaise ?? 0) - (sale.refundedPaise ?? 0);
  return {
    salePricePaise: sale.salePricePaise,
    netPricePaise,
    receivedPaise,
    balancePaise: Math.max(0, netPricePaise - credited),
    refundDuePaise: Math.max(0, credited - netPricePaise),
    financePendingPaise: sumPaise(own.map(financePending)),
    paymentStatus: paymentStatusFor(netPricePaise, credited),
  };
}

export function returnStatusOf(r: { returnStatus?: ReturnStatus }): ReturnStatus {
  return r.returnStatus ?? "none";
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
