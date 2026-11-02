import type { ID, Paise, Purchase, PurchaseReturn, ReturnRefund, Sale, SalePayment, SalesReturn } from "@/types";
import { sumPaise } from "@/lib/utils/money";
import { purchaseRefundDue, saleTotals } from "./finance";

/**
 * Return maths shared by the commands and the return forms.
 *
 * A return lowers what the sale (or purchase) is worth by `return amount − deduction`. If more has been
 * paid than it is now worth, the difference is a refund: owed to the buyer on a sales return, owed by the
 * seller on a purchase return. On a financed sale, part of the return can instead cancel the loan still
 * due from the lender, which lowers what the buyer is treated as having paid.
 */

/** Most that can still be returned: the original amount less earlier returns. */
export function returnable(originalPaise: Paise, earlier: readonly { returnAmountPaise: Paise }[]): Paise {
  return Math.max(0, originalPaise - sumPaise(earlier.map((r) => r.returnAmountPaise)));
}

export function salesReturnEffect(
  sale: Sale,
  payments: readonly SalePayment[],
  input: { returnAmountPaise: Paise; deductionPaise: Paise; financeAdjustmentPaise: Paise; vehicleReturned: boolean },
) {
  const before = saleTotals(sale, payments);
  const next: Sale = {
    ...sale,
    returnedPaise: (sale.returnedPaise ?? 0) + Math.max(0, input.returnAmountPaise - input.deductionPaise),
    financeAdjustedPaise: (sale.financeAdjustedPaise ?? 0) + input.financeAdjustmentPaise,
    returnStatus: input.vehicleReturned ? "returned" : "partial",
  };
  const after = saleTotals(next, payments);
  return { next, refundDuePaise: Math.max(0, after.refundDuePaise - before.refundDuePaise), balanceAfterPaise: after.balancePaise };
}

export function purchaseReturnEffect(purchase: Purchase, input: { returnAmountPaise: Paise; deductionPaise: Paise }) {
  const before = purchaseRefundDue(purchase);
  const next: Purchase = {
    ...purchase,
    returnedPaise: (purchase.returnedPaise ?? 0) + Math.max(0, input.returnAmountPaise - input.deductionPaise),
    returnStatus: "returned",
  };
  return { next, refundDuePaise: Math.max(0, purchaseRefundDue(next) - before) };
}

export interface ReturnRefundState {
  duePaise: Paise;
  paidPaise: Paise;
  pendingPaise: Paise;
}

export function refundState(ret: Pick<SalesReturn | PurchaseReturn, "id" | "refundDuePaise">, refundsByReturn: Map<ID, ReturnRefund[]>): ReturnRefundState {
  const paidPaise = sumPaise((refundsByReturn.get(ret.id) ?? []).map((r) => r.amountPaise));
  return { duePaise: ret.refundDuePaise, paidPaise, pendingPaise: Math.max(0, ret.refundDuePaise - paidPaise) };
}
